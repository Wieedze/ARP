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
    return asAgentIdentityAtom(identity.sourceHandle as Hex, caip19);
}
