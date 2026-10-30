import {
    atomDataForUri,
    encodeCreateAtom,
    intuitionToolAtomLookup,
    multiVaultReads,
    normaliseToolUrl,
    toolAtomUri,
    toolThingDocument,
    type ToolAtomCandidate,
    type ToolAtomLookup,
} from "@arp-protocol/core";
import type {Account, Chain, Hex, PublicClient, Transport, WalletClient} from "viem";

import {MAX_STAKE_WEI, type StakeChain} from "./trust-stake";
import {waitAndRecord} from "./tx-record";

/**
 * Register a tool: create the atom its URL derives from, or find the one that already exists.
 *
 * ## What registering is, and is not
 *
 * It is **creating an atom**. It is not writing a record into anything ARP keeps — ARP keeps nothing
 * (ADR `0051`). The atom is a pointer: the tool lives wherever its URL says, and what ARP adds is a
 * vault anyone can deposit into.
 *
 * An atom has **no subject**, and that is why a person can register one without being an agent. The
 * two writes in this protocol are not the same write:
 *
 * | actor | writes | onto | means |
 * | --- | --- | --- | --- |
 * | a person, here | the tool's atom | the atom's vault | "this tool is worth something" |
 * | an agent, through the MCP or the skill | `(agent, uses, tool)` | the edge's vault, and its counter-vault | "I used it, and I am paying to say so" |
 *
 * ADR `0039` put an agent's deposit on the edge and said the atom's vault "answers a different
 * question — a market on the tool itself, open to anyone for any reason". This is that one.
 *
 * ## The id needs nothing
 *
 * Every field of the Thing derives from the normalised URL (ADR `0054`), so the atom id is a pure
 * function of what the operator typed — computable before any request, with no credential. The
 * planning step below is **two reads and no secrets**; what needs a credential is pinning, and
 * pinning only makes the document readable. `scripts/seed/pin-tool.ts` does it, retroactively, and the id
 * does not change.
 *
 * ## Chain
 *
 * Whichever chain the caller names, carried **on the registration** so the plan and the write
 * cannot disagree. Same ceiling and same human signature as the panels beside it.
 *
 * It was pinned to mainnet 1155 on the argument that "that is where the agents and the MultiVault
 * are". True of the cohort — 30,913 identities on 1155 against 768 on 13579 — and irrelevant to
 * where a *write* should go while the loop is being proven: the whole point of the toggle is that
 * the loop runs end to end on testnet first (user, 2026-10-27). The costs are 100x apart
 * (`scripts/measure/predicate-parity.ts`), which is exactly why the plan is per chain.
 */
export type ToolRegistration = {
    /** The chain this was priced on, and the only place the write reads it from. */
    chain: StakeChain;
    /** What the operator typed, trimmed. */
    input: string;
    /** The canonical form every field of the Thing derives from. */
    normalisedUrl: string;
    /** `ipfs://<cid>` — the atom's `data`. */
    atomUri: string;
    atomId: Hex;
    /**
     * The exact bytes to pin so a reader sees a name instead of a hash.
     *
     * Surfaced on the screen rather than only described there: the page tells the operator anyone
     * can pin it at any time, and handing them the bytes is the difference between that being true
     * and being a fact about somebody else.
     */
    document: string;
    /** True when this exact atom is already on chain, so there is nothing to create. */
    exists: boolean;
    /**
     * Atoms already carrying this URL in a pinned Thing, found by the lookup.
     *
     * Reported, never chosen between. More than one means the tool already has several atoms, and
     * picking one would write a permanent deposit onto an arbitrary id. `https://github.com` has
     * five on mainnet.
     */
    existingCandidates: ToolAtomCandidate[];
    /** `atomCost + minDeposit`, so the atom is born with a position (ADR `0053`). Zero if it exists. */
    assets: bigint;
    /**
     * The flat creation fee, which is **spent**. Read from the chain, not assumed: 0.1 TRUST on
     * mainnet 1155 against 0.001 on testnet 13579, and governance-settable.
     */
    creationFee: bigint;
    /**
     * What is left after **every** fee — the entry fee as well as the flat one — and therefore what
     * actually reaches the vault as a position.
     *
     * Carried separately because the chain takes **three** bites and an earlier version of this
     * screen described two: the flat fee, then the entry fee (measured at 175 bps for an atom on
     * mainnet 1155, ADR `0053`), then shares rounded down. "The fee is spent, the deposit is yours"
     * was a reasonable sentence and a wrong one — part of the deposit is spent too. ADR `0017`
     * safeguard 6 asks for the numbers rather than the sentence, for exactly this reason.
     */
    assetsAfterFees: bigint;
    /** What the fees take in total: `assets - assetsAfterFees`. Displayed, never hidden. */
    feeAssets: bigint;
    /** What the deposit buys, from `previewAtomCreate`. Zero if the atom exists. */
    shares: bigint;
};

export class ToolRegisterGuardError extends Error {
    readonly code:
        | "bad-url"
        | "wrong-chain"
        | "cost-above-ceiling"
        | "already-exists"
        | "no-position";

    constructor(code: ToolRegisterGuardError["code"], message: string) {
        super(message);
        this.name = "ToolRegisterGuardError";
        this.code = code;
    }
}

function assertChain(expected: StakeChain, chainId: number | undefined): void {
    if (chainId !== expected.chainId) {
        throw new ToolRegisterGuardError(
            "wrong-chain",
            `This registration was priced on ${expected.chain.name} (${expected.chainId}). Your ` +
                `wallet reports ${chainId ?? "no chain"}. Nothing was sent.`,
        );
    }
}

/**
 * Everything about a URL before anything is signed. Two chain reads and one graph read.
 *
 * Throws `bad-url` for anything `normaliseToolUrl` cannot handle — a `did:`, an `npm:` specifier, a
 * bare word. Those have no URL to derive a document from, and this screen is for URLs.
 */
export async function planToolRegistration(params: {
    url: string;
    publicClient: PublicClient;
    chain: StakeChain;
    graphqlUrl?: string;
    /**
     * The graph read, injectable so the planning can be tested without a network.
     *
     * Same device and same reason as `planIdentityAtom`'s `pinner`: every guard on this path refuses
     * a real mainnet transaction, and ADR `0017`'s build rule says those are verified by "unit tests
     * over a mocked wallet client", not by trying them.
     */
    lookup?: ToolAtomLookup;
}): Promise<ToolRegistration> {
    const input = params.url.trim();
    let normalisedUrl: string;
    try {
        normalisedUrl = normaliseToolUrl(input);
    } catch (caught) {
        throw new ToolRegisterGuardError(
            "bad-url",
            caught instanceof Error ? caught.message : String(caught),
        );
    }

    const atomUri = toolAtomUri(normalisedUrl);
    const reads = multiVaultReads({
        address: params.chain.multiVault,
        chainId: params.chain.chainId,
        client: params.publicClient,
    });

    const atomData = atomDataForUri(atomUri);
    const atomId = await reads.atomId(atomData);
    const exists = await reads.termExists(atomId);

    // Both spellings, because an atom on the graph carries whatever URL its creator typed. Asked
    // even when ours exists: a second atom for the same tool is worth knowing about either way.
    const lookup =
        params.lookup ??
        intuitionToolAtomLookup(
            params.graphqlUrl === undefined ? {} : {graphqlUrl: params.graphqlUrl},
        );
    const spellings = input === normalisedUrl ? [normalisedUrl] : [input, normalisedUrl];
    const byTermId = new Map<string, ToolAtomCandidate>();
    for (const spelling of spellings) {
        for (const candidate of await lookup.findByUrl(spelling)) {
            if (candidate.termId.toLowerCase() !== atomId.toLowerCase()) {
                byTermId.set(candidate.termId, candidate);
            }
        }
    }

    let assets = 0n;
    let creationFee = 0n;
    let assetsAfterFees = 0n;
    let shares = 0n;
    if (!exists) {
        const [atomCost, minDeposit] = await Promise.all([reads.atomCost(), reads.minDeposit()]);
        creationFee = atomCost;
        assets = atomCost + minDeposit;
        const preview = await reads.previewAtomCreate(atomId, assets);
        if (preview.shares === 0n) {
            throw new ToolRegisterGuardError(
                "no-position",
                `Creating this atom with ${assets} wei would buy 0 shares, so it would be born ` +
                    `with no position — on the chain, and not a market. Nothing was sent.`,
            );
        }
        shares = preview.shares;
        assetsAfterFees = preview.assetsAfterFees;
        // The ceiling is known here, not at submit time: a button that reads "Register — X TRUST"
        // and opens a wallet only to refuse is a worse disclosure than no button. `submitToolRegistration`
        // checks it again, because a plan can be held while the chain's costs move.
        if (assets > MAX_STAKE_WEI) {
            throw new ToolRegisterGuardError(
                "cost-above-ceiling",
                `Registering this tool would cost ${assets} wei, above this app's ` +
                    `per-transaction ceiling of ${MAX_STAKE_WEI} wei (VITE_MAX_STAKE_TRUST). ` +
                    `Nothing was sent.`,
            );
        }
    }

    return {
        chain: params.chain,
        input,
        normalisedUrl,
        atomUri,
        atomId,
        document: toolThingDocument(normalisedUrl),
        exists,
        existingCandidates: [...byTermId.values()],
        assets,
        creationFee,
        assetsAfterFees,
        feeAssets: assets - assetsAfterFees,
        shares,
    };
}

/** Create the atom. One transaction, simulated first, with the plan's own previewed assets. */
export async function submitToolRegistration(params: {
    walletClient: WalletClient<Transport, Chain, Account>;
    publicClient: PublicClient;
    registration: ToolRegistration;
}): Promise<Hex> {
    const {walletClient, publicClient, registration} = params;

    assertChain(registration.chain, walletClient.chain?.id);
    assertChain(registration.chain, await walletClient.getChainId());

    if (registration.exists) {
        throw new ToolRegisterGuardError(
            "already-exists",
            "This tool already has its atom. Take a position on it instead of creating a second one.",
        );
    }
    if (registration.assets > MAX_STAKE_WEI) {
        throw new ToolRegisterGuardError(
            "cost-above-ceiling",
            "Registering would cost more than this app's per-transaction ceiling " +
                "(VITE_MAX_STAKE_TRUST). Nothing was sent.",
        );
    }

    const data = encodeCreateAtom(atomDataForUri(registration.atomUri), registration.assets);
    await publicClient.call({
        account: walletClient.account.address,
        to: registration.chain.multiVault,
        data,
        value: registration.assets,
    });
    const hash = await walletClient.sendTransaction({
        to: registration.chain.multiVault,
        data,
        value: registration.assets,
        chain: registration.chain.chain,
    });
    await waitAndRecord(publicClient, hash, {label: "register tool"});
    return hash;
}
