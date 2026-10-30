# 26 — One installer, 33c: `arp init`, `arp uninstall`, `arp doctor`

**Task:** `docs/tasks/33-one-installer.md` §4 33c
**Completed:** 2026-10-30
**Commit:** uncommitted
**Verifier verdict:** PASS, on the second pass

## What shipped

- `apps/cli/src/install/env.ts` — `InstallEnv`: every piece of IO injected, so tests run against a temp home with no runtime binary on PATH and no terminal.
- `apps/cli/src/install/edits.ts` — pure edits that change only our part of each file: `mcpServers.arp`, the hook on `PostToolUse` and `PostToolUseFailure` (the marker is the hook file path), and the Codex TOML block between marker comments. A file that is not a JSON object is refused, and so is a foreign `[mcp_servers.arp]`.
- `apps/cli/src/install/targets.ts` — the five runtimes: claude, grok, cursor, gemini, codex. On the Claude path, `claude mcp get` is read when the plan is made.
- `apps/cli/src/install/commands.ts` — the run order is detect → plan → diff → consent (TTY, or `--yes`; otherwise exit 3) → backup → temp file written with the original's mode → rename. Also `doctor`, and exit codes 0/1/2/3/4/5.
- `apps/cli/test/install.test.ts` — 19 tests. `apps/cli/scripts/check-node.sh` now also runs init, doctor and uninstall under Node 22 against a clean home.

## Surprises

- First pass failed on five items.
- Temp file + rename turned a 0600 config holding an API key into 0644. The umask masks `writeFileSync`'s `mode`, so the fix needs a `chmod` as well.
- `changes()` counted every command step as a change. A second run with `claude` on PATH therefore re-ran `add-json`, which refuses an existing name. The fake `run` always returned 0, which hid it. The fix is a strict fake that reproduces the CLI's refusals.
- The plan's per-runtime table (VS Code, `codex mcp add`, the `grok mcp add` fallback) diverged from the build, and only one divergence was written down.
- Post-mortem number 25 had been taken by task 36 in the same day. The task file's status line named the wrong number.

## Decisions made

- **Hook for Claude Code (and Grok through it) only.** Codex, Gemini and Cursor have no payload adapter (33a), and a hook that records nothing would look as if it were installed.
- **The Claude MCP entry goes through `claude mcp add-json --scope user`** when the binary is on PATH. This avoids racing a running Claude Code on `~/.claude.json`.
- **The hook is copied to `~/.arp/bin/hook.js`. Under npx, the MCP entry is pinned `npx -y @arp-protocol/cli@<version> mcp`.** Both choices exist to survive a cache clean.
- **Consent shows the part of each file we touch, not a whole-file diff.** The task file records this.
- **VS Code is not a target.** Its config path is per-OS and it has no remove command, so `--print` covers it.

## Rules touched

- `code.md` — sufficient. The rule against uncommented casts caught five sites. One remains, `name as RuntimeId` inside `includes` at `commands.ts:72`, a widening needed for `includes` rather than a narrowing claim. Not blocking.
- `security.md` — sufficient, but "backup before write" did not cover "keep the file's mode". Add that to the checklist if another installer writes into someone else's config.
- `claims.md` — check 4 applied: the green test said the call was made, not that a real `claude` accepts it.

## Suggestions for future tasks

- Any fake standing in for a third-party CLI must reproduce its refusals (duplicate add, remove of an absent entry). A fake that always returns 0 tests nothing about idempotence.
- Atomic write into a file you do not own: stat, write with the mode, chmod, rename. Test with a 0600 file.
- Before naming a post-mortem, `ls .claude/learning`. Parallel sessions take numbers.
- Untested against a real `claude` binary. Two things need a run on a machine that has one: the "same entry" check (a substring match on `claude mcp get` output) and add-json's error text.
- Residuals:
  - `arp init | head` dies with an unhandled EPIPE.
  - `--project` writes an absolute `~/.arp/bin/hook.js` path into a file that may be committed.
