import {stringToHex, type Hex} from "viem";

import {encodeCreateAtom, encodeCreateTriple, type MultiVaultReads} from "./multivault.js";
import type {PreparedCall} from "./types.js";

/**
 * What a `uses` declaration can be qualified with: where it happened and how it went (task 63, ADR
 * `0135`). Like every plan in this package it signs nothing and sends nothing (ADR `0038`).
 *
 * ```
 * ((agent, uses, skill), in context of, video)
 * ((agent, uses, skill), has outcome, failed)
 * ```
 *
 * **The vocabulary is closed on purpose.** A domain must already be a category and an outcome one
 * of two words: on a graph that deletes nothing, free text fragments for ever. Never the text of a
 * request, which would publish what somebody was doing.
 *
 * **An outcome is one agent's word, and it paid to say it.** ARP gives no verdict on a tool (ADR
 * `0049`), and whoever reads this reads who wrote it.
 */
export const USAGE_OUTCOMES = ["worked", "failed"] as const;
export type UsageOutcome = (typeof USAGE_OUTCOMES)[number];

/** A plain string, so its id follows from the word and is the same on every chain. */
export const HAS_OUTCOME_LABEL = "has outcome";

export type UsageContextRefusal = {
    status: "refused";
    rule: "nothing_to_add" | "not_declared" | "unknown_domain";
    detail: string;
};

export type UsageContextPlan = {
    status: "planned";
    chainId: number;
    contextTripleId: Hex | null;
    outcomeTripleId: Hex | null;
    calls: PreparedCall[];
    totalValue: bigint;
};

export function isUsageOutcome(value: unknown): value is UsageOutcome {
    return USAGE_OUTCOMES.some((outcome) => outcome === value);
}

/**
 * Plan the qualifiers for one `uses` edge.
 *
 * `edgePlanned` says the edge is created earlier in the same plan, so it does not exist yet. Without
 * it a missing edge is refused, because a triple about a term that is not there reverts.
 */
export async function prepareUsageContext(params: {
    usesTripleId: Hex;
    edgePlanned?: boolean;
    domain?: string;
    outcome?: UsageOutcome;
    /** The predicate this chain's other nested claims use. Read from the deployment record. */
    inContextOf: Hex;
    /** Whether a label is a category under `tool`, read from the index. */
    isCategory(label: string): Promise<boolean>;
    reads: MultiVaultReads;
}): Promise<UsageContextPlan | UsageContextRefusal> {
    const {reads} = params;
    const domain = params.domain?.trim().toLowerCase();
    if (domain === undefined && params.outcome === undefined) {
        return {status: "refused", rule: "nothing_to_add", detail: "give a domain or an outcome"};
    }
    if (params.edgePlanned !== true && !(await reads.termExists(params.usesTripleId))) {
        return {status: "refused", rule: "not_declared", detail: "this use is not declared yet"};
    }
    if (domain !== undefined && !(await params.isCategory(domain))) {
        return {status: "refused", rule: "unknown_domain", detail: `"${domain}" is not a category under tool`};
    }

    const [atomCost, tripleCost, stake] = await Promise.all([reads.atomCost(), reads.tripleCost(), reads.minDeposit()]);
    const atomAssets = atomCost + stake;
    const tripleAssets = tripleCost + stake;
    const calls: PreparedCall[] = [];

    const atom = async (label: string, why: string): Promise<Hex> => {
        const data = stringToHex(label);
        const id = await reads.atomId(data);
        if (!(await reads.termExists(id)) && !calls.some((call) => call.data === encodeCreateAtom(data, atomAssets))) {
            calls.push({
                kind: "create-atom",
                chainId: reads.chainId,
                to: reads.address,
                value: atomAssets,
                data: encodeCreateAtom(data, atomAssets),
                why,
            });
        }
        return id;
    };

    const triple = async (predicate: Hex, object: Hex, why: string): Promise<Hex> => {
        const id = await reads.tripleId(params.usesTripleId, predicate, object);
        if (!(await reads.termExists(id))) {
            calls.push({
                kind: "create-triple",
                chainId: reads.chainId,
                to: reads.address,
                value: tripleAssets,
                data: encodeCreateTriple(params.usesTripleId, predicate, object, tripleAssets),
                why,
            });
        }
        return id;
    };

    let contextTripleId: Hex | null = null;
    if (domain !== undefined) {
        const domainId = await atom(domain, `the category "${domain}"`);
        contextTripleId = await triple(params.inContextOf, domainId, `say this use was in "${domain}"`);
    }
    let outcomeTripleId: Hex | null = null;
    if (params.outcome !== undefined) {
        const predicate = await atom(HAS_OUTCOME_LABEL, `the word "${HAS_OUTCOME_LABEL}"`);
        const outcomeId = await atom(params.outcome, `the word "${params.outcome}"`);
        outcomeTripleId = await triple(predicate, outcomeId, `say this use ${params.outcome}`);
    }
    return {
        status: "planned",
        chainId: reads.chainId,
        contextTripleId,
        outcomeTripleId,
        calls,
        totalValue: calls.reduce((sum, call) => sum + call.value, 0n),
    };
}
