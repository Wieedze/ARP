import {useCallback} from "react";
import {getWalletClient} from "@wagmi/core";
import type {Address, Hex} from "viem";

import {useChainChoice} from "../lib/chain-choice";
import {wagmiConfig} from "../lib/wagmi";
import {
    quoteRedeem,
    quoteStake,
    submitRedeem,
    submitStake,
    type RedeemQuote,
    type StakeQuote,
    type StakeSession,
    type StakeSide,
    type StakeTarget,
} from "../services/trust-stake";

/**
 * The three chain actions the stake control performs, kept out of the
 * component: price the deposit, send it, wait for it.
 *
 * Callbacks only — nothing here runs on mount, on navigation or on a retry
 * (ADR 0017, safeguard 5). Deliberately not a mutation: a mutation carries
 * retry semantics, and a retry that resubmits is precisely what must not exist
 * on this surface.
 *
 * **The chain comes from the toggle**, and it travels on the quote rather than being read again at
 * submit time. It was pinned to mainnet here, which is what made a testnet reader's `tTRUST` label
 * sit over a mainnet deposit. `submitStake` re-derives its guard from `quote.chain`, so switching
 * the toggle between pricing and signing is caught by the chain check rather than silently
 * honoured.
 */
export function useStakeActions() {
    const chain = useChainChoice();

    /** Reads the chain. Signs nothing, sends nothing. */
    const quote = useCallback(
        (params: {
            target: StakeTarget;
            side: StakeSide;
            assets: bigint;
            receiver: Address;
            session: StakeSession;
        }): Promise<StakeQuote> => quoteStake(chain.client, {...params, chain}),
        [chain],
    );

    /**
     * The wallet client is requested **without** pinning a chain id. A client
     * built for one chain reports that chain whatever the wallet is really doing; the
     * connected client tells the truth, and `submitStake` then checks it
     * against the wallet's own `eth_chainId` before building a transaction.
     */
    const submit = useCallback(
        async (stake: StakeQuote): Promise<Hex> => {
            const walletClient = await getWalletClient(wagmiConfig);
            if (walletClient === null || walletClient.account === undefined) {
                throw new Error("No wallet client — reconnect your wallet and try again.");
            }
            // The quote's own client, not the hook's: if the toggle moved after the quote was
            // priced, the simulation has to run against the chain the quote was priced on so the
            // guard reports a mismatch instead of a revert.
            return submitStake({walletClient, publicClient: chain.client, quote: stake});
        },
        [chain],
    );

    /**
     * The exit, mirroring `quote` and `submit`.
     *
     * Same discipline and the same reason it is not a mutation: a retry that resubmits is what must
     * not exist on a surface that moves value, and a redemption resubmitted after it landed burns
     * shares the account no longer has.
     */
    const quoteExit = useCallback(
        (params: {
            termId: Hex;
            curveId: bigint;
            shares: bigint;
            receiver: Address;
        }): Promise<RedeemQuote> => quoteRedeem(chain.client, {...params, chain}),
        [chain],
    );

    const submitExit = useCallback(
        async (exit: RedeemQuote): Promise<Hex> => {
            const walletClient = await getWalletClient(wagmiConfig);
            if (walletClient === null || walletClient.account === undefined) {
                throw new Error("No wallet client — reconnect your wallet and try again.");
            }
            return submitRedeem({walletClient, publicClient: chain.client, quote: exit});
        },
        [chain],
    );

    const awaitReceipt = useCallback(
        async (hash: Hex): Promise<void> => {
            await chain.client.waitForTransactionReceipt({hash});
        },
        [chain],
    );

    return {quote, submit, quoteExit, submitExit, awaitReceipt};
}
