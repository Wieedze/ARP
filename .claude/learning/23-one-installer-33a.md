# 23 — Task 33a: the hook sees what each runtime sends

**Task:** `docs/tasks/33-one-installer.md` (sub-task 33a only; 33b–33h not started)
**Completed:** 2026-10-30
**Commit:** `0581b9e`
**Verifier verdict:** PASS (second pass; the first failed on the three items under Surprises)

## What shipped

- `apps/hook/src/payload.ts` — reads a payload by its shape: `claude` (snake_case) or `grok` (camelCase). Codex and Gemini are not adapted until a real payload is captured.
- `apps/hook/src/classify.ts` — outcome `ok`/`tool_error`/`auth`/`timeout`/`unreachable`/`payment` plus a status code. A cancelled or interrupted call is not recorded. The error text is read, never returned.
- `apps/hook/src/mcp-config.ts` — server name → remote URL or npm/PyPI page, from `~/.claude.json` and `.mcp.json`; `credentialFree` drops query, fragment and userinfo, and falls back to the origin when a path segment looks like a credential.
- `apps/hook/src/hook.ts` — wired on `PostToolUse` + `PostToolUseFailure`, `async`. Each line gains `call`, `format`, `outcome`, `code` and `ms`. The MCP ref is the configured server URL, not `tool_input.url`. Writes `.arp/.gitignore` (`*`) when it creates its own `.arp/`.
- `packages/protocol/src/session.ts` — `parseSessionLog` keeps one line per (session, call id).
- Tests: `apps/hook/test/units.test.ts`, +6 end-to-end in `apps/hook/test/hook.test.ts`, +2 in `packages/protocol/test/session.test.ts`.
- Docs: `docs/22` hook section, `docs/23` §3 and §6.4 settled, task 33 line on "format, not runtime".

## Surprises

- **The configured MCP URL is the operator's, and it can carry a key.** It was reproduced on the first pass: `?apiKey=SENTINEL` reached `.arp/session.jsonl` verbatim, because `normaliseToolUrl` keeps the query. The `docs/design/cli-v0` original has the same gap. Moving the ref from an argument to configuration fixed one leak and opened another.
- The log lives in the _operator's_ project, whose `.gitignore` does not know `.arp/`. ARP's own `.gitignore:59` gave false comfort.
- Doc line references to `hook.ts:12` and `hook.ts:52` went stale as soon as the header grew. The docs now cite sections instead.

## Decisions made

- **Record format, not runtime** — Codex also writes snake_case, so a payload's shape cannot name who sent it.
- **Path tokens: heuristic, origin fallback** — a segment of 24+ `[A-Za-z0-9_-]` characters mixing letters and digits drops the whole path. Accepted cost: two servers on one host that differ only by such a path share a ref. Residual, verified by a run: a shorter token (`sk_live_9f8e7d6c5b4a`, 19 characters) passes through. Latent today, because `resolveInvocations` (`packages/protocol/src/session.ts`) never reads an MCP ref. It becomes live when an MCP ref is turned into an atom.
- **Log stays per working directory** (`docs/23` §6.4), settled here.

Recorded afterwards as ADR `0090` (what the hook records) and ADR `0089` (the installer this sub-task opens).

## Rules touched

- `.claude/rules/security.md` — sufficient, but the log's privacy has to cover the operator's _configuration_, not only arguments and responses.
- `.claude/rules/claims.md` — check 5 caught the stale line references; citing a section rather than a line avoids the next round.
- `.claude/rules/code.md` — sufficient.

## Suggestions for future tasks

- Before any task turns an MCP ref into an atom, revisit the path-token heuristic: an atom is permanent, a log line is not.
- Capture real Claude Code and Grok payloads as fixtures (33a used documented examples only; Grok's `toolResult` name came through a summary).
- Sentinel tests should cover every input the hook reads (configuration included), not just the payload.
