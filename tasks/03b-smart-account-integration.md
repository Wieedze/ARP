# Task 03b — Smart Account + Delegation SDK Integration

> **Status: COMPLETE** (2026-06-01). Post-mortem: `.claude/learning/05-smart-account-integration.md`. Live end-to-end on Intuition Testnet. ADR: `0009-smart-account-deploy-via-simple-factory.md`.

> **Hackathon track**: MetaMask Dev Cook-Off — primary track ($3000 Best Agent). Narrative-preservation check required in completion report.

## Objective

Wire the off-chain SDK layer that enables the hackathon submission narrative on-chain:

> *An agent registers via MetaMask Smart Accounts, declares its tool composition on Intuition's semantic graph, stakes TRUST on its tools using Intuition's exponential bonding curve, and posts attestations autonomously within a scoped ERC-7710 delegation. The delegation is bounded by ARP-specific caveat enforcers that restrict staking to declared domains and cap exposure per period.*

Concretely: a user creates a MetaMask Smart Account, signs an ERC-7710 delegation scoped by ARP's two custom caveat enforcers (deployed Task 02b/03), and an autonomous agent EOA acts under that delegation through the MetaMask `DelegationManager`. Out-of-scope agent actions revert via the enforcers.

Pure TypeScript / SDK work — Task 04b adds the React UI on top of these services.

## Required skills

- **Canonical**: `mms-smart-accounts-kit` (read `references/smart-accounts.md` + `references/delegations.md`)
- Plus: `mms-gator-cli` (CLI patterns reference)
- Supplementary: `docs/06_BEAR_TRAP_REFERENCE.md` (constants — ROOT_AUTHORITY, EIP-712 domain)

## Required rules

- `.claude/rules/code.md`
- `.claude/rules/ui.md` (some sections — even though this is services, the code lives in `app/`)
- `.claude/rules/metamask-delegation.md`

## Deliverables

- [x] `app/src/lib/clients.ts` — viem publicClient + walletClient factory bound to Intuition Testnet
- [x] `app/src/lib/deployments.ts` — typed import of `deployments/13579.json` for in-app consumption
- [x] `app/src/lib/caveat-builder.ts` — `domainScopeCaveat(allowedDomains[])` + `trustStakeCapCaveat(cap, period)` returning raw `Caveat` structs with ABI-encoded `terms` matching the Solidity decode signatures
- [x] `app/src/services/smart-account.ts` — `createUserSmartAccount({owner, signer, deploySalt?})` factory + `deploySmartAccountIfNeeded` helper that materializes the SA on-chain via `SimpleFactory`
- [x] `app/src/services/delegation.ts` — `buildDelegation(...)`, `signDelegationAs(...)` (SA path), `signDelegationViaEOA(...)` (utility), `randomSalt()`, `serialize/deserialize`
- [x] `app/src/services/agent-action.ts` — `buildRegisterModuleExecution(...)` + `redeemArpDelegation(...)` wrapping `DelegationManager.execute.redeemDelegations`
- [x] `scripts/demo-delegation.ts` — full end-to-end CLI demo, both happy + revert paths, runs on real Intuition Testnet
- [x] `.env.example` extended with `AGENT_PRIVATE_KEY` + `AGENT_ADDRESS`
- [x] Workspace viem deduplication via `overrides` in root `package.json` — single physical viem install (TypeScript identity-type unification)
- [x] User Smart Account deployed on Intuition Testnet (real, not counterfactual)
- [x] End-to-end demo verified: HAPPY (in-scope) succeeds on-chain, REVERT (out-of-scope) reverts with `DomainNotAllowed(bytes32)` selector `0xf2882f43`
- [x] ADR 0009 records the SA-deploy-via-SimpleFactory + Bundler-deferred-to-04b choices

## Architectural decisions made (see ADR 0009)

1. **viem pinned to 2.31.4** in both workspaces, plus `"overrides": { "viem": "2.31.4" }` at the root `package.json` to force Bun's workspace tree into a single physical viem install. Eliminates type-clash at the SDK boundary (the SDK's bundled viem types and our application viem types unify by file identity, not just version string).

2. **Smart Account deployed via `SimpleFactory.deploy` directly**, bypassing a Bundler. The DelegationManager calls `IDeleGatorCore.executeFromExecutor` on the delegator after the enforcer chain passes — requiring real bytecode at the delegator address, not just a counterfactual SA. Without a Bundler, we deploy via the SDK's exposed `{factory, factoryData}` pair sent as a plain transaction funded by the user EOA.

3. **Bundler integration deferred to Task 04b**. Production-grade ERC-4337 wiring (Pimlico, Infura, or self-hosted) is more naturally added with the UI layer where userOps go through the wallet/connector chain. For Task 03b's CLI demo, direct factory deployment is sufficient and simpler.

4. **EOA-as-delegator rejected**. We initially tried using the user's EOA directly as `delegator` to skip Smart Account deployment. The DelegationManager's `IDeleGatorCore(delegator).executeFromExecutor(...)` call at line 252 of `DelegationManager.sol` requires a contract — calling that method on an EOA produces a silent empty revert (`0x`). EOA-as-delegator is fundamentally incompatible with this framework.

5. **`createDelegation` from the SDK bypassed**. The SDK helper requires a `scope` (one of MetaMask's standard scope types) or a parent delegation. ARP uses purely custom enforcers, so we construct the `Delegation` struct manually with `buildDelegation`. The struct shape is canonical (matches `@metamask/smart-accounts-kit`'s `Delegation` type).

## Do not do in this task

- Do not write the React UI components (Task 04b).
- Do not deploy the user's Smart Account UI flow (Task 04b — connect wallet, derive SA, sign delegation through MetaMask browser extension).
- Do not write the Bundler / userOp orchestration (Task 04b).
- Do not modify any deployed contract.
- Do not introduce a new Solidity contract.
- Do not change the existing `deployments/13579.json` structure.

## On-chain proof

| Artifact | Address / tx | Block |
|---|---|---|
| User Smart Account | `0x3bc5F13D75CeBe0Bf0b62fBf1F4effcD4c679561` | — |
| SA deployment tx | `0x3708e0fd404aa6cc1460ac8933356cdfc686d6702bf47c5417c1d4660601f8fc` | — |
| Happy: `registerModule("Demo Audit Module", "solidity-audit", ...)` | `0x5121ddcde75fb7ac625b4759abbf4b6463046f2830d1377e3174f5d0768e98be` | 9 346 214 |
| Revert: `DomainNotAllowed(bytes32)` selector `0xf2882f43` from `DomainScopeEnforcer.beforeHook` | (simulated; no on-chain inclusion since the redeem reverted) | — |

The selector `0xf2882f43` verified against `cast sig "DomainNotAllowed(bytes32)"`.

## Verification

```bash
# From repo root
cd /home/max/Project/ARP
set -a && source .env && set +a
bun run scripts/demo-delegation.ts
# expected: SA deploy + delegation sign + HAPPY tx success + REVERT with selector
```

Typecheck:
```bash
cd app && bun x tsc --noEmit -p tsconfig.app.json
```

## Narrative-preservation check (hackathon-tagged)

> *Does this preserve the hackathon submission narrative?*

**Yes.** The committed code + on-chain proof together demonstrate the exact frame of `docs/00_HACKATHON_PIVOT.md`: a user creates a MetaMask Smart Account (Hybrid implementation, EOA owner), signs an ERC-7710 delegation scoped by two ARP-specific caveat enforcers (`DomainScopeEnforcer` + `TrustStakeCapEnforcer`), and an autonomous agent EOA acts under that delegation through MetaMask's `DelegationManager` — with out-of-scope actions rejected by the on-chain enforcer chain. The MetaMask Smart Accounts Kit is visible in the main flow (qualification requirement).

## Report format

```
**What shipped**
**What I decided**
**What's next or blocked**
**Does this preserve the hackathon submission narrative?**
```
