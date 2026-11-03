import {useCallback} from "react";
import {getWalletClient} from "@wagmi/core";
import type {Address, Hex} from "viem";

import {useChainChoice} from "../lib/chain-choice";
import {wagmiConfig} from "../lib/wagmi";
import {recordSent, recordSettled, recordUnsettled} from "../services/tx-record";
import {
    quoteRedeem,
    quoteStake,
    submitRedeem,
    submitStake,
    type RedeemQuote,
    type StakeChain,
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
 * **The chain comes from the toggle at pricing time only.** It travels on the quote, and every
 * later step — the guard, the simulation, the receipt wait — reads `quote.chain`, so switching the
 * toggle between pricing and signing is caught by the chain check rather than silently honoured.
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
            const hash = await submitStake({
                walletClient,
                publicClient: stake.chain.client,
                quote: stake,
            });
            recordSent(hash, {
                label: "support",
                chainId: stake.chain.chainId,
                valueWei: stake.assets,
            });
            return hash;
        },
        [],
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
            const hash = await submitRedeem({
                walletClient,
                publicClient: exit.chain.client,
                quote: exit,
            });
            recordSent(hash, {label: "withdraw", chainId: exit.chain.chainId});
            return hash;
        },
        [],
    );

    /** Waits on the chain the transaction was priced on, which is `on`, never the live toggle. */
    const awaitReceipt = useCallback(
        async (hash: Hex, on: StakeChain): Promise<void> => {
            let receipt;
            try {
                receipt = await on.client.waitForTransactionReceipt({hash});
            } catch (cause) {
                recordUnsettled(hash, cause);
                throw cause;
            }
            recordSettled(hash, receipt);
        },
        [],
    );

    return {quote, submit, quoteExit, submitExit, awaitReceipt};
}
