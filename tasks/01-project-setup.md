# Task 01 — Project Setup (post-pivot)

> **Status: COMPLETE** (2026-06-01). Post-mortem: `.claude/learning/01-project-setup.md`. Spec revision rationale: ADR `0005-intuition-skill-vendored-locally.md` and `0006-task-01-spec-revision.md`.

## Objective

Bring the existing repository scaffolding to a working baseline for the MetaMask Dev Cook-Off hackathon. This task is **additive over what was already scaffolded**:

1. Verify the existing Bun + Foundry + Vite toolchain works end-to-end.
2. Add MetaMask Delegation Framework dependencies for Tasks 02b / 03b / 04b.
3. Bascule the chain config from the original Base Sepolia target to Intuition Testnet (chainId 13579), per `docs/00_HACKATHON_PIVOT.md`.

This supersedes the original Task 01 scope, which assumed an empty repo + pnpm. The repo was already partially scaffolded with Bun workspaces. See ADR `0006` for the revision rationale.

## Prerequisites

- Node 20+ (`/home/max/.nvm/versions/node/v20.19.3/bin/node` on this machine)
- Bun 1.3+ (`/home/max/.bun/bin/bun`)
- Foundry latest (`forge 1.7.1`)
- Git, with the repo path declared as a safe.directory if running under a different user than the file owner (`git config --global --add safe.directory /home/max/Project/ARP`)

## Deliverables

- [x] `bun install` at root succeeds and installs both `app` and `contracts` workspaces
- [x] Foundry initialized in `contracts/` with `forge init --force --no-git` (legacy package.json preserved)
- [x] Default `Counter.sol`, `Counter.t.sol`, `Counter.s.sol`, auto-generated `README.md` removed
- [x] `contracts/foundry.toml` written with:
  - solc 0.8.24, optimizer 200, via_ir false, ffi false
  - `fs_permissions` for read-only access to `../deployments`
  - `[fmt]` block with project conventions
  - `[rpc_endpoints]` mapping `intuition_testnet` to `${INTUITION_TESTNET_RPC_URL}`
  - `[etherscan]` mapping `intuition_testnet` to the testnet Blockscout-style verifier
- [x] `forge install metamask/delegation-framework@v1.3.0` populates `contracts/lib/delegation-framework/`
- [x] `ICaveatEnforcer.sol` source cross-checked against the vendored `mms-smart-accounts-kit/references/delegations.md` skill — 4-hook signature confirmed
- [x] `app/` has `@metamask/smart-accounts-kit`, `@metamask/delegation-core`, `@metamask/delegation-deployments` added via `bun add`
- [x] `app/src/lib/chains.ts` defines `intuitionTestnet` via `viem.defineChain` with `VITE_INTUITION_TESTNET_*` env overrides and Intuition skill defaults as fallback
- [x] `.env.example` rewritten for Intuition Testnet — Foundry vars + Vite `VITE_*` vars with pre-filled defaults from `deployments/13579.json`
- [x] `deployments/13579.json` populated with chain metadata + Intuition contracts + MetaMask Delegation Framework v1.3.0 bundle + ARP placeholder keys
- [x] `forge build` passes (nothing to compile yet, but lib resolves)
- [x] `bun x tsc --noEmit -p tsconfig.app.json` passes
- [x] `bun run build` succeeds and emits a 193 KB / 60 KB gzipped bundle

## Changes from the original spec

| Original spec | Post-pivot reality | Reason |
|---|---|---|
| pnpm workspaces | Bun workspaces | Repo was already scaffolded with `bun.lock`. Switching back would churn the lockfile for no gain. ADR `0006`. |
| `forge init --no-commit --no-git` | `forge init --force --no-git` | `--no-commit` removed in forge 1.7.x; default is now no-commit. |
| Three seed module schemas stubbed | Untouched — one module (`solidity-audit`) scoped to Task 03 per pivot | `docs/00_HACKATHON_PIVOT.md` reduces seed modules to one for time discipline. |
| Base Sepolia RPC + Basescan API key | Intuition Testnet RPC + Blockscout-style verifier | `docs/00_HACKATHON_PIVOT.md`. ADR `0002`. |
| `BASE_SEPOLIA_RPC_URL`, `BASESCAN_API_KEY` env vars | `INTUITION_TESTNET_RPC_URL`, `ETHERSCAN_API_KEY`, `VITE_INTUITION_TESTNET_*` env vars | Matches the chain bascule and clean separation of Foundry vs Vite-exposed vars. |
| commitlint + husky optional | Not done | Not part of the pivot's three sub-objectives. Can be revisited later. |
| solhint configured | Not done | Same reason. Lint pass uses `forge fmt` + ESLint until solhint is wired. |

## Do not do in this task

- Do not write any Solidity contracts (Task 02).
- Do not deploy anything (Task 03).
- Do not write any UI components (Task 04).
- Do not write the Wagmi config, hooks, services (Task 04 territory).
- Do not commit `.env`.

## Verification

Toolchain commands that must pass (and did at completion):

```bash
# Root
export PATH="/home/max/.bun/bin:/home/max/.nvm/versions/node/v20.19.3/bin:$PATH"
bun install

# Contracts
cd contracts && forge build

# App
cd ../app && bun x tsc --noEmit -p tsconfig.app.json
bun run build
```

## Report

```
**What shipped**
Foundry initialized in contracts/, delegation-framework v1.3.0 vendored in
lib/, MetaMask SDK trio added to app/ (smart-accounts-kit, delegation-core,
delegation-deployments), chains.ts defines intuitionTestnet via viem, env
files + deployments/13579.json wired to Intuition Testnet.

**What I decided**
- Kept Bun (existing lockfile, spec aligned via ADR 0006 + this file).
- Added MetaMask SDK in app/ but did not wire a Wagmi config — Task 04 scope.
- Added a global `git config safe.directory` for the repo (root-vs-max
  ownership artifact). Local-global git config, no repo file changed.

**What's next or blocked**
Task 02 (ModuleRegistry contract) is the next logical step. tTRUST testnet
faucet is the only external blocker before Task 03 (deploy).
```
