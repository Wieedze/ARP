import {useCallback} from "react";
import {getWalletClient} from "@wagmi/core";
import {createPublicClient, http, type Address, type Chain} from "viem";

import {wagmiConfig} from "../lib/wagmi";
import {
    MINT_CHAIN,
    quoteMint,
    submitMint,
    type MintQuote,
    type MintResult,
} from "../services/identity-mint";

/**
 * The two actions the mint screen performs: price it, send it.
 *
 * Callbacks only, nothing on mount. Deliberately not a mutation, for the same reason as the staking
 * and registration hooks: a mutation carries retry semantics, and a retry here mints a **second
 * permanent identity** the operator did not ask for.
 *
 * Its own client, not the chain toggle's. The toggle picks which Intuition chain the market is on;
 * an ERC-8004 identity is on Base either way (`lib/wagmi.ts`). Built once at module scope because
 * it is read-only and never changes.
 *
 * `as Chain` because viem's chain objects are `const`-typed, so `createPublicClient({chain: base})`
 * infers a client specialised to that one literal chain, and TS then reports it as unrelated to the
 * bare `PublicClient` the service takes. The cast is safe and narrow: it drops the literal
 * narrowing on a value that is already a `Chain`, and changes nothing at runtime.
 */
const mintClient = createPublicClient({chain: MINT_CHAIN as Chain, transport: http()});

export function useIdentityMint() {
    const quote = useCallback(
        (owner: Address): Promise<MintQuote> => quoteMint({publicClient: mintClient, owner}),
        [],
    );

    const submit = useCallback(async (): Promise<MintResult> => {
        // Requested without pinning a chain id: a client built for Base reports Base whatever the
        // wallet is really doing, and `submitMint` checks the wallet's own `eth_chainId` before it
        // builds anything.
        const walletClient = await getWalletClient(wagmiConfig);
        if (walletClient === null || walletClient.account === undefined) {
            throw new Error("No wallet client — reconnect your wallet and try again.");
        }
        return submitMint({walletClient, publicClient: mintClient});
    }, []);

    return {quote, submit};
}
