import type {Hex} from "viem";

import {toCaip19} from "../caip.js";
import {normaliseEndpoint, parseAgentRegistry, type EndpointBinding} from "../handshake.js";
import {SAME_AS} from "../sources/intuition/terms.js";
import {canonicalCaipThing, thingUri} from "./agent-atom.js";
import {IdentityTermHasNoPositionError} from "./identity-plan.js";
import {
    atomDataForUri,
    encodeCreateAtom,
    encodeCreateTriples,
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
 * **The plan takes the binding, not its parts.** The endpoint is read off it, and the agent atom
 * must carry the `same as` edge to the binding's own ERC-8004 id, so a plan cannot attach one
 * agent's handshake to another agent's claim. The directory refuses that pairing on read anyway
 * (ADR `0095` §7); refusing it here keeps the fee from being spent on a claim that reads `invalid`.
 * The document URI is still the caller's word: its CID depends on how the pinning service encodes,
 * and a URI that is not this binding's document reads `invalid` or `unreadable`, never `bound`.
 *
 * **The two triples travel as one call** (ADR `0095` §7). `calls` holds at most three: the
 * endpoint atom, the document atom, then one `createTriples` carrying the binding triple and its
 * context triple together, so whoever submits the plan sends both in one transaction. A submitter
 * that can batch further — task 40's sponsoring service — may put the atoms in that transaction
 * too; the triples are the pair that must not be split.
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
    /** In execution order. One call creates whichever triples are missing — both at once, when both are. */
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

/** The agent atom does not name the agent the binding is for. */
export class AgentAtomMismatchError extends Error {
    readonly agentAtom: Hex;
    readonly caip19: string;

    constructor(agentAtom: Hex, caip19: string) {
        super(
            `agent atom ${agentAtom} has no \`same as\` edge to ${caip19}, the agent this binding ` +
                "was signed for. Attaching it there would put one agent's handshake on another's claim.",
        );
        this.name = "AgentAtomMismatchError";
        this.agentAtom = agentAtom;
        this.caip19 = caip19;
    }
}

export async function prepareEndpointBinding(params: {
    reads: MultiVaultReads;
    agentAtom: Hex;
    /** The verified binding, as `createHandshakeVerifier` returned it. Its endpoint is the claim's. */
    binding: EndpointBinding;
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
    const {reads, binding} = params;
    const endpoint = binding.endpoint;
    if (normaliseEndpoint(endpoint) !== endpoint) {
        throw new Error(`the binding's endpoint is not normalised: ${endpoint}`);
    }
    const registry = parseAgentRegistry(binding.agentRegistry);
    if (registry === null || !/^(0|[1-9][0-9]*)$/.test(binding.agentId)) {
        throw new Error(
            `the binding names no ERC-8004 agent: ${binding.agentRegistry} / ${binding.agentId}`,
        );
    }
    const caip19 = toCaip19({
        chainId: registry.chainId,
        registry: registry.registry,
        tokenId: binding.agentId,
    });
    const caipAtom = await reads.atomId(atomDataForUri(thingUri(canonicalCaipThing(caip19))));
    const sameAsTriple = await reads.tripleId(params.agentAtom, SAME_AS, caipAtom);
    const endpointData = atomDataForUri(endpoint);
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
        sameAsExists,
        endpointExists,
        documentExists,
        bindingExists,
        contextExists,
        atomCost,
        tripleCost,
        minDeposit,
    ] = await Promise.all([
        reads.termExists(params.agentAtom),
        reads.termExists(sameAsTriple),
        reads.termExists(endpointAtom),
        reads.termExists(documentAtom),
        reads.termExists(bindingTriple),
        reads.termExists(contextTriple),
        reads.atomCost(),
        reads.tripleCost(),
        reads.minDeposit(),
    ]);
    if (!agentExists) throw new MissingAgentAtomError(params.agentAtom);
    if (!sameAsExists) throw new AgentAtomMismatchError(params.agentAtom, caip19);

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
            why: `the endpoint's atom, ${endpoint}`,
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
    // **Both triples in one call, the binding first.** The context triple names the binding triple
    // as its object, and `createTriples` creates its members in order, so the pair is one atomic
    // call and the binding is never on chain without its proof. Measured on testnet 13579 by
    // `scripts/measure/nested-triple-batch.ts` (2026-10-30, `eth_call` only): inner-then-outer in
    // one call succeeds, outer-then-inner reverts, and the outer triple alone reverts.
    //
    // Two calls would leave a window: the binding triple is public the moment it lands, and anyone
    // watching can attach junk contexts that predate the genuine proof and crowd it out of the
    // directory's read (ADR `0095` §7). One call is one transaction for **any** submitter — a
    // wallet, a delegation redemption, or task 40's sponsoring service — so the plan closes the
    // window rather than leaving it to the submitter's care.
    const triples: {
        item: {subjectId: Hex; predicateId: Hex; objectId: Hex; assets: bigint};
        termId: Hex;
        why: string;
    }[] = [];
    if (!bindingExists) {
        triples.push({
            item: {
                subjectId: params.agentAtom,
                predicateId: params.predicates.hasEndpoint,
                objectId: endpointAtom,
                assets: tripleAssets,
            },
            termId: bindingTriple,
            why: `the agent has endpoint ${endpoint}`,
        });
    }
    if (!contextExists) {
        triples.push({
            item: {
                subjectId: documentAtom,
                predicateId: params.predicates.inContextOf,
                objectId: bindingTriple,
                assets: tripleAssets,
            },
            termId: contextTriple,
            why: "the owner's signed handshake, attached to that claim",
        });
    }
    if (triples.length > 0) {
        // Every member is previewed, so a term born with no position is refused whichever it is.
        // The call carries one preview; members are priced alike, so the first stands for them.
        const previews = [];
        for (const triple of triples) {
            previews.push(await preview("triple", triple.termId, triple.item.assets));
        }
        calls.push({
            ...base,
            kind: "create-triple",
            value: triples.reduce((sum, triple) => sum + triple.item.assets, 0n),
            data: encodeCreateTriples(triples.map((triple) => triple.item)),
            why: triples.map((triple) => triple.why).join(", and "),
            preview: previews[0],
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
