import {useCallback} from "react";
import type {Hex} from "viem";

import {useChainChoice} from "../lib/chain-choice";
import {
    planToolRegistration,
    submitToolRegistration,
    type ToolRegistration,
} from "../services/tool-register";
import {connectedWalletClient} from "./wallet-client";

/**
 * The two actions the register screen performs, kept out of the page.
 *
 * Callbacks only, nothing on mount. The read is free and still the operator's to trigger; the write
 * moves value. Same shape and same reason as `useAgentImport` — a mutation carries retry semantics,
 * and a retry that resubmits is the thing to avoid on a surface like this (ADR `0017`
 * safeguard 5).
 *
 * **It follows the chain toggle now**, and the comment here used to say the opposite: _"not
 * chain-switchable, deliberately … it moves with the write path or not at all"_. It moves with the
 * write path, and the write path moved (user, 2026-10-27). The incoherence that comment was
 * guarding against — planning on one chain and submitting to another — is prevented by the
 * mechanism rather than by refusing the feature: the chain travels **on the registration**, and
 * `submitToolRegistration` guards the wallet against `registration.chain` rather than against
 * whatever the toggle says at signing time.
 */
export function useToolRegister() {
    const chain = useChainChoice();

    const plan = useCallback(
        (url: string): Promise<ToolRegistration> =>
            planToolRegistration({
                url,
                publicClient: chain.client,
                chain,
                graphqlUrl: chain.graphqlUrl,
            }),
        [chain],
    );

    const submit = useCallback(
        async (registration: ToolRegistration): Promise<Hex> => {
            const walletClient = await connectedWalletClient();
            return submitToolRegistration({
                walletClient,
                publicClient: chain.client,
                registration,
            });
        },
        [chain],
    );

    return {plan, submit};
}
