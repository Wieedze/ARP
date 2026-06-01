## 01 — Project setup (post-pivot)

**Task:** `tasks/01-project-setup.md`
**Completed:** 2026-06-01
**Commit:** uncommitted
**Verifier verdict:** PASS

## What shipped

- `contracts/foundry.toml` — Foundry config: solc 0.8.24, optimizer 200, `[rpc_endpoints].intuition_testnet`, `[etherscan].intuition_testnet` (Blockscout), `fs_permissions` for `../deployments`, `[fmt]` block.
- `contracts/lib/delegation-framework/` — MetaMask Delegation Framework v1.3.0 vendored via `forge install --no-git`. `ICaveatEnforcer.sol` 4-hook signature confirmed (`beforeAllHook`, `beforeHook`, `afterHook`, `afterAllHook`).
- `contracts/lib/forge-std/` — `forge init` baseline. `src/`, `test/`, `script/` left empty (Counter remnants removed).
- `app/package.json` — added `@metamask/smart-accounts-kit@1.6.0`, `@metamask/delegation-core@2.2.1`, `@metamask/delegation-deployments@1.4.0`.
- `app/src/lib/chains.ts` — `intuitionTestnet` via `viem.defineChain`; `VITE_INTUITION_TESTNET_*` env overrides with skill defaults as fallback.
- `.env.example` — Foundry block (`INTUITION_TESTNET_RPC_URL`, `PRIVATE_KEY`, `ETHERSCAN_API_KEY`) + Vite block (`VITE_INTUITION_TESTNET_{RPC_URL,CHAIN_ID,EXPLORER,GRAPHQL}`, `VITE_WALLETCONNECT_PROJECT_ID`). All Base Sepolia / Basescan vars dropped.
- `deployments/13579.json` — chain metadata, Intuition MultiVault address, full MetaMask Delegation Framework v1.3.0 address bundle (manager + 3 implementations + 30 enforcers), ARP placeholder keys (`moduleRegistry`, `domainScopeEnforcer`, `trustStakeCapEnforcer` = null).

Toolchain green: `forge build` (Nothing to compile), `bun x tsc --noEmit -p tsconfig.app.json` (exit 0), `bun run build` (193 KB / 60 KB gzipped in ~130 ms).

## Surprises

- `forge install --no-commit` from the original spec no longer exists in forge 1.7.x; `--no-git` is the current flag (default behaviour is already no-commit).
- The vendored `delegation-framework` lib has no `package.json` — version sits in `documents/Deployments.md` only. Future version checks need to grep there.
- The repo runs under `root` shell against `max`-owned files. Required `git config --global --add safe.directory /home/max/Project/ARP` (and the `contracts/` subpath). Not a repo file change, no commit.
- `delegation-framework` ships with `pragma 0.8.23`; our `^0.8.24` consumes it without warning. Worth flagging if a future contract pragma bump conflicts.

## Decisions made

- **Bun retained over pnpm.** Existing `bun.lock`, user confirmation (*"bun cest essentiel"*). ADR: `.claude/choices/0006-task-01-spec-revision.md`.
- **Chain target switched to Intuition Testnet (chainId 13579).** ADRs: `0002-hackathon-pivot-metamask-cookoff.md`, `0006-task-01-spec-revision.md`.
- **MetaMask SDK added but not wired.** No Wagmi config, no hooks, no services — that work is Task 04 scope. Avoids silent scope expansion.
- **`forge init --force --no-git`** instead of the spec's `--no-commit --no-git`. ADR `0006` records the flag rename.

## Rules touched

- `.claude/rules/code.md` — sufficient. `chains.ts` complies (named export, no `any`, no `as` casts, no dead code).
- `.claude/rules/solidity.md` — N/A (no contracts written).
- `.claude/rules/ui.md` — N/A (no UI components produced; pre-existing Vite scaffold untouched).
- `.claude/rules/security.md` — sufficient. No secrets committed; `.env.example` documents Intuition Testnet defaults; mainnet remains out of scope.
- `.claude/rules/metamask-delegation.md` — sufficient. The vendored `ICaveatEnforcer.sol` matches the canonical 4-hook signature in the rule file. The rule file's Bear Trap warning about the stale 2-hook signature is correct and worth keeping.
- `.claude/rules/workflow.md` — sufficient. Task is not hackathon-tagged (narrative check belongs to 02b/03b/04b/05b only).

No rule needs revision.

## Suggestions for future tasks

- Task 02 (ModuleRegistry) starts with empty `contracts/src/`, `contracts/test/`, `contracts/script/`. First file written there is the registry contract.
- Task 03 (deploy) will need the `deployments/13579.json` `arp.*` placeholders populated. Idempotency rule from `security.md` applies.
- Task 04 (UI core) wires Wagmi + connectors + hooks. The MetaMask SDK packages are already installed and the chain is already defined — no install step needed there.
- Other task files (02, 03, 04, 05) hard-code Base Sepolia / pnpm in places from the pre-pivot draft. Apply the same revision pattern (and document with a fresh ADR) before executing each.
- The `delegation-framework` lib's pragma is `0.8.23` while ARP uses `^0.8.24`. Compatible today; record an ADR if a future contract change forces a pragma update.
