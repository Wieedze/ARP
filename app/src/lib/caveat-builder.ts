import {
    encodeAbiParameters,
    keccak256,
    toBytes,
    type Hex,
} from "viem";

import {deployments} from "./deployments";
import {intuitionTestnet} from "./chains";

import {
    createCaveat,
    getSmartAccountsEnvironment,
    type Caveat,
} from "@metamask/smart-accounts-kit";
import {
    createAllowedMethodsTerms,
    createAllowedTargetsTerms,
} from "@metamask/delegation-core";
import {toFunctionSelector} from "viem";

/**
 * Caveat builders for the two ARP custom enforcers deployed at the addresses
 * recorded in `deployments/13579.json`. Each builder returns a raw `Caveat`
 * (struct `{ enforcer, terms, args }`) ready to be placed in a delegation's
 * `caveats` array — the SDK does not auto-wrap our custom enforcers because
 * they are not part of the MetaMask standard enforcer catalogue.
 *
 * `terms` is the ABI-encoded byte payload the enforcer's `beforeHook`
 * decodes via `abi.decode(...)`. The encoding here MUST match the Solidity
 * decode line, otherwise the on-chain validation reverts at redemption.
 */

/**
 * `DomainScopeEnforcer` caveat. `terms` is `abi.encode(bytes32[])` where each
 * element is `keccak256(bytes(domain))`. Hashing on this side avoids
 * accidental case mismatches and saves on-chain calldata.
 *
 * @param allowedDomains  Domain identifiers the agent is permitted to
 *                        register modules in (e.g. `["solidity-audit"]`).
 *                        Must be non-empty; the enforcer reverts on
 *                        empty list.
 */
export function domainScopeCaveat(allowedDomains: string[]): Caveat {
    if (allowedDomains.length === 0) {
        throw new Error("domainScopeCaveat: allowedDomains must be non-empty");
    }
    const hashes = allowedDomains.map((d) => keccak256(toBytes(d)));
    const terms = encodeAbiParameters([{type: "bytes32[]"}], [hashes]);
    return {
        enforcer: deployments.arp.domainScopeEnforcer,
        terms,
        args: "0x" as Hex,
    };
}

/**
 * `TrustStakeCapEnforcer` caveat. `terms` is `abi.encode(uint256, uint256)`
 * with the per-window cap and the rolling-window length in seconds.
 *
 * @param cap            Maximum cumulative native-token spend per window
 *                       (in wei — tTRUST has 18 decimals on Intuition).
 * @param periodSeconds  Window length in seconds. Must be > 0; the enforcer
 *                       reverts on zero.
 */
export function trustStakeCapCaveat(cap: bigint, periodSeconds: bigint): Caveat {
    if (periodSeconds === 0n) {
        throw new Error("trustStakeCapCaveat: periodSeconds must be > 0");
    }
    const terms = encodeAbiParameters(
        [{type: "uint256"}, {type: "uint256"}],
        [cap, periodSeconds],
    );
    return {
        enforcer: deployments.arp.trustStakeCapEnforcer,
        terms,
        args: "0x" as Hex,
    };
}

/**
 * The MetaMask delegation framework environment for Intuition Testnet
 * (chainId 13579). Resolved once via `getSmartAccountsEnvironment` — the
 * vendored `@metamask/delegation-deployments` package ships the addresses
 * for this chain (confirmed at vendoring time).
 */
const SMART_ACCOUNTS_ENV = getSmartAccountsEnvironment(intuitionTestnet.id);

/**
 * Method selectors on `MultiVault` that the compose-and-stake delegation
 * authorizes the agent to call. Three selectors cover both ARP layers:
 *
 *   - `deposit`       — mutable layer (economic conviction on a tool atom)
 *   - `createAtoms`   — immutable layer (ensure tool/agent atoms exist)
 *   - `createTriples` — immutable layer (declare `(agent, uses, tool)`)
 *
 * The selectors are matched on-chain by MetaMask's stock
 * `AllowedMethodsEnforcer`. They form a closed set — the agent cannot call
 * any other MultiVault method (e.g. `redeem`, `withdraw`) under this
 * delegation, which is the point: the operator is granting positioning
 * authority, not exit authority.
 */
export const MULTI_VAULT_COMPOSE_SELECTORS: readonly string[] = [
    "deposit(address,bytes32,uint256,uint256)",
    "createAtoms(bytes[],uint256[])",
    "createTriples(bytes32[],bytes32[],bytes32[],uint256[])",
];

/**
 * Caveats for the **compose-and-stake** delegation:
 *
 *   - `AllowedTargetsEnforcer([MultiVault])`  (stock MetaMask) — pins target
 *     to Intuition's MultiVault. Agent cannot reach any other contract.
 *   - `AllowedMethodsEnforcer([deposit, createAtoms, createTriples])`
 *     (stock) — restricts to the three composing/staking selectors.
 *   - `TrustStakeCapEnforcer(cap, periodSeconds)` (ours) — caps cumulative
 *     `value` (msg.value, i.e. tTRUST stake amount) per rolling window.
 *
 * The three compose like AND. An agent calling
 * `MultiVault.deposit(...) { value: amount }` passes only if `amount` plus
 * prior spend in the window is ≤ cap; any call to a different target or
 * selector reverts at the framework level before reaching MultiVault.
 */
export function composeAndStakeCaveats(params: {
    cap: bigint;
    periodSeconds: bigint;
}): Caveat[] {
    const {AllowedTargetsEnforcer, AllowedMethodsEnforcer} =
        SMART_ACCOUNTS_ENV.caveatEnforcers;
    if (!AllowedTargetsEnforcer || !AllowedMethodsEnforcer) {
        throw new Error(
            "MetaMask AllowedTargets/Methods enforcers missing from environment — chain misconfiguration",
        );
    }

    const targetsTerms = createAllowedTargetsTerms({
        targets: [deployments.intuition.multiVault],
    });
    const methodsTerms = createAllowedMethodsTerms({
        selectors: MULTI_VAULT_COMPOSE_SELECTORS.map((sig) =>
            toFunctionSelector(sig),
        ),
    });

    return [
        createCaveat(AllowedTargetsEnforcer, targetsTerms),
        createCaveat(AllowedMethodsEnforcer, methodsTerms),
        trustStakeCapCaveat(params.cap, params.periodSeconds),
    ];
}

/**
 * Caveats for the **publish-modules** delegation:
 *
 *   - `DomainScopeEnforcer([allowedDomains])` (ours) — restricts to
 *     `ModuleRegistry.registerModule` calls in the listed domains.
 *   - `TrustStakeCapEnforcer(cap, periodSeconds)` (ours) — caps cumulative
 *     spend per period. `registerModule` is not payable so `value` is 0
 *     for every call; the cap is mostly a safety net for compose with
 *     future payable variants. We include it so the two delegations
 *     have symmetric shapes in the operator UI.
 *
 * Notably, no target restriction is added: `DomainScopeEnforcer` is itself
 * scoped by the `registerModule` selector check, so the agent cannot
 * accidentally call something else through this delegation.
 */
export function publishModuleCaveats(params: {
    allowedDomains: string[];
    cap: bigint;
    periodSeconds: bigint;
}): Caveat[] {
    return [
        domainScopeCaveat(params.allowedDomains),
        trustStakeCapCaveat(params.cap, params.periodSeconds),
    ];
}
