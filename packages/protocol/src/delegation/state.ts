import type {Address, Hex} from "viem";

/**
 * Whether a delegation has been revoked, read from the `DelegationManager` that would redeem it
 * (`docs/tasks/37` 37a, `isDisabled`).
 *
 * Three answers, not two. A read that fails is **unknown**, never "enabled": Hourglass keeps a
 * delegation when the read fails, and ARP shows the state as unknown instead, because an operator
 * deciding whether to revoke must not be told a revoked delegation is live.
 *
 * No chain constant: the caller names the manager and supplies the reader, so the same function
 * reads 13579 or any other chain the delegation was signed on (`rules/portability.md`).
 */
export type DelegationOnChainState = "enabled" | "disabled" | "unknown";

/** `DelegationManager.disabledDelegations(bytes32)`, the one function this file reads. */
export const DISABLED_DELEGATIONS_ABI = [
    {
        type: "function",
        name: "disabledDelegations",
        stateMutability: "view",
        inputs: [{name: "delegationHash", type: "bytes32"}],
        outputs: [{name: "isDisabled", type: "bool"}],
    },
] as const;

/** The slice of a viem `PublicClient` this read needs, so a test can hand in a stub. */
export type DisabledDelegationsReader = {
    readContract(args: {
        address: Address;
        abi: typeof DISABLED_DELEGATIONS_ABI;
        functionName: "disabledDelegations";
        args: readonly [Hex];
    }): Promise<boolean>;
};

export async function readDelegationState(
    hash: Hex,
    params: {reader: DisabledDelegationsReader; delegationManager: Address},
): Promise<DelegationOnChainState> {
    try {
        const disabled = await params.reader.readContract({
            address: params.delegationManager,
            abi: DISABLED_DELEGATIONS_ABI,
            functionName: "disabledDelegations",
            args: [hash],
        });
        if (disabled === true) return "disabled";
        if (disabled === false) return "enabled";
        return "unknown";
    } catch {
        return "unknown";
    }
}
