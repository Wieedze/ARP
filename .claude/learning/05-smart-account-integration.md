# 05 — Smart Account + Delegation SDK Integration

**Task:** `tasks/03b-smart-account-integration.md`
**Completed:** 2026-06-03
**Commit:** `50bd274` (phases 2-4), `bc80950` (phase 1)
**Verifier verdict:** PASS

## What shipped

- `app/src/lib/clients.ts` — viem `publicClient` + `walletClientFromKey` factory bound to Intuition Testnet.
- `app/src/lib/deployments.ts` — typed import of `deployments/13579.json` with `Deployments` shape.
- `app/src/lib/caveat-builder.ts` — `domainScopeCaveat([])` + `trustStakeCapCaveat(cap, period)` returning raw `Caveat` structs with ABI-encoded `terms` matching enforcer decode signatures.
- `app/src/services/smart-account.ts` — `createUserSmartAccount` (Hybrid) + `deploySmartAccountIfNeeded` (SimpleFactory direct, bypasses Bundler).
- `app/src/services/delegation.ts` — `buildDelegation`, `signDelegationAs` (SA path), `signDelegationViaEOA` (utility), `randomSalt`, `serialize/deserialize`. `ROOT_AUTHORITY` constant exported.
- `app/src/services/agent-action.ts` — `buildRegisterModuleExecution` + `redeemArpDelegation` wrapping `DelegationManager.execute.redeemDelegations`.
- `scripts/demo-delegation.ts` — end-to-end CLI demo, both happy + revert paths, real Intuition Testnet.
- `.env.example` — `AGENT_PRIVATE_KEY` + `AGENT_ADDRESS` added.
- Root `package.json` — `"overrides": { "viem": "2.31.4" }` deduplicates viem to a single physical install in the Bun workspace tree.

On-chain artifacts (Intuition Testnet, chain 13579):
- User Smart Account `0x3bc5F13D75CeBe0Bf0b62fBf1F4effcD4c679561` deployed (tx `0x3708e0fd...`).
- Happy: `registerModule("Demo Audit Module", "solidity-audit", ...)` succeeded, tx `0x5121ddcd...`, block 9 346 214. `ModuleRegistry.totalModules()` now returns 2 (verified via `cast call`).
- Revert: `DomainNotAllowed(bytes32)` selector `0xf2882f43` confirmed by `cast sig`. Selector observed in demo revert trace.

## Surprises

- **EOA-as-delegator is fundamentally broken** in this framework. The `DelegationManager` calls `IDeleGatorCore(delegator).executeFromExecutor(...)` at L252 — produces a silent `0x` empty revert when delegator has no bytecode. Counterfactual SA addresses fail the same way. Real bytecode at the delegator address is mandatory before the SA can act as delegator.
- **`createDelegation` SDK helper does not fit ARP's model.** It expects either a MetaMask standard `scope` or a parent delegation. ARP uses purely custom enforcers — the helper has no path for that. We construct the canonical `Delegation` struct manually; this is what the SDK's `Delegation` type was designed to accommodate.
- **viem identity-type unification matters.** Even with the same version string, two distinct viem installs in a workspace produce types that fail to unify at SDK boundaries (the SDK's bundled types vs the app's types). Bun's `overrides` field forces a single physical install — clean typecheck without `as` casts at the SDK seam.

## Decisions made

- **viem pinned + Bun `overrides`.** Documented Bun feature. ADR: `.claude/choices/0009-smart-account-deploy-via-simple-factory.md`.
- **Smart Account deployed via `SimpleFactory.deploy` directly**, bypassing a Bundler. ADR: same.
- **Bundler / userOp orchestration deferred to Task 04b** where the wallet/connector chain provides natural integration points. ADR: same.
- **EOA-as-delegator rejected** after testing — documented for next person. ADR: same.
- **`createDelegation` SDK helper bypassed** in favour of manual struct construction. ADR: same.

## Rules touched

- `.claude/rules/metamask-delegation.md` — sufficient. The `ICaveatEnforcer` 4-hook signature and the off-chain "Account creation" + "Delegation signing" + "Execution under delegation" sections matched the SDK's actual behaviour.
- `.claude/rules/code.md` — sufficient. Service/lib/presentation separation held cleanly: services have no React imports; the CLI script is the only consumer constructing wallet clients inline.
- `.claude/rules/ui.md` — N/A (no UI shipped; deferred to Task 04b as specified).
- `.claude/rules/workflow.md` — sufficient. Scope discipline held — no UI components, no Bundler, no contract changes.

## Suggestions for future tasks

- For Task 04b, the UI's wallet-connector layer should wrap `createUserSmartAccount` with the second signing mode (`{walletClient}`) and add a Bundler client so first-use deployment goes through a userOp instead of `SimpleFactory.deploy`. The service signatures already support both paths.
- Keep `"overrides": { "viem": "<pinned>" }` in the root `package.json` for any future task that imports from `@metamask/smart-accounts-kit`. Removing it will reintroduce the type-clash.
- The `signDelegationViaEOA` helper is now dead code for ARP's primary flow (we proved SA path works) but kept as a utility because future use cases may want a delegator that's purely an EOA-signed envelope around a Smart Account-owned authority. Re-evaluate at Task 06+.
- The demo script's CLI pattern (no React, raw clients, real-chain proof) is the right shape for future hackathon-tagged proofs of life. Reuse it for Task 04b's screen-recordable demo.

## Narrative preservation (hackathon tasks only — 02b, 03b, 04b, 05b)

**Does this preserve the hackathon submission narrative?**

Yes — the committed services + on-chain proof together demonstrate the exact frame of `docs/00_HACKATHON_PIVOT.md`: a user creates a MetaMask Smart Account (Hybrid, EOA-owned), signs an ERC-7710 delegation scoped by two ARP-specific caveat enforcers (`DomainScopeEnforcer` + `TrustStakeCapEnforcer`), and an autonomous agent EOA acts under that delegation through `DelegationManager` — with out-of-scope actions correctly rejected on-chain by the enforcer chain (revert selector `0xf2882f43` matching `DomainNotAllowed(bytes32)`), making the MetaMask Smart Accounts Kit visible in the main flow (qualification requirement).
