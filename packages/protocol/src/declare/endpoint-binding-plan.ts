import type {Hex} from "viem";

import {IdentityTermHasNoPositionError} from "./identity-plan.js";
import {
    atomDataForUri,
    encodeCreateAtom,
    encodeCreateTriple,
    type MultiVaultReads,
} from "./multivault.js";
import type {PreparedCall} from "./types.js";

/**
 * The binding on Intuition, as a plan (task 39c): anyone can find an agent's endpoint and re-check
 * the owner's signature against the registry without asking ARP.
 *
 * ```
 * (agent identity atom)  has endpoint   (endpoint atom)          the binding triple
 * (binding document)     in context of  (the binding triple)     the proof, nested
 * ```
 *
 * The document is {@link endpointBindingDocument}, pinned to IPFS by the caller: this plan takes
 * its `ipfs://` URI and never pins. Same shape as a delegation's publication (ADR `0092`): a
 * document attached by `in context of` to the triple it is about.
 *
 * **The predicates are parameters, not constants.** Read from the graph before anything was
 * minted (`portability.md`, `scripts/measure/endpoint-predicate.ts`); the ids on testnet 13579 are
 * recorded in `data/deployments/13579.json` under `arp.endpointBinding`.
 *
 * **Plans, never signs** (ADR `0038`). The operator's wallet or ARP's sponsoring service signs it.
 */
export type EndpointBindingPlan = {
    endpointAtom: Hex;
    documentAtom: Hex;
    /** `(agent, has endpoint, endpoint)`. */
    bindingTriple: Hex;
    /** `(document, in context of, binding triple)`. */
    contextTriple: Hex;
    existing: {
        endpointAtom: boolean;
        documentAtom: boolean;
        bindingTriple: boolean;
        contextTriple: boolean;
    };
    calls: PreparedCall[];
    totalValue: bigint;
    chainId: number;
};

/** The agent's identity atom is not on this chain, so there is nothing to bind an endpoint to. */
export class MissingAgentAtomError extends Error {
    readonly agentAtom: Hex;

    constructor(agentAtom: Hex) {
        super(
            `agent atom ${agentAtom} does not exist on this chain. Write it first with ` +
                "`prepareIdentityAtom`; a binding triple on a missing subject reverts.",
        );
        this.name = "MissingAgentAtomError";
        this.agentAtom = agentAtom;
    }
}

export async function prepareEndpointBinding(params: {
    reads: MultiVaultReads;
    agentAtom: Hex;
    /** The normalised endpoint the binding names. */
    endpoint: string;
    /** `ipfs://<cid>` of the pinned binding document. */
    documentUri: string;
    predicates: {hasEndpoint: Hex; inContextOf: Hex};
    /** The deposit every created term is born with. Defaults to the chain's `minDeposit`. */
    birthDeposit?: bigint;
}): Promise<EndpointBindingPlan> {
    if (!params.documentUri.startsWith("ipfs://")) {
        throw new Error(
            `the binding document must be pinned: expected ipfs://, got ${params.documentUri}`,
        );
    }
    const {reads} = params;
    const endpointData = atomDataForUri(params.endpoint);
    const documentData = atomDataForUri(params.documentUri);
    const [endpointAtom, documentAtom] = await Promise.all([
        reads.atomId(endpointData),
        reads.atomId(documentData),
    ]);
    const bindingTriple = await reads.tripleId(
        params.agentAtom,
        params.predicates.hasEndpoint,
        endpointAtom,
    );
    const contextTriple = await reads.tripleId(
        documentAtom,
        params.predicates.inContextOf,
        bindingTriple,
    );

    const [
        agentExists,
        endpointExists,
        documentExists,
        bindingExists,
        contextExists,
        atomCost,
        tripleCost,
        minDeposit,
    ] = await Promise.all([
        reads.termExists(params.agentAtom),
        reads.termExists(endpointAtom),
        reads.termExists(documentAtom),
        reads.termExists(bindingTriple),
        reads.termExists(contextTriple),
        reads.atomCost(),
        reads.tripleCost(),
        reads.minDeposit(),
    ]);
    if (!agentExists) throw new MissingAgentAtomError(params.agentAtom);

    const birth = params.birthDeposit ?? minDeposit;
    const atomAssets = atomCost + birth;
    const tripleAssets = tripleCost + birth;
    const preview = async (what: "atom" | "triple", termId: Hex, assets: bigint) => {
        const read =
            what === "atom"
                ? await reads.previewAtomCreate(termId, assets)
                : await reads.previewTripleCreate(termId, assets);
        if (read.shares === 0n && params.birthDeposit !== 0n) {
            throw new IdentityTermHasNoPositionError(what, termId, assets);
        }
        return {shares: read.shares, assetsAfterFees: read.assetsAfterFees};
    };

    const base = {chainId: reads.chainId, to: reads.address} as const;
    const calls: PreparedCall[] = [];
    if (!endpointExists) {
        calls.push({
            ...base,
            kind: "create-atom",
            value: atomAssets,
            data: encodeCreateAtom(endpointData, atomAssets),
            why: `the endpoint's atom, ${params.endpoint}`,
            preview: await preview("atom", endpointAtom, atomAssets),
        });
    }
    if (!documentExists) {
        calls.push({
            ...base,
            kind: "create-atom",
            value: atomAssets,
            data: encodeCreateAtom(documentData, atomAssets),
            why: `the signed handshake, pinned at ${params.documentUri}`,
            preview: await preview("atom", documentAtom, atomAssets),
        });
    }
    // The binding triple before the context triple: the second names the first as its object, and
    // `createTriples` reverts on a term that does not exist yet.
    if (!bindingExists) {
        calls.push({
            ...base,
            kind: "create-triple",
            value: tripleAssets,
            data: encodeCreateTriple(
                params.agentAtom,
                params.predicates.hasEndpoint,
                endpointAtom,
                tripleAssets,
            ),
            why: `the agent has endpoint ${params.endpoint}`,
            preview: await preview("triple", bindingTriple, tripleAssets),
        });
    }
    if (!contextExists) {
        calls.push({
            ...base,
            kind: "create-triple",
            value: tripleAssets,
            data: encodeCreateTriple(
                documentAtom,
                params.predicates.inContextOf,
                bindingTriple,
                tripleAssets,
            ),
            why: "the owner's signed handshake, attached to that claim",
            preview: await preview("triple", contextTriple, tripleAssets),
        });
    }

    return {
        endpointAtom,
        documentAtom,
        bindingTriple,
        contextTriple,
        existing: {
            endpointAtom: endpointExists,
            documentAtom: documentExists,
            bindingTriple: bindingExists,
            contextTriple: contextExists,
        },
        calls,
        totalValue: calls.reduce((sum, call) => sum + call.value, 0n),
        chainId: reads.chainId,
    };
}
