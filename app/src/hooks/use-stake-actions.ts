import {useCallback} from "react";
import {getWalletClient} from "@wagmi/core";
import type {Address, Hex} from "viem";

import {intuitionMainnetClient} from "../lib/intuition-mainnet";
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
 */
export function useStakeActions() {
    /** Reads the chain. Signs nothing, sends nothing. */
    const quote = useCallback(
        (params: {
            target: StakeTarget;
            side: StakeSide;
            assets: bigint;
            receiver: Address;
            session: StakeSession;
        }): Promise<StakeQuote> => quoteStake(intuitionMainnetClient, params),
        [],
    );

    /**
     * The wallet client is requested **without** pinning a chain id. A client
     * built for 1155 reports 1155 whatever the wallet is really doing; the
     * connected client tells the truth, and `submitStake` then checks it
     * against the wallet's own `eth_chainId` before building a transaction.
     */
    const submit = useCallback(async (stake: StakeQuote): Promise<Hex> => {
        const walletClient = await getWalletClient(wagmiConfig);
        if (walletClient === null || walletClient.account === undefined) {
            throw new Error("No wallet client — reconnect your wallet and try again.");
        }
        return submitStake({walletClient, publicClient: intuitionMainnetClient, quote: stake});
    }, []);

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
        }): Promise<RedeemQuote> => quoteRedeem(intuitionMainnetClient, params),
        [],
    );

    const submitExit = useCallback(async (exit: RedeemQuote): Promise<Hex> => {
        const walletClient = await getWalletClient(wagmiConfig);
        if (walletClient === null || walletClient.account === undefined) {
            throw new Error("No wallet client — reconnect your wallet and try again.");
        }
        return submitRedeem({walletClient, publicClient: intuitionMainnetClient, quote: exit});
    }, []);

    const awaitReceipt = useCallback(async (hash: Hex): Promise<void> => {
        await intuitionMainnetClient.waitForTransactionReceipt({hash});
    }, []);

    return {quote, submit, quoteExit, submitExit, awaitReceipt};
}
