import {
    multiVaultReads,
    prepareIdentityAtom,
    type IdentityAtomPlan,
    type PreparedCall,
} from "@arp-protocol/core";
import type {Account, Address, Chain, Hex, PublicClient, Transport, WalletClient} from "viem";

import {MAX_STAKE_WEI, type StakeChain} from "./trust-stake";

/**
 * Give an agent the Intuition identity atom everything else depends on.
 *
 * ## Why this exists
 *
 * The atom is normally written by Intuition's **mirror**, which covers Base. Measured 2026-10-20,
 * the mirror holds 28,648 agents against a registry whose highest minted id is 309,925, and it has
 * not moved since 2026-09-16. So for roughly nine agents in ten the atom does not exist, and
 * nothing in the protocol works until it does — `docs/12` calls that "the whole gap" (ADR `0047`).
 *
 * Until 2026-10-21 the import page hit that case and **stopped**: "nothing is written … the link
 * waits for the mirror". Its stated reason was that deriving an atom would produce "a
 * differently-pinned duplicate". That reason is **no longer true**, and it is why this module can
 * exist: the recipe in `@arp-protocol/core` reproduces the mirror's bytes exactly, verified against
 * agent 8453:6649 whose atom Intuition's own ingestion minted. The derived atom **is** the atom the
 * mirror would mint. Writing it early is not a duplicate; it is the same id, sooner.
 *
 * ## No pinning, deliberately
 *
 * Pinning is gated behind Intuition's partner API and `PinAuth` is branded so browser code cannot
 * construct one (ADR `0016`). This path does not need it. The atom's `data` is `ipfs://` + the CID
 * of a document that is a pure function of the agent's identity, so the id is computable here with
 * no credential and no request.
 *
 * What pinning buys is **legibility**: the indexer resolves the Thing's `name`, which
 * `RESOLVE_AGENT_QUERY` filters on. It is retroactive — the same bytes pinned by anyone at any time
 * yield the same CID — so an atom created here becomes resolvable the moment somebody pins it. The
 * plan carries the exact documents so the operator can see, and keep, what to pin.
 *
 * ## Chain
 *
 * Whichever chain the caller names — the same chain and the same human signature as the operator
 * link beside it. It is not a new write surface.
 *
 * It was pinned to mainnet 1155. The costs are **100x apart** (`atomCost` 0.1 TRUST on 1155
 * against 0.001 on 13579, measured by `scripts/measure/predicate-parity.ts`), so the plan is
 * priced per chain and `submitIdentityAtom` checks every call's own `chainId` against the chain it
 * was told to send on — each MultiVault is codeless on the other chain, where a value-bearing call
 * does not revert, it succeeds as a transfer to nobody.
 */
export type IdentityAtomSubmission = {txs: Hex[]; plan: IdentityAtomPlan};

/** A guard refused. The UI branches on `code` rather than parsing a message. */
export class IdentityAtomGuardError extends Error {
    readonly code: "wrong-chain" | "cost-above-ceiling" | "nothing-to-do";

    constructor(code: IdentityAtomGuardError["code"], message: string) {
        super(message);
        this.name = "IdentityAtomGuardError";
        this.code = code;
    }
}

function assertChain(expected: StakeChain, chainId: number | undefined): void {
    if (chainId !== expected.chainId) {
        throw new IdentityAtomGuardError(
            "wrong-chain",
            `This writes to ${expected.chain.name} (${expected.chainId}). Your wallet reports ` +
                `${chainId ?? "no chain"}. Nothing was sent.`,
        );
    }
}

/**
 * What writing the identity atom would cost and create, before anything is signed.
 *
 * Read-only. Every cost comes off the chain per call — `getAtomCost`, `getTripleCost` and
 * `minDeposit` are governance-configurable and 10–100× apart between chains.
 */
export async function planIdentityAtom(params: {
    publicClient: PublicClient;
    /** The Intuition chain the atom is written to. Not the agent's registry chain. */
    chain: StakeChain;
    agent: {chainId: number; tokenId: string; registry: Address};
    /**
     * The registration file's fields when the caller has them. Absent, the frozen recipe's
     * fallbacks apply — and those are part of the recipe, not defaults to improve: one differing
     * character is a different, permanent atom.
     */
    registration?: {name?: string; description?: string; image?: string; webEndpoint?: string};
}): Promise<IdentityAtomPlan> {
    const reads = multiVaultReads({
        address: params.chain.multiVault,
        chainId: params.chain.chainId,
        client: params.publicClient,
    });
    return prepareIdentityAtom({
        agent: params.agent,
        reads,
        ...(params.registration === undefined ? {} : {registration: params.registration}),
    });
}

/**
 * Send the plan's calls, in order, each one simulated first.
 *
 * Sequential and not `Promise.all`: `createTriples` reverts with `MultiVault_TermDoesNotExist` if
 * either atom is not yet on chain, and the plan orders the atoms before the edge for that reason.
 */
export async function submitIdentityAtom(params: {
    walletClient: WalletClient<Transport, Chain, Account>;
    publicClient: PublicClient;
    chain: StakeChain;
    plan: IdentityAtomPlan;
}): Promise<IdentityAtomSubmission> {
    const {walletClient, publicClient, chain, plan} = params;

    assertChain(chain, walletClient.chain?.id);
    assertChain(chain, await walletClient.getChainId());

    if (plan.calls.length === 0) {
        throw new IdentityAtomGuardError(
            "nothing-to-do",
            "The identity atom and its edge are already on the graph. Nothing to send.",
        );
    }
    if (plan.totalValue > MAX_STAKE_WEI) {
        throw new IdentityAtomGuardError(
            "cost-above-ceiling",
            "Writing the identity atom would cost more than this app's per-transaction ceiling " +
                "(VITE_MAX_STAKE_TRUST). Nothing was sent.",
        );
    }

    const txs: Hex[] = [];
    for (const call of plan.calls) {
        // The plan carries its own chain id, and each MultiVault is codeless on the other chain —
        // where a value-bearing call does not revert, it succeeds as a transfer to nobody.
        assertChain(chain, call.chainId);
        await simulate(publicClient, call, walletClient.account.address);
        const hash = await walletClient.sendTransaction({
            to: call.to,
            data: call.data,
            value: call.value,
            chain: chain.chain,
        });
        await publicClient.waitForTransactionReceipt({hash});
        txs.push(hash);
    }
    return {txs, plan};
}

/** `eth_call` the exact bytes about to be signed. A revert here costs nothing; one on chain does not. */
async function simulate(
    publicClient: PublicClient,
    call: PreparedCall,
    from: Address,
): Promise<void> {
    await publicClient.call({account: from, to: call.to, data: call.data, value: call.value});
}
