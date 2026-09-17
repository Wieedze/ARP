import {getWalletClient} from "@wagmi/core";
import {useCallback} from "react";
import type {Address, Hex} from "viem";

import {intuitionMainnetClient} from "../lib/intuition-mainnet";
import {wagmiConfig} from "../lib/wagmi";
import {
    planOperatorLink,
    resolveCanonicalAgentAtom,
    signImportConsent,
    submitOperatorLink,
    verifyAgentOwnership,
    type CanonicalAgentAtom,
    type ImportConsent,
    type ImportedAgent,
    type ImportLinkPlan,
    type OwnershipVerdict,
} from "../services/agent-import";
import {createUserSmartAccount} from "../services/smart-account";

/**
 * The chain and wallet actions the import page performs, kept out of the page.
 *
 * Callbacks only. Nothing here runs on mount or on navigation: the two reads
 * are free but they are still the operator's to trigger, and the one write
 * moves real TRUST on Intuition mainnet. Following the stake control's shape
 * (ADR 0017, safeguard 5), none of this is a mutation — a mutation carries
 * retry semantics, and a retry that resubmits is the thing to avoid here.
 */
export function useAgentImport() {
    /** Reads the ERC-8004 registry on the agent's own chain. Free, and signs nothing. */
    const verifyOwnership = useCallback(
        (params: {
            chainId: number;
            tokenId: string;
            connected: Address;
        }): Promise<OwnershipVerdict> =>
            verifyAgentOwnership({
                ref: {chainId: params.chainId, tokenId: params.tokenId},
                connected: params.connected,
            }),
        [],
    );

    /** The connector's preflight against the Intuition mainnet indexer. */
    const resolveAtom = useCallback(
        (params: {chainId: number; tokenId: string}): Promise<CanonicalAgentAtom | null> =>
            resolveCanonicalAgentAtom({ref: params}),
        [],
    );

    /**
     * The address the link will name: the operator's MetaMask Smart Account.
     *
     * Derived exactly as `/agent` derives it, so both doors name the same
     * account. The framework sits at the same CREATE2 addresses on Intuition
     * testnet and mainnet — asserted in `agent-import.test.ts` rather than
     * assumed — so the address is the same on the chain the stake lands on.
     */
    const deriveOperatingAccount = useCallback(async (owner: Address): Promise<Address> => {
        const walletClient = await connectedWalletClient();
        const account = await createUserSmartAccount({owner, signer: {walletClient}});
        return account.address;
    }, []);

    const signConsent = useCallback(
        async (consent: ImportConsent): Promise<{signature: Hex; chainId: number}> => {
            const walletClient = await connectedWalletClient();
            return signImportConsent({walletClient, consent});
        },
        [],
    );

    /** Reads the mainnet MultiVault to price the link. Sends nothing. */
    const planLink = useCallback(
        (
            imported: Pick<ImportedAgent, "agentAtomId" | "operatingAccount">,
        ): Promise<ImportLinkPlan> => planOperatorLink(intuitionMainnetClient, imported),
        [],
    );

    /** The one write. Reachable from a single click handler and nowhere else. */
    const publishLink = useCallback(
        async (params: {
            imported: ImportedAgent;
            plan: ImportLinkPlan;
        }): Promise<{atomTx?: Hex; tripleTx?: Hex}> => {
            const walletClient = await connectedWalletClient();
            return submitOperatorLink({
                walletClient,
                publicClient: intuitionMainnetClient,
                imported: params.imported,
                plan: params.plan,
            });
        },
        [],
    );

    return {
        verifyOwnership,
        resolveAtom,
        deriveOperatingAccount,
        signConsent,
        planLink,
        publishLink,
    };
}

/**
 * The wallet's own client, requested without pinning a chain id.
 *
 * A client built for one chain reports that chain whatever the wallet is really
 * doing. `submitOperatorLink` checks the wallet's own `eth_chainId` against
 * mainnet before it builds anything, and it can only do that if the client it
 * is handed tells the truth.
 */
async function connectedWalletClient() {
    const walletClient = await getWalletClient(wagmiConfig);
    if (walletClient === null || walletClient.account === undefined) {
        throw new Error("No wallet client — reconnect your wallet and try again.");
    }
    return walletClient;
}
