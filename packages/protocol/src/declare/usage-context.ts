import {stringToHex, type Address, type Hex} from "viem";

import {encodeCreateAtom, encodeCreateTriple, encodeDeposit, type MultiVaultReads} from "./multivault.js";
import type {PreparedCall} from "./types.js";

/**
 * What a `uses` declaration can be qualified with: where it happened and how it went (task 63, ADR
 * `0135`). Like every plan in this package it signs nothing and sends nothing (ADR `0038`).
 *
 * Form B (ADR `0138`): each line is about the one before, so an outcome belongs to its domain and
 * a reason to its outcome. A declaration can stop at any level.
 *
 * ```
 * T1 = (agent, uses, skill)
 * T2 = (T1, in context of, video)
 * T3 = (T2, has outcome, failed)
 * T4 = (T3, because, missing-key)
 * ```
 *
 * With no domain, the outcome is about T1 itself.
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

/** Why a use failed. Closed for the same reason as the outcomes (ADR `0138`). */
export const USAGE_REASONS = ["missing-key", "missing-program", "missing-file", "not-the-right-tool"] as const;
export type UsageReason = (typeof USAGE_REASONS)[number];
export const BECAUSE_LABEL = "because";

export type UsageContextRefusal = {
    status: "refused";
    rule: "nothing_to_add" | "not_declared" | "unknown_domain" | "reason_without_failure";
    detail: string;
};

export type UsageContextPlan = {
    status: "planned";
    chainId: number;
    contextTripleId: Hex | null;
    outcomeTripleId: Hex | null;
    reasonTripleId: Hex | null;
    calls: PreparedCall[];
    /**
     * Qualifiers already on chain, which this plan does not create. Without a `declarer` nobody can
     * say this wallet stands behind them, so a caller has to tell the agent: a line somebody else
     * wrote first is not the agent's word until it holds a position on it.
     */
    alreadyWritten: Hex[];
    totalValue: bigint;
};

export function isUsageOutcome(value: unknown): value is UsageOutcome {
    return USAGE_OUTCOMES.some((outcome) => outcome === value);
}

export function isUsageReason(value: unknown): value is UsageReason {
    return USAGE_REASONS.some((reason) => reason === value);
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
    /** Only with `outcome: "failed"`. */
    reason?: UsageReason;
    /** The predicate this chain's other nested claims use. Read from the deployment record. */
    inContextOf: Hex;
    /** Whether a label is a category under `tool`, read from the index. */
    isCategory(label: string): Promise<boolean>;
    /**
     * The wallet that will sign. Given, a qualifier somebody else already wrote gets a `minDeposit`
     * deposit from it, so an earlier writer cannot silence the declarer (`intuition-integrator`, task 63).
     */
    declarer?: Address;
    /** `declarer` did not write this edge, so it deposits on it to declare the use (ADR `0138`). */
    declarerDidNotWriteEdge?: boolean;
    reads: MultiVaultReads;
}): Promise<UsageContextPlan | UsageContextRefusal> {
    const {reads} = params;
    const domain = params.domain?.trim().toLowerCase();
    if (params.reason !== undefined && params.outcome !== "failed") {
        return {status: "refused", rule: "reason_without_failure", detail: "a reason only follows a failure"};
    }
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
    const alreadyWritten: Hex[] = [];
    const curve = await reads.defaultCurveId();

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

    const triple = async (subject: Hex, predicate: Hex, object: Hex, why: string): Promise<Hex> => {
        const id = await reads.tripleId(subject, predicate, object);
        if (!(await reads.termExists(id))) {
            calls.push({
                kind: "create-triple",
                chainId: reads.chainId,
                to: reads.address,
                value: tripleAssets,
                data: encodeCreateTriple(subject, predicate, object, tripleAssets),
                why,
            });
        } else {
            alreadyWritten.push(id);
            if (params.declarer !== undefined && (await reads.sharesOf(params.declarer, id, curve)) === 0n) {
                calls.push({
                    kind: "deposit",
                    chainId: reads.chainId,
                    to: reads.address,
                    value: stake,
                    data: encodeDeposit(params.declarer, id, curve, 0n),
                    why: `${why}: already written, so stand behind it`,
                });
            }
        }
        return id;
    };

    if (params.declarerDidNotWriteEdge === true && params.declarer !== undefined && (await reads.sharesOf(params.declarer, params.usesTripleId, curve)) === 0n) {
        calls.push({
            kind: "deposit",
            chainId: reads.chainId,
            to: reads.address,
            value: stake,
            data: encodeDeposit(params.declarer, params.usesTripleId, curve, 0n),
            why: "another wallet wrote this use, so deposit on it to declare it too",
        });
    }

    let contextTripleId: Hex | null = null;
    if (domain !== undefined) {
        const domainId = await atom(domain, `the category "${domain}"`);
        contextTripleId = await triple(params.usesTripleId, params.inContextOf, domainId, `say this use was in "${domain}"`);
    }
    let outcomeTripleId: Hex | null = null;
    if (params.outcome !== undefined) {
        const predicate = await atom(HAS_OUTCOME_LABEL, `the word "${HAS_OUTCOME_LABEL}"`);
        const outcomeId = await atom(params.outcome, `the word "${params.outcome}"`);
        outcomeTripleId = await triple(contextTripleId ?? params.usesTripleId, predicate, outcomeId, `say this use ${params.outcome}`);
    }
    let reasonTripleId: Hex | null = null;
    if (params.reason !== undefined && outcomeTripleId !== null) {
        const predicate = await atom(BECAUSE_LABEL, `the word "${BECAUSE_LABEL}"`);
        const reasonId = await atom(params.reason, `the word "${params.reason}"`);
        reasonTripleId = await triple(outcomeTripleId, predicate, reasonId, `say it failed because of ${params.reason}`);
    }
    return {
        status: "planned",
        chainId: reads.chainId,
        contextTripleId,
        outcomeTripleId,
        reasonTripleId,
        calls,
        alreadyWritten,
        totalValue: calls.reduce((sum, call) => sum + call.value, 0n),
    };
}
