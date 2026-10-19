import type {Address} from "viem";

import type {PreparedCall} from "./types.js";

/**
 * A delegation as the MetaMask Delegation Framework defines it. Structurally typed here so this
 * module can be read, and type-checked, without the kit being installed.
 */
export type DelegationLike = {
    delegate: Address;
    delegator: Address;
    authority: `0x${string}`;
    caveats: readonly {enforcer: Address; terms: `0x${string}`; args: `0x${string}`}[];
    salt: bigint;
    signature: `0x${string}`;
};

/**
 * The same actions, redeemed through a delegation instead of signed directly.
 *
 * `calls` each carry `value: 0n`: the redeemer sends nothing, because a redemption executes from
 * the **delegator's** balance. `delegatorValue` is what is actually spent, and it is named
 * separately rather than reusing `totalValue` because confusing the two is how a runtime ends up
 * funding the wrong account.
 */
export type DelegatedPlan = {
    calls: PreparedCall[];
    /**
     * TRUST the delegator spends when the whole plan is redeemed. Not the redeemer's TRUST.
     *
     * **It merges fees and stakes into one figure, and so does the cap that bounds it.**
     * `TrustStakeCapEnforcer.beforeHook` consumes only the execution's `value`
     * (`contracts/src/enforcers/TrustStakeCapEnforcer.sol:101`), so the operator's cap is spent by
     * an unrecoverable term-creation fee exactly as readily as by a redeemable deposit — and it
     * does **not** bound the destination. Nothing on-chain checks that a deposit lands on the edge
     * rather than somewhere else; that is this connector's choice (ADR `0039`) and the operator is
     * trusting it. ADR `0040` has the full shape.
     */
    delegatorValue: bigint;
    delegationManager: Address;
};

/** The kit is needed for delegated mode and not for direct mode. Said in one place. */
export class SmartAccountsKitMissingError extends Error {
    constructor(cause: unknown) {
        super(
            `delegated mode needs @metamask/smart-accounts-kit installed ` +
                `(direct mode does not): ${String(cause).slice(0, 200)}`,
        );
        this.name = "SmartAccountsKitMissingError";
    }
}

/**
 * Wrap prepared calls so a delegate redeems them under a signed delegation.
 *
 * **One redemption per call, never a batch**, for two independent reasons. The framework's own
 * reference says batch mode "does not currently have compatible caveat enforcers"
 * (`.claude/skills/mms-smart-accounts-kit/references/delegations.md:699`), so a batch would have no
 * guard rail at all. And ARP's `TrustStakeCapEnforcer` guards `beforeHook` with
 * `onlySingleCallTypeMode` and `onlyDefaultExecutionMode`
 * (`contracts/src/enforcers/TrustStakeCapEnforcer.sol:95-96`), so a batched redemption would revert
 * against the very caveat that makes delegated mode worth having.
 *
 * The encoding comes from the kit, not from this package, and matches its canonical example
 * verbatim — `delegations: [[signed]]`, `modes: [ExecutionMode.SingleDefault]`,
 * `executions: [[execution]]` (same reference, line 765). Hand-rolling the `Delegation[]` and
 * execution-mode encoding is the silent-revert risk `rules/metamask-delegation.md` names: the kit is
 * canonical on the framework's wire format. The import is dynamic so a runtime using only direct
 * mode never loads it.
 *
 * @param params.delegations A single signed delegation, or a chain ordered `[leaf, …, root]`. The
 *                           framework validates it top-to-bottom.
 */
export async function toDelegatedCalls(params: {
    calls: readonly PreparedCall[];
    delegations: DelegationLike | readonly DelegationLike[];
    delegationManager: Address;
}): Promise<DelegatedPlan> {
    let kit: typeof import("@metamask/smart-accounts-kit");
    let contracts: typeof import("@metamask/smart-accounts-kit/contracts");
    try {
        [kit, contracts] = await Promise.all([
            import("@metamask/smart-accounts-kit"),
            import("@metamask/smart-accounts-kit/contracts"),
        ]);
    } catch (cause) {
        throw new SmartAccountsKitMissingError(cause);
    }

    const chain = Array.isArray(params.delegations) ? params.delegations : [params.delegations];

    const calls = params.calls.map((call): PreparedCall => {
        const execution = kit.createExecution({
            target: call.to,
            value: call.value,
            callData: call.data,
        });
        const data = contracts.DelegationManager.encode.redeemDelegations({
            // The kit's `Delegation` carries the same fields as `DelegationLike`; the cast is the
            // boundary between a structural type this package can state and the kit's nominal one.
            delegations: [chain as unknown as import("@metamask/smart-accounts-kit").Delegation[]],
            modes: [kit.ExecutionMode.SingleDefault],
            executions: [[execution]],
        });
        return {
            // The inner call's chain, carried through: the DelegationManager happens to be at the
            // same address on 1155 and 13579, so the chain id is the only thing that distinguishes
            // a mainnet redemption from a testnet one.
            kind: call.kind,
            chainId: call.chainId,
            to: params.delegationManager,
            value: 0n,
            data,
            why: `${call.why} — redeemed under the operator's delegation`,
        };
    });

    return {
        calls,
        delegatorValue: params.calls.reduce((sum, call) => sum + call.value, 0n),
        delegationManager: params.delegationManager,
    };
}
