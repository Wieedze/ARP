import {useMutation, useQueries, useQuery} from "@tanstack/react-query";
import {readDelegationState, type DelegationOnChainState} from "@arp-protocol/core";
import {type Delegation} from "@metamask/smart-accounts-kit";
import {zeroAddress, type Address, type Hex} from "viem";
import {useAccount, useSwitchChain, useWalletClient} from "wagmi";

import {intuitionTestnet} from "../lib/chains";
import {publicClient} from "../lib/clients";
import {deployments} from "../lib/deployments";
import {signDelegationAs, stakeDelegation} from "../services/delegation";
import {revokeDelegation} from "../services/delegation-revoke";
import {type StoredDelegation} from "../services/delegation-store";
import {describeDelegation, type DelegationView} from "../services/delegation-view";
import {readNativeBalance} from "../services/native-balance";
import {
    createUserSmartAccount,
    deploySmartAccountIfNeeded,
    isSmartAccountDeployed,
} from "../services/smart-account";

import {useAgentId, useAgentWallet} from "./use-agent";
import {useStoredDelegations} from "./use-stored-delegations";
import {connectedWalletClient} from "./wallet-client";

/**
 * Everything `/account` reads and every act it offers, for the connected operator.
 *
 * All of it is on 13579, whatever the page's toggle says: the Smart Account, the delegations and
 * the `DelegationManager` that revokes them are ARP's own testnet rig (`rules/portability.md`, the
 * line is whose contract it is). The page decides whether to offer a control; this hook never
 * signs without being called from one.
 */
export type DelegationRow = {
    stored: StoredDelegation;
    view: DelegationView;
    state: DelegationOnChainState | "loading";
};

export type AccountDelegations = ReturnType<typeof useAccountDelegations>;

export function useAccountDelegations() {
    const {address: operator, chainId: walletChainId} = useAccount();
    const {data: walletClient} = useWalletClient();
    const {switchChainAsync} = useSwitchChain();

    const smartAccountQuery = useQuery({
        queryKey: ["operator-smart-account", operator, walletClient?.uid],
        queryFn: async () => {
            if (operator === undefined || walletClient === undefined) return null;
            const smartAccount = await createUserSmartAccount({
                owner: operator,
                signer: {walletClient},
            });
            return {smartAccount, isDeployed: await isSmartAccountDeployed(smartAccount.address)};
        },
        enabled: operator !== undefined && walletClient !== undefined,
        // The account object holds a signer; it is not data to compare structurally.
        structuralSharing: false,
        staleTime: Infinity,
    });
    const smartAccount = smartAccountQuery.data?.smartAccount ?? null;

    const stored = useStoredDelegations(smartAccount?.address);

    const stateQueries = useQueries({
        queries: stored.list.map((entry) => {
            const hash = describeDelegation(entry.delegation).hash;
            return {
                queryKey: ["delegation-state", intuitionTestnet.id, hash],
                queryFn: () =>
                    readDelegationState(hash, {
                        reader: publicClient,
                        delegationManager:
                            deployments.metamaskDelegationFramework.delegationManager,
                    }),
                staleTime: 15_000,
            };
        }),
    });

    const rows: DelegationRow[] = stored.list.map((entry, index) => ({
        stored: entry,
        view: describeDelegation(entry.delegation),
        state: stateQueries[index]?.data ?? "loading",
    }));

    const delegates = [...new Set(rows.map((row) => row.view.delegate))];
    const balanceQueries = useQueries({
        queries: delegates.map((address) => ({
            queryKey: ["balance", intuitionTestnet.id, address],
            queryFn: () => readNativeBalance(address),
            staleTime: 15_000,
        })),
    });
    const runtimes = delegates.map((address, index) => ({
        address,
        balance: balanceQueries[index]?.data,
    }));

    // The runtime wallet bound to the operator's agent in ARP's testnet registry, if there is one:
    // the delegate the form suggests. A suggestion only; the field stays editable.
    const agentId = useAgentId();
    const agentWallet = useAgentWallet(agentId.data ?? null);
    const suggestedDelegate =
        typeof agentWallet.data === "string" && agentWallet.data !== zeroAddress
            ? (agentWallet.data as Address) // `getAgentWallet` returns an address; checked non-zero.
            : null;

    const switchToTestnet = useMutation({
        mutationFn: () => switchChainAsync({chainId: intuitionTestnet.id}),
    });

    const deploy = useMutation({
        mutationFn: async () => {
            if (smartAccount === null) throw new Error("Agent wallet not ready");
            const wc = await connectedWalletClient();
            const tx = await deploySmartAccountIfNeeded({
                smartAccount,
                funderWalletClient: wc,
            });
            await smartAccountQuery.refetch();
            return tx;
        },
    });

    const sign = useMutation({
        mutationFn: async (params: {delegate: Hex; cap: bigint; periodSeconds: bigint}) => {
            if (smartAccount === null) throw new Error("Agent wallet not ready");
            const signed = await signDelegationAs({
                delegation: stakeDelegation({delegator: smartAccount.address, ...params}),
                smartAccount,
            });
            stored.add(signed);
            return signed;
        },
    });

    const revoke = useMutation({
        mutationFn: async (target: Delegation) => {
            if (smartAccount === null) throw new Error("Agent wallet not ready");
            const wc = await connectedWalletClient();
            const hash = await revokeDelegation({
                target,
                smartAccount,
                operatorWalletClient: wc,
                publicClient,
            });
            await Promise.all(stateQueries.map((query) => query.refetch()));
            return hash;
        },
    });

    return {
        operator,
        walletChainId,
        onTestnet: walletChainId === intuitionTestnet.id,
        switchToTestnet,
        smartAccount:
            smartAccountQuery.data === undefined || smartAccountQuery.data === null
                ? null
                : {
                      address: smartAccountQuery.data.smartAccount.address,
                      isDeployed: smartAccountQuery.data.isDeployed,
                  },
        smartAccountError: smartAccountQuery.error,
        rows,
        runtimes,
        suggestedDelegate,
        deploy,
        sign,
        revoke,
    };
}
