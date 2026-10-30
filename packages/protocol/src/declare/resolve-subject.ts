import type {Hex} from "viem";

import {resolveRef, toCaip19} from "../caip.js";
import {intuitionSource} from "../sources/intuition/index.js";
import type {TrustSource} from "../sources/source.js";
import type {AgentRef} from "../types.js";
import {NoAgentIdentityError, asAgentIdentityAtom} from "../verify/subject.js";
import type {AgentIdentityAtom} from "../verify/subject.js";

/**
 * The atom a `uses` edge must carry as its subject, resolved from an ERC-8004 identity.
 *
 * This is the step a third party cannot skip and would not guess. ADR `0032`: the subject is the
 * **registration-derived** atom, reached from the agent's CAIP-19 through `same as`. Writing the
 * edge on the operating wallet's `caip10:` atom works, costs the same, and is invisible both to
 * `getCapabilities` and to anyone following Intuition's partner guide — 21 such triples already
 * exist on testnet, and Intuition has no deletion.
 *
 * It needs no key and no credential: the mirrored cohort's identity atoms already exist, so this
 * is a graph read.
 *
 * @throws NoAgentIdentityError when the identity has no atom on the graph. Deliberately an error
 *         and not a fallback, because the fallback is the permanent mistake above. The remedy is
 *         ADR `0027` — mint the agent into the canonical registry first.
 */
export async function resolveDeclarationSubject(params: {
    agent: AgentRef;
    /** Defaults to the Intuition source. Injected in tests, and swappable per `TrustSource`. */
    source?: TrustSource;
    graphqlUrl?: string;
}): Promise<AgentIdentityAtom> {
    const ref = resolveRef(params.agent);
    const caip19 = toCaip19(ref);
    const source =
        params.source ??
        intuitionSource(params.graphqlUrl === undefined ? {} : {graphqlUrl: params.graphqlUrl});

    const identity = await source.resolveAgent(ref);
    if (identity === null) throw new NoAgentIdentityError(caip19);
    // `sourceHandle` is the graph's `term_id`, which is a 0x-prefixed 32-byte string by the
    // indexer's own schema; `AgentIdentity` types it as `string` because not every source is a
    // graph. `asAgentIdentityAtom` is the guard that matters here, and it checks the CAIP-19.
    return asAgentIdentityAtom(identity.sourceHandle as Hex, caip19);
}

/** An identity atom when exactly one atom claims the identity, and why not otherwise. */
export type StrictIdentityAtom =
    | {status: "found"; atom: AgentIdentityAtom}
    | {status: "none"}
    | {status: "ambiguous"; reason: string};

/**
 * {@link resolveDeclarationSubject}, for a caller that spends on the answer.
 *
 * `same as` is permissionless: anyone can write `(X, same as, <caip19>)` for an atom X of their
 * own, and the graph read is unordered, so with two claimants which one comes first is not a fact
 * about the agent. The Intuition source records that case as `derived` provenance with the
 * duplicates in its note. A declaration can still take the first atom and say so; a sponsored
 * deposit cannot, because the edge it pays for would then be chosen by whoever wrote the second
 * `same as`. So this answers `ambiguous` instead of picking.
 */
export async function resolveIdentityAtomStrict(params: {
    agent: AgentRef;
    source?: TrustSource;
    graphqlUrl?: string;
}): Promise<StrictIdentityAtom> {
    const ref = resolveRef(params.agent);
    const caip19 = toCaip19(ref);
    const source =
        params.source ??
        intuitionSource(params.graphqlUrl === undefined ? {} : {graphqlUrl: params.graphqlUrl});
    const identity = await source.resolveAgent(ref);
    if (identity === null || identity.sourceHandle === null) return {status: "none"};
    if (identity.provenance.kind !== "claim") {
        return {
            status: "ambiguous",
            reason: identity.provenance.note ?? `${caip19} has no single identity atom`,
        };
    }
    try {
        // As above: `sourceHandle` is the graph's `term_id`; the guard checks the CAIP-19.
        return {status: "found", atom: asAgentIdentityAtom(identity.sourceHandle as Hex, caip19)};
    } catch (error) {
        if (error instanceof NoAgentIdentityError) return {status: "none"};
        throw error;
    }
}
