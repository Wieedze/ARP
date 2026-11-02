# 44 — The installer meets real runtimes (part A, Claude Code)

**Task:** `docs/tasks/38-the-installer-meets-real-runtimes.md`
**Completed:** 2026-11-02 (part A for Claude Code only; B, C, D, E open)
**Commit:** `uncommitted` post-mortem; branch `feat/38-claude-code-demo` at `ddaa522`, on top of `feat/49-lean-search` (PR #32)
**Verifier verdict:** PASS (second pass; first pass FAIL on the task file and two code nits)

## What shipped

- `apps/hook/test/fixtures/claude/*.json` — two real Claude Code 2.1.316 captures, redacted, fed end to end in `apps/hook/test/hook.test.ts`
- `apps/cli/src/install/targets.ts` — `SERVER_ENV` (ARP_TARGET=testnet) on every `arp init` MCP entry; `arp doctor` fails claude < 2.1.316
- `apps/cli/src/install/edits.ts` — Codex TOML entry carries `env`
- `apps/cli/scripts/packages.ts` — `--tarball <https url> <dir>`; plugin entries carry ARP_TARGET=testnet + ARP_TOOLS=read
- `apps/mcp/src/content.ts` — server writes `.arp/.gitignore` (`*`) before the key and for an existing key, fail-soft
- `apps/mcp/test/receipt-key.test.ts` — generated key, older key, read-only `.arp/` (skipped as root)

## Surprises

- Claude Code 2.0.25 loaded zero hooks with no error while `/mcp` worked. Silent; now a doctor check.
- An MCP `tool_response` is the bare content array, and the runtime adds `mcp_server`. Documented examples did not show either.
- The MCP entry defaulted to mainnet and read `edges_read: 0` next to a testnet web app.
- `.arp/receipt-key` was gitignored only by this repo's own root `.gitignore`. Latent on the demo machine (not a git repo), fixed before any tester round.

## Decisions made

- **Testnet for everything, declarations included** — the user's decision 2026-11-02; the server's own default stays mainnet. No ADR (recorded in the task file).
- **Plugin is read-only** — ARP_TOOLS=read per task 45; the demo declares through `arp init`'s entry.
- **Doctor floor = oldest version seen working (2.1.316)** — versions between 2.0.25 and 2.1.316 were never tried; fail rather than guess.

## Rules touched

- `.claude/rules/claims.md` — sufficient; first pass caught check-5 failures (task file still said "must be fixed" and "doctor should say so" after both were fixed; §2 kept 2.0.25 after the floor became 2.1.316) and a commit body overstating "every generated MCP entry".
- `.claude/rules/code.md` — sufficient; a rebase orphaned `receiptSigner`'s docblock, and a fail-soft fix shipped without a test.
- `.claude/rules/security.md` — sufficient for the `.gitignore` and key handling.

## Suggestions for future tasks

- After resolving a rebase conflict in a file with docblocks, re-read the docblock order. Merges stack them.
- When a task file records "found X, must fix" and the same branch fixes it, strike it in the same commit as the fix.
- Name a real tier (asserted, rated, staked, proven) in a task's evidence-ladder section. "Recorded" is not one.
- The committed plugin runs `@arp-protocol/cli@0.0.1`, which is not on npm (404, 2026-11-02). Any demo through the plugin needs a publish or a hosted `--tarball` archive first.
