import {useCallback} from "react";
import {getWalletClient} from "@wagmi/core";
import type {Address, Hex} from "viem";

import {intuitionMainnetClient} from "../lib/intuition-mainnet";
import {wagmiConfig} from "../lib/wagmi";
import {
    quoteStake,
    submitStake,
    type StakeQuote,
    type StakeSession,
    type StakeSide,
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
            tripleId: Hex;
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

    const awaitReceipt = useCallback(async (hash: Hex): Promise<void> => {
        await intuitionMainnetClient.waitForTransactionReceipt({hash});
    }, []);

    return {quote, submit, awaitReceipt};
}
