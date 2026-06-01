# MetaMask delegation rules

Load when a task touches the MetaMask Smart Accounts Kit, ERC-7710 delegation, or ARP caveat enforcers. Specifically: tasks 02b (enforcers), 03b (Smart Account integration), 04b (agent registration UI), and any future work in that surface.

This rule supplements (not replaces) `solidity.md` for the on-chain enforcer side and `code.md` for the TypeScript SDK side.

## Authoritative sources

Procedural references (vendored into this repo, read these first):

- **`mms-smart-accounts-kit`** — `.claude/skills/mms-smart-accounts-kit/SKILL.md` + the `references/` subdirectory inside the same skill (smart-accounts, delegations, advanced-permissions). Covers ERC-4337 account creation, signer types (Hybrid / MultiSig / Stateless7702), delegations, ERC-7715 advanced permissions, and the Delegation Framework.
- **`mms-gator-cli`** — `.claude/skills/mms-gator-cli/SKILL.md`. Covers the `@metamask/gator-cli` CLI for delegation operations (init, grant, redeem, revoke), profile config, and EIP-7702 EOA upgrade flows. Useful for shell-driven testing of delegations before wiring up the UI.

Upstream sources of truth (the vendored skills are derived from these — when the SDK behavior is unclear, defer here):

- **MetaMask Smart Accounts Kit docs** — https://docs.metamask.io/smart-accounts-kit/
- **MetaMask Delegation Framework** — the on-chain side, source of the `ICaveatEnforcer` interface.

Project context:

- `docs/00_HACKATHON_PIVOT.md` — the hackathon brief, with Task 02b/03b/04b deliverables.
- ADR `0003-metamask-skills-vendored-locally.md` — records why the skills were vendored and how to re-sync.

If a vendored skill conflicts with the upstream docs, the upstream docs win (the vendored copy is a snapshot). If the SDK behavior conflicts with anything in this rule file, escalate to the user — do not silently work around it.

## On-chain side: caveat enforcers

### Interface (exact, current framework version)

Authoritative source: `.claude/skills/mms-smart-accounts-kit/references/delegations.md` (the vendored MetaMask docs). Every ARP enforcer implements `ICaveatEnforcer`, which has **four hooks**:

```solidity
interface ICaveatEnforcer {
    function beforeAllHook(
        bytes calldata _terms,
        bytes calldata _args,
        ModeCode _mode,
        bytes calldata _executionCalldata,
        bytes32 _delegationHash,
        address _delegator,
        address _redeemer
    ) external;

    function beforeHook(
        bytes calldata _terms,
        bytes calldata _args,
        ModeCode _mode,
        bytes calldata _executionCalldata,
        bytes32 _delegationHash,
        address _delegator,
        address _redeemer
    ) external;

    function afterHook(
        bytes calldata _terms,
        bytes calldata _args,
        ModeCode _mode,
        bytes calldata _executionCalldata,
        bytes32 _delegationHash,
        address _delegator,
        address _redeemer
    ) external;

    function afterAllHook(
        bytes calldata _terms,
        bytes calldata _args,
        ModeCode _mode,
        bytes calldata _executionCalldata,
        bytes32 _delegationHash,
        address _delegator,
        address _redeemer
    ) external;
}
```

Parameters:

- `_terms` — caveat-specific config encoded by the user at delegation time, decoded via `abi.decode(_terms, (T1, T2, ...))`.
- `_args` — caveat-specific runtime args (often empty for ARP; reserved for caveats that take redemption-time parameters).
- `_mode` — execution mode (single-call/default vs batch/try). Reject batch/try at the top of `beforeHook`.
- `_executionCalldata` — the action the redeemer is attempting (target/value/calldata triple per the framework's execution format). Decode and validate against `_terms`.
- `_delegationHash` — unique hash of the delegation being redeemed. **Use as the key for per-delegation state** in stateful enforcers.
- `_delegator` — the Smart Account that granted the delegation.
- `_redeemer` — the address operating under the delegation (ARP's "agent").

None of the four hooks are `view`. State mutations are permitted — required for `TrustStakeCapEnforcer`. The hooks differ in *when* they fire relative to the execution and the caveat chain:

| Hook | Fires |
|---|---|
| `beforeAllHook` | Once per redemption, before any caveat-specific `beforeHook` |
| `beforeHook` | Once per caveat, before the execution |
| `afterHook` | Once per caveat, after the execution |
| `afterAllHook` | Once per redemption, after all caveat-specific `afterHook`s |

For ARP MVP, both enforcers do their validation in `beforeHook` and leave the other three as no-ops (still required to be present to satisfy the interface).

> **Bear Trap caveat**: the Bear Trap brief at `docs/06_BEAR_TRAP_REFERENCE.md` shows a simplified 2-hook signature with parameter order `(terms, execution, mode, args, delegationHash, delegator, delegate)`. That signature is **stale**. Follow the 4-hook signature above. Bear Trap's *patterns* (custom errors, mode guards, `delegationHash`-keyed state, single-purpose enforcers) are still correct; only the signature changed.

### `DomainScopeEnforcer` (Task 02b)

- `_terms` encodes `bytes32[] allowedDomainHashes` — the keccak256 hashes of each domain the agent is authorized to stake on. Hashing avoids string comparisons on-chain.
- `_executionCalldata` decodes to the staking action, including the target tool atom ID (or its domain directly, depending on the Intuition staking method signature — confirm at Task 02b time).
- The enforcer resolves the atom's domain via `ModuleRegistry` (or extracts it from calldata if available), hashes it, and reverts with `DomainNotAllowed(bytes32 domainHash)` if it's not in the allowed set.
- Reject batch and try execution modes at the top of `beforeHook`.
- O(n) over `allowedDomainHashes` is acceptable for MVP — the list is short (one to a few domains). No need for a mapping.
- Emit `event DomainScopeChecked(bytes32 indexed delegationHash, bytes32 domainHash, bool allowed)` on every check.
- `beforeAllHook`, `afterHook`, `afterAllHook` are no-op.
- Tests: 15-20 minimum, matching Bear Trap's density. See test list in `docs/06_BEAR_TRAP_REFERENCE.md` "Concrete ARP enforcer specifications".
- 100% line + branch coverage on the contract.

### `TrustStakeCapEnforcer` (Task 02b)

- `_terms` encodes `(uint256 cap, uint256 periodSeconds)` — the cap value and the rolling period length.
- `_executionCalldata` decodes to the stake action, including the amount.
- State, keyed by `_delegationHash`:

  ```solidity
  mapping(bytes32 delegationHash => uint256 cumulativeStake) private _cumulativeStake;
  mapping(bytes32 delegationHash => uint256 windowStartTime) private _windowStart;
  ```

- Validation order in `beforeHook`:
  1. Reject batch/try modes.
  2. Decode `_terms` to get `cap` and `period`.
  3. Decode `_executionCalldata` to get the attempted stake amount.
  4. If `block.timestamp - _windowStart[_delegationHash] >= period`, reset cumulative and update window start.
  5. Compute `proposed = _cumulativeStake[_delegationHash] + attempted`.
  6. If `proposed > cap`, revert with `StakeExceedsCap(proposed, cap)`.
  7. Update `_cumulativeStake[_delegationHash] = proposed`.
- Emit `event StakeCapChecked(bytes32 indexed delegationHash, uint256 cumulativeAmount, uint256 cap)`.
- `beforeAllHook`, `afterHook`, `afterAllHook` are no-op.
- Document the `block.timestamp` miner-manipulation tolerance (~15 s) in NatSpec — non-issue at our period scale (days) but worth recording.
- Tests: 15-20 minimum including window expiration, exact-cap, fuzz over caps/amounts/timings. See `docs/06_BEAR_TRAP_REFERENCE.md`.

### Both enforcers

- Custom errors only. No require strings.
- NatSpec on every external function and the contract itself.
- Document the threat model in the contract header: who calls each hook (the `DelegationManager`), what `_delegator` and `_redeemer` mean for ARP, what happens on revert.
- Optionally enforce `msg.sender == DELEGATION_MANAGER` on each hook (Bear Trap's audit recommends this). Decide at Task 02b time; document the choice in the contract.
- Trail of Bits review pass before the task is considered complete (via `contract-reviewer` agent). The enforcer-specific items in the security checklist of `docs/06_BEAR_TRAP_REFERENCE.md` are now part of the reviewer's checklist.

## Off-chain side: Smart Accounts Kit (TypeScript)

### Account creation

Use the Smart Accounts Kit factory functions from `@metamask/delegation-toolkit` (or whichever package the docs specify at the time of work). Do not roll a custom factory.

The flow is:

1. User has an EOA (their MetaMask wallet).
2. App calls `createSmartAccount({ chain: intuitionTestnet, ... })` (or the equivalent SDK call).
3. The Smart Account is deployed on-demand, deterministically derived from the EOA + salt.
4. The app stores the Smart Account address in app state (and optionally exposes it for the user to view).

The Smart Account address is the **agent's operating identity**. It is the `delegator` in subsequent delegations.

### Delegation signing

A delegation is an EIP-712-signed message that grants a delegate (the agent runner) permission to execute on behalf of the delegator (the Smart Account), bounded by caveat enforcers.

The flow:

1. User configures the caveat parameters in the UI (allowed domains list; stake cap + period).
2. App constructs the delegation payload via the SDK, including a `caveats` array referencing the deployed `DomainScopeEnforcer` and `TrustStakeCapEnforcer` addresses and their `terms` encodings.
3. User signs the delegation via MetaMask (EIP-712 signature).
4. Signed delegation is stored client-side. The signature is what the agent presents at execution time.

**Hard rules**:

- The `terms` encoded in the delegation are computed once, by the UI, and never modified after signing. Tampering invalidates the signature.
- The delegation includes a `salt` or `nonce` so duplicate delegations are distinguishable.
- The agent's address (delegate) is set at signing time. It cannot be reassigned without a new signature.

### Execution under delegation

When the agent performs an action (stake on a tool, post an attestation):

1. The agent constructs the intended `execution` (target contract, calldata).
2. The agent submits a `redeemDelegation` (or equivalent) call to the framework's executor, providing the signed delegation + the execution.
3. The framework calls each caveat enforcer's `beforeHook` in order. Any revert aborts.
4. If all caveats pass, the framework executes the action as the delegator.

The UI must demonstrate both happy path (in-scope action executes) and revert path (out-of-scope action correctly reverts via the enforcer).

## x402 integration (Task 03b secondary, hackathon scope)

x402 is the HTTP-payment-required pattern. ARP's secondary track use:

- Agents pay for tool/API access via x402.
- Payment is bounded by the same caveat enforcers — the delegation limits how much the agent can spend per period.

The MetaMask docs have a **buyer-with-delegations** guide for x402. Follow it. ARP does not implement custom payment logic — we reuse the framework patterns and apply our enforcers.

If x402 integration grows beyond following the docs (e.g., custom resource-pricing logic), that's a scope expansion and should be discussed with the user before implementing.

## Storage

- Smart Account addresses → app state (in-memory or localStorage, never in code).
- Signed delegations → client-side storage. The hackathon does not require on-chain delegation publication. If a future task requires it, that's a new decision documented as an ADR.
- Enforcer contract addresses → `deployments/<chainId>.json`, same convention as `ModuleRegistry`.

## Testing

- Enforcers: 100% Foundry coverage including revert paths. Fork tests against deployed `ModuleRegistry` on Intuition Testnet for `DomainScopeEnforcer` (since it resolves atom domains).
- Smart Account flow: integration test that walks the full create → sign → execute → revert sequence on Intuition Testnet.
- The UI demo flow must work end-to-end without manual intervention beyond the user signing.

## Review

- Solidity enforcers → `contract-reviewer` agent (extended Trail of Bits checklist for caveat-specific concerns).
- TypeScript SDK usage → `ui-reviewer` agent (for the UI side) + a manual review of SDK usage against the official docs.
- The `task-verifier` checks the narrative-preservation question on every hackathon task: "Does this preserve the hackathon submission narrative?" Required answer in the completion report.
