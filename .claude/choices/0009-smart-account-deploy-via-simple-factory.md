# 0009 — Smart Account deployed via SimpleFactory for Task 03b; Bundler deferred to Task 04b

**Status:** Accepted
**Date:** 2026-06-01
**Triggered by:** Task 03b Phase 4 (CLI demo). First on-chain redemption attempt failed with a silent `0x` revert from the DelegationManager. Investigation traced it to `DelegationManager.sol` line 252:
> `IDeleGatorCore(delegator).executeFromExecutor(mode, executionCallData);`
> Calling that on an EOA (no contract code) produces an empty EVM revert.

Plus three subsidiary decisions surfaced during the same phase: viem dedup via Bun `overrides`, EOA-as-delegator rejection, and the `createDelegation` SDK bypass.

## Context

Task 03b's goal was to wire the off-chain SDK so an agent can act under an ERC-7710 delegation bounded by ARP's custom caveat enforcers. The natural assumption — borrowed from the gator-cli flow — was:

1. User signs a delegation from their EOA.
2. Agent EOA submits `redeemDelegations(...)` to the DelegationManager.
3. Framework validates signature, runs enforcer `beforeHook`s, executes the action.

That model breaks at step 3. After enforcer checks pass, the DelegationManager casts the delegator address to `IDeleGatorCore` and calls `executeFromExecutor` on it. The interface is implemented by every MetaMask Smart Account variant (Hybrid, MultiSig, Stateless7702 via EIP-7702). An EOA has no code, so the call falls through to the EVM's empty-revert path. No custom error, no descriptive message — just `0x`.

This is not a bug. It's the framework's isolation invariant: the DelegationManager itself never executes — every authorized action runs *as the delegator*, in the delegator's context. That requires the delegator to be a contract.

MetaMask SAs are counterfactual by default: the address is CREATE2-deterministic but no bytecode is deployed until an EntryPoint userOp processes a `factory + factoryData` initCode wrapper. Production wires this through a Bundler (Pimlico, Infura, or self-hosted). Without a Bundler, the standard pattern is direct factory deployment.

The SDK exposes `factory: Address` and `factoryData: Hex` on the viem `SmartAccount` instance — sending a plain tx `to: factory, data: factoryData` deploys the SA. Funded by the user's EOA. One transaction, ~500k gas.

## Decision

**Primary**: For Task 03b's CLI demo (and as a baseline ARP service the UI in Task 04b will polish), Smart Accounts are **deployed directly via `SimpleFactory`** before the first delegation is signed. The helper `deploySmartAccountIfNeeded({smartAccount, funderWalletClient})` in `app/src/services/smart-account.ts`:

1. Reads code at the SA's counterfactual address via `publicClient.getCode`.
2. Returns `null` if already deployed.
3. Otherwise gets `{factory, factoryData}` from `smartAccount.getFactoryArgs()` and sends a plain transaction funded by the user's EOA (`funderWalletClient`).

Bundler / userOp orchestration is **deferred to Task 04b**, where it lives more naturally with the UI's wallet connector chain.

**Subsidiary**: Four related decisions, recorded here so they aren't lost:

1. **viem pinned to 2.31.4 + Bun `overrides`**. The SDK ships its types compiled against viem 2.31.4. Pinning our viem to 2.31.4 in both workspaces alone isn't enough — Bun's workspace isolation places a copy in each workspace's `node_modules`, and TypeScript treats them as distinct nominal types even when the source is byte-identical. Adding `"overrides": { "viem": "2.31.4" }` at the root `package.json` collapses the tree to a single physical viem install. Documented Bun feature, no bricolage.

2. **EOA-as-delegator rejected**. Tested. Fails with the `0x` revert documented above. Not a viable shortcut.

3. **`createDelegation` from the SDK bypassed**. The helper requires either a `scope` (one of MetaMask's standard caveat types — `erc20TransferAmount`, `allowedTargets`, etc.) or a `parentDelegation` or a `parentPermissionContext`. ARP uses purely custom enforcers, none of which fit a standard scope. We construct the `Delegation` struct manually with `buildDelegation`. The struct shape is canonical (matches the SDK's `Delegation` type).

4. **Two delegation signing paths kept in the service** — `signDelegationAs` (Smart Account method, used for the demo) and `signDelegationViaEOA` (standalone SDK function with the framework's EIP-712 typed-data builder, kept as a utility for future flows where the SA is genuinely not needed).

## Alternatives considered

- **Full ERC-4337 Bundler in Task 03b**. Rejected — Pimlico/Infura account setup, RPC config, billing tier choice, all add ~30-45 min of yak-shaving for a Phase 4 CLI demo. The UI in Task 04b is the natural surface where the wallet connector chain owns Bundler config too. Doing both at once is more efficient than splitting.
- **EIP-7702 stateless delegator**. The framework has `EIP7702StatelessDeleGatorImpl` deployed at `0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B` for exactly this — the user's EOA acts like a SA via the EIP-7702 type-0x04 transaction. Rejected for now: viem 2.31.4's EIP-7702 helpers are less battle-tested than the SA deploy path, and the chain may or may not support EIP-7702 (we'd need to verify). Worth revisiting later if the SA-deploy gas cost becomes a UX concern.
- **Skip the full delegation flow; demo enforcers directly via `cast call` against `beforeHook`**. Rejected — partial story. Wouldn't prove the framework integration, wouldn't satisfy the hackathon's "MetaMask Smart Accounts Kit visible in the main flow" qualification.
- **EOA-as-delegator with a custom-deployed "EOA executor proxy"**. Rejected — bespoke contract that re-implements the part of `IDeleGatorCore.executeFromExecutor` we need. Effectively reinventing the MetaMask SA at lower quality. Strictly worse than just deploying the SA.

## Consequences

**Positive:**
- The on-chain delegation flow works end-to-end on Intuition Testnet. Verified happy + revert paths in commit `50bd274`.
- Task 03b is genuinely done — not "done modulo Bundler setup".
- The UI in Task 04b inherits a working service layer with a clear extension point (replace the explicit `deploySmartAccountIfNeeded` call with a Bundler-driven userOp once the wallet connector is wired).
- viem dedup is fully documented via the Bun overrides mechanism — collaborators (and the contract-reviewer agent) can audit the choice from `package.json` alone.

**Negative:**
- The user's EOA pays the SA deploy gas (~500k gas at 0.2 gwei = ~0.0001 tTRUST). For a UI in production, lazy deployment via Bundler is more elegant (user pays in the first action, not as a separate setup tx). On testnet at 1 gwei this is negligible; on mainnet it's still cents. Worth flagging but not a blocker.
- The CLI demo carries logic (`deploySmartAccountIfNeeded` invocation) that the UI will move to a different code path. Slight code duplication risk if both flows diverge. Mitigation: the helper itself is shared; only the *when* it's called differs.

**Neutral (worth knowing):**
- The framework also rejects the `_args` parameter pattern in the `Caveat` struct (we encode it as `0x`, which is the documented "empty args" convention). If a future enforcer needs runtime args, that's a new pattern to introduce.
- `Implementation.Hybrid` is the right default for ARP (EOA owner, optional passkey signers in future). `Stateless7702` would require chain-level EIP-7702 support and a different tx type; `MultiSig` is overkill for a single-user demo.
- The on-chain proof in commit `50bd274` includes the SA deployment tx, the happy redemption tx, and the revert selector. Anyone with the repo + an Intuition Testnet RPC can re-derive the addresses (deterministic via owner + salt) and inspect the actual chain state.

## References

- Failing line: `contracts/lib/delegation-framework/src/DelegationManager.sol:252`
- Decision-bearing commit: `50bd274` (Task 03b phases 2-4)
- Helper: `app/src/services/smart-account.ts → deploySmartAccountIfNeeded`
- Bun overrides: root `package.json` — `"overrides": { "viem": "2.31.4" }`
- Canonical SDK references: `.claude/skills/mms-smart-accounts-kit/references/smart-accounts.md` and `references/delegations.md`
- On-chain proof:
  - User SA: `0x3bc5F13D75CeBe0Bf0b62fBf1F4effcD4c679561`
  - SA deploy tx: `0x3708e0fd404aa6cc1460ac8933356cdfc686d6702bf47c5417c1d4660601f8fc`
  - Happy tx: `0x5121ddcde75fb7ac625b4759abbf4b6463046f2830d1377e3174f5d0768e98be` (block 9 346 214)
  - Revert selector: `0xf2882f43` (`DomainNotAllowed(bytes32)`)
- Related ADRs: `0002-hackathon-pivot-metamask-cookoff.md`, `0003-metamask-skills-vendored-locally.md`, `0004-bear-trap-as-enforcer-reference.md`
- Post-mortem: `.claude/learning/05-smart-account-integration.md`
