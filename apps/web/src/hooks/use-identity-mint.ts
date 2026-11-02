import {useCallback} from "react";
import {getWalletClient} from "@wagmi/core";
import {createPublicClient, http, type Address, type Chain} from "viem";
import {
    buildRegistrationFile,
    toRegistrationDataUri,
    type RegistrationInput,
} from "@arp-protocol/core";

import {wagmiConfig} from "../lib/wagmi";
import {useChainChoice} from "../lib/chain-choice";
import {
    MAINNET_MINT,
    mintTargetFor,
    mintTargetOf,
    quoteMint,
    submitMint,
    TESTNET_MINT,
    type MintQuote,
    type MintResult,
    type MintTarget,
} from "../services/identity-mint";

/**
 * The two actions the mint screen performs: price it, send it.
 *
 * Callbacks only, nothing on mount. Deliberately not a mutation, for the same reason as the staking
 * and registration hooks: a mutation carries retry semantics, and a retry here mints a **second
 * permanent identity** the operator did not ask for.
 *
 * The target follows the chain toggle (`docs/tasks/50` §4): Base's canonical registry on mainnet,
 * ARP's registry on 13579 on testnet. Each target has its own read-only client, built once.
 *
 * `as Chain` because viem's chain objects are `const`-typed, so `createPublicClient({chain: base})`
 * infers a client specialised to that one literal chain, and TS then reports it as unrelated to the
 * bare `PublicClient` the service takes. The cast is safe and narrow: it drops the literal
 * narrowing on a value that is already a `Chain`, and changes nothing at runtime.
 */
const clients = new Map(
    [MAINNET_MINT, TESTNET_MINT].map((target) => [
        target,
        createPublicClient({chain: target.chain as Chain, transport: http()}),
    ]),
);

function clientFor(target: MintTarget) {
    const client = clients.get(target);
    if (client === undefined) throw new Error(`no client for chain ${target.chain.id}`);
    return client;
}

/** What the page collects. The chain and the registry are this module's to supply, not the form's. */
export type IdentityDraft = Omit<RegistrationInput, "chainId" | "registry">;

/**
 * The document, as a `data:` URI — built here so the quote and the write are priced against the
 * **same bytes**, and so the page never has to assemble a published document itself.
 */
export function draftToAgentUri(draft: IdentityDraft, target: MintTarget): string {
    return toRegistrationDataUri(
        buildRegistrationFile({...draft, chainId: target.chain.id, registry: target.registry}),
    );
}

export function useIdentityMint() {
    const target = mintTargetFor(useChainChoice().isMainnet);

    const quote = useCallback(
        (owner: Address, agentUri: string): Promise<MintQuote> =>
            quoteMint({publicClient: clientFor(target), target, owner, agentUri}),
        [target],
    );

    const submit = useCallback(async (quoted: MintQuote): Promise<MintResult> => {
        // The quote's own target, not the toggle's now: a flip between the quote and the
        // signature must not send the mint to the other chain.
        const at = mintTargetOf(quoted.chainId);
        // Requested without pinning a chain id: a client reports the chain it was built for
        // whatever the wallet is really doing, and `submitMint` checks the wallet's own
        // `eth_chainId` before it builds anything.
        const walletClient = await getWalletClient(wagmiConfig);
        if (walletClient === null || walletClient.account === undefined) {
            throw new Error("No wallet client — reconnect your wallet and try again.");
        }
        return submitMint({
            walletClient,
            publicClient: clientFor(at),
            target: at,
            agentUri: quoted.agentUri,
        });
    }, []);

    return {target, quote, submit};
}
