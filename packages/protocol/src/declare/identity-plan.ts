import type {Hex} from "viem";

import {toCaip19} from "../caip.js";
import type {AgentRef, ResolvedAgentRef} from "../types.js";
import {AI_AGENT, ERC8004, HAS_TYPE, IMPLEMENT, SAME_AS} from "../sources/intuition/terms.js";
import {
    canonicalAgentThing,
    canonicalCaipThing,
    thingDocument,
    thingUri,
    type AgentThing,
} from "./agent-atom.js";
import {atomDataForUri, encodeCreateAtom, encodeCreateTriple, type MultiVaultReads} from "./multivault.js";
import type {PreparedCall} from "./types.js";

/**
 * Plan the two atoms and the edge that give an agent an Intuition identity, **without pinning**.
 *
 * ## Why this is in the package and not in a script
 *
 * It was in `scripts/plan-identity-atom.ts`, which pins first and therefore needs the partner
 * credential (ADR `0016`). That made the whole path unreachable from the browser — `PinAuth` is a
 * branded type and app code cannot construct one, which is the leak that brand closes. So the UI
 * could not give an agent an identity atom, and that is the gap `docs/12` calls "the whole gap":
 * measured 2026-10-20, Intuition's mirror covers 28,648 of a registry whose highest minted id is
 * 309,925, and it has not moved since 2026-09-16. For roughly nine agents in ten the atom has to be
 * written (ADR `0047`).
 *
 * **Pinning is not needed to write it.** The atom's `data` is `ipfs://` + the CID of a document that
 * is a pure function of the agent's identity, so the id is computable offline with no credential and
 * no request — verified against agent 8453:6649, whose atom Intuition's own ingestion minted
 * (`agent-atom.ts`). Pinning makes the document *readable*, because the indexer resolves the Thing's
 * `name` and `RESOLVE_AGENT_QUERY` filters on it. It is a **separate, retroactive** step: the same
 * bytes pinned by anyone at any time yield the same CID, so an atom created today becomes resolvable
 * the moment somebody pins.
 *
 * So this returns the ids, the calls and the exact documents. A caller with a credential pins them;
 * a caller without one creates the atoms anyway and says the documents are unpinned.
 *
 * ## The direction of the edge
 *
 * `(identity atom, same as, caip19 atom)`. `RESOLVE_AGENT_QUERY` filters on the **object**'s Thing
 * name and returns the **subject**. Reversed, the agent stays unresolvable and the fee is spent.
 *
 * ## Three edges, not one — and the missing two were a live defect
 *
 * Intuition's own guide states the **minimum for a new agent**: `same as`, `has type` → `AIAgent`,
 * and `implement` → `ERC-8004` (the ERC-8004 agent-layer doc, and `docs/07` Appendix B). This
 * planner wrote `same as` and stopped, which looked like a reasonable subset and was not one:
 * `COHORT_QUERY`'s membership test is `implement` → `ERC-8004` by term id on both ends, so **an
 * agent whose atom this wrote did not appear in ARP's own index.** Identifiable, unclassified, and
 * invisible to the one list that is supposed to find it.
 *
 * Found 2026-10-27 by reading Intuition's rules against this code at the user's request. The two
 * object atoms are canonical and identical on 1155 and 13579, so they are referenced, never minted
 * — "partners should reuse listed object atoms rather than minting duplicates".
 *
 * `has tag` and `has category` are *recommended enrichment*, not the minimum, and they are not
 * written here: a tag nobody chose is noise, and `has tag` is the one term whose id differs by
 * network (`hasTagForWriting`).
 */
export type IdentityAtomPlan = {
    caip19: string;
    identityAtom: Hex;
    caipAtom: Hex;
    /** `(identity, same as, caip19)` — the edge resolution reads. */
    tripleId: Hex;
    /** `(identity, has type, AIAgent)` — classification, part of Intuition's minimum. */
    typeTripleId: Hex;
    /** `(identity, implement, ERC-8004)` — what `COHORT_QUERY` filters membership on. */
    implementTripleId: Hex;
    /** What already exists, so "nothing to do" reads differently from "failed to plan". */
    existing: {
        identityAtom: boolean;
        caipAtom: boolean;
        triple: boolean;
        typeTriple: boolean;
        implementTriple: boolean;
    };
    /** The two Things, for a caller that wants to show or pin them. */
    things: {identity: AgentThing; caip: AgentThing};
    /** The exact bytes to pin for each, so the documents are readable. */
    documents: {identity: string; caip: string};
    /** `ipfs://<cid>` of each document — the atom `data` each id derives from. */
    uris: {identity: string; caip: string};
    calls: PreparedCall[];
    totalValue: bigint;
    chainId: number;
};

/**
 * A term this plan would create with no position. Same rule as {@link ZeroPositionError}, raised
 * here because this planner builds its own calls rather than going through `prepareDeclareUsed`.
 */
export class IdentityTermHasNoPositionError extends Error {
    readonly termId: Hex;

    constructor(what: string, termId: Hex, assets: bigint) {
        super(
            `creating the ${what} ${termId} with ${assets} wei would buy 0 shares, so the term ` +
                `would be born with no position — on the chain, and not a market (ADR 0053). The ` +
                `creation fee comes out of \`assets\`; raise it above the fee by at least this ` +
                `chain's \`minDeposit\`. Pass \`birthDeposit: 0n\` if that is what you want.`,
        );
        this.name = "IdentityTermHasNoPositionError";
        this.termId = termId;
    }
}

export async function prepareIdentityAtom(params: {
    agent: AgentRef | ResolvedAgentRef;
    reads: MultiVaultReads;
    /**
     * The registration file's fields, when the caller has them. Absent, the frozen recipe's
     * fallbacks apply — `Agent <chain>:<token>` and an `8004scan.io` URL — and those fallbacks are
     * part of the recipe, not defaults to improve: one differing character is a different, permanent,
     * duplicate atom.
     */
    registration?: {name?: string; description?: string; image?: string; webEndpoint?: string};
    /** The deposit every term this plan creates is born with. Defaults to the chain's `minDeposit`. */
    birthDeposit?: bigint;
}): Promise<IdentityAtomPlan> {
    const caip19 = toCaip19(params.agent);
    const ref = /^eip155:(\d+)\/erc721:0x[0-9a-fA-F]{40}\/(\d+)$/.exec(caip19);
    if (ref === null) throw new Error(`toCaip19 produced an unparseable id: ${caip19}`);
    const [, chainId, tokenId] = ref as unknown as [string, string, string];

    const things = {
        identity: canonicalAgentThing(Number(chainId), tokenId, params.registration),
        caip: canonicalCaipThing(caip19),
    } as const;
    const uris = {
        identity: thingUri(things.identity),
        caip: thingUri(things.caip),
    } as const;

    const [identityAtom, caipAtom] = await Promise.all([
        params.reads.atomId(atomDataForUri(uris.identity)),
        params.reads.atomId(atomDataForUri(uris.caip)),
    ]);
    // The three edges Intuition's minimum names, in the order they are written. `same as` first,
    // because it is the one resolution reads and the one whose absence makes the rest unreachable.
    const [tripleId, typeTripleId, implementTripleId] = await Promise.all([
        params.reads.tripleId(identityAtom, SAME_AS as Hex, caipAtom),
        params.reads.tripleId(identityAtom, HAS_TYPE as Hex, AI_AGENT as Hex),
        params.reads.tripleId(identityAtom, IMPLEMENT as Hex, ERC8004 as Hex),
    ]);

    const [
        identityExists,
        caipExists,
        tripleExists,
        typeExists,
        implementExists,
        atomCost,
        tripleCost,
        minDeposit,
    ] = await Promise.all([
        params.reads.termExists(identityAtom),
        params.reads.termExists(caipAtom),
        params.reads.termExists(tripleId),
        params.reads.termExists(typeTripleId),
        params.reads.termExists(implementTripleId),
        params.reads.atomCost(),
        params.reads.tripleCost(),
        params.reads.minDeposit(),
    ]);

    const birthDeposit = params.birthDeposit ?? minDeposit;
    const atomAssets = atomCost + birthDeposit;
    const tripleAssets = tripleCost + birthDeposit;

    const preview = async (what: "atom" | "triple", termId: Hex, assets: bigint) => {
        const read =
            what === "atom"
                ? await params.reads.previewAtomCreate(termId, assets)
                : await params.reads.previewTripleCreate(termId, assets);
        if (read.shares === 0n && params.birthDeposit !== 0n) {
            throw new IdentityTermHasNoPositionError(what, termId, assets);
        }
        return {shares: read.shares, assetsAfterFees: read.assetsAfterFees};
    };

    const chainId_ = params.reads.chainId;
    const calls: PreparedCall[] = [];
    if (!identityExists) {
        calls.push({
            kind: "create-atom",
            chainId: chainId_,
            to: params.reads.address,
            value: atomAssets,
            data: encodeCreateAtom(atomDataForUri(uris.identity), atomAssets),
            why: `the agent's identity atom, from the canonical recipe (${things.identity.name})`,
            preview: await preview("atom", identityAtom, atomAssets),
        });
    }
    if (!caipExists) {
        calls.push({
            kind: "create-atom",
            chainId: chainId_,
            to: params.reads.address,
            value: atomAssets,
            data: encodeCreateAtom(atomDataForUri(uris.caip), atomAssets),
            why: `the CAIP-19 identifier atom (${caip19})`,
            preview: await preview("atom", caipAtom, atomAssets),
        });
    }
    if (!tripleExists) {
        calls.push({
            kind: "create-triple",
            chainId: chainId_,
            to: params.reads.address,
            value: tripleAssets,
            data: encodeCreateTriple(identityAtom, SAME_AS as Hex, caipAtom, tripleAssets),
            why: "identity atom --same as--> caip19 atom, the edge resolution reads",
            preview: await preview("triple", tripleId, tripleAssets),
        });
    }
    // The two classification edges. Their object atoms are canonical and already on both chains,
    // so only the edges are created — never the objects.
    if (!typeExists) {
        calls.push({
            kind: "create-triple",
            chainId: chainId_,
            to: params.reads.address,
            value: tripleAssets,
            data: encodeCreateTriple(identityAtom, HAS_TYPE as Hex, AI_AGENT as Hex, tripleAssets),
            why: "identity atom --has type--> AIAgent, Intuition's stated minimum",
            preview: await preview("triple", typeTripleId, tripleAssets),
        });
    }
    if (!implementExists) {
        calls.push({
            kind: "create-triple",
            chainId: chainId_,
            to: params.reads.address,
            value: tripleAssets,
            data: encodeCreateTriple(identityAtom, IMPLEMENT as Hex, ERC8004 as Hex, tripleAssets),
            why: "identity atom --implement--> ERC-8004, which is what COHORT_QUERY filters on",
            preview: await preview("triple", implementTripleId, tripleAssets),
        });
    }

    return {
        caip19,
        identityAtom,
        caipAtom,
        tripleId,
        typeTripleId,
        implementTripleId,
        existing: {
            identityAtom: identityExists,
            caipAtom: caipExists,
            triple: tripleExists,
            typeTriple: typeExists,
            implementTriple: implementExists,
        },
        things,
        documents: {
            identity: thingDocument(things.identity),
            caip: thingDocument(things.caip),
        },
        uris,
        calls,
        totalValue: calls.reduce((sum, call) => sum + call.value, 0n),
        chainId: chainId_,
    };
}
