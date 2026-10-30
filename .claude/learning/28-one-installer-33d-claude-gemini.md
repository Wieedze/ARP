# 28 — One installer, 33d first part: Claude Code plugin and Gemini extension

**Task:** `docs/tasks/33-one-installer.md` §33d (first part; Codex deferred)
**Completed:** 2026-10-30
**Commit:** uncommitted
**Verifier verdict:** PASS (third pass)

## What shipped

- `apps/cli/scripts/packages.ts` — `bun run packages` writes `packaging/` and `.claude-plugin/marketplace.json` from `apps/cli/package.json` and `dist/hook.js`; `--check` fails on stale or ungenerated files; `--local <dir>` (outside the repo only) writes a copy whose MCP runs this checkout's `dist/cli.js`.
- `packaging/claude/arp/` — plugin.json, .mcp.json (`npx -y @arp-protocol/cli@<version> mcp`), hooks/hooks.json (from `CLAUDE_HOOKS`), bin/hook.js, skills/arp/SKILL.md.
- `packaging/gemini/arp/` — gemini-extension.json + `ARP.md` (the skill). No hook: the hook cannot read Gemini yet (33i).
- `.claude-plugin/marketplace.json` at the repo root.
- `apps/cli/tsconfig.json` include now covers `scripts/`; `apps/cli/test/cli.test.ts` runs `--check`.

## Surprises

- `claude plugin validate` does not look at hooks.json; only installing it does. The install test (temp HOME, `marketplace add` + `install arp@arp`, running the hook command with `CLAUDE_PLUGIN_ROOT` set) is the real gate.
- A directory marketplace is used in place: the plugin root is the source directory, not a copy under `~/.claude/plugins`.
- A plugin's MCP server shows up as `mcp__plugin_arp_arp__…`, so its log line has `ref: null`.
- `apps/mcp/src/server.ts` hardcodes `serverInfo.version` `0.2.0` against package `0.0.1`. This predates 33d, but it conflicts with ADR `0089`'s one version everywhere. Recorded as open before 33f.

## Decisions made

- **Generated output is committed and guarded by `--check`**, rather than generated only at release. It is reviewable, and the test catches drift.
- **The hook entry is derived from `CLAUDE_HOOKS`**, so the plugin and `arp init` share one spec.
- **No `userConfig` `sensitive` yet**: the plugin does not run the node, and the key is the node's. It lands with 33e, as recorded in the task.
- **Codex deferred**: the schema was read only through a summary, and `.agents/` is gitignored.

## Rules touched

- `.claude/rules/claims.md`: sufficient. Check 5 caught the stale "33d–33h not started" header; check 2 caught "both manifests say MIT" when only one manifest carries a license field.
- `.claude/rules/code.md`: sufficient.

## Suggestions for future tasks

- When a plan bullet is deferred, write the deferral where the plan bullet is. A silent omission fails verification.
- Before writing "N files say X", grep for X; a count from memory was wrong here.
- Open before 33f: no LICENSE file (user's call), serverInfo version, Gemini gallery wants the manifest at the repo root (33h).
