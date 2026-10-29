import {useCallback} from "react";
import type {Address, Hex} from "viem";

import {useChainChoice} from "../lib/chain-choice";
import {
    planUseDeclaration,
    submitUseDeclaration,
    type DeclaredUse,
    type AgentTokenRef,
} from "../services/declare-use";
import {connectedWalletClient} from "./wallet-client";

/**
 * The two actions the declare control performs, kept out of the component.
 *
 * Callbacks only, nothing on mount — same shape and same reason as `useToolRegister` and
 * `useAgentImport`. A mutation carries retry semantics, and a retry that resubmits is the thing to
 * avoid where a transaction pays a non-recoverable fee (ADR `0017` safeguard 5, ADR `0056` §1).
 *
 * The chain travels **on the declaration**, so planning on one chain and signing on another is
 * prevented by the mechanism rather than by refusing the toggle (ADR `0061`).
 */
export function useDeclareUse() {
    const chain = useChainChoice();

    const plan = useCallback(
        (params: {agent: AgentTokenRef; connected: Address; object: Hex}): Promise<DeclaredUse> =>
            planUseDeclaration({
                agent: params.agent,
                connected: params.connected,
                object: params.object,
                publicClient: chain.client,
                chain,
                graphqlUrl: chain.graphqlUrl,
            }),
        [chain],
    );

    const submit = useCallback(
        async (declaration: DeclaredUse): Promise<Hex> => {
            const walletClient = await connectedWalletClient();
            return submitUseDeclaration({
                walletClient,
                publicClient: chain.client,
                declaration,
            });
        },
        [chain],
    );

    return {plan, submit};
}
