# 25 — The activity bar: what the agent triggered, and what it declared

**Task:** `docs/tasks/36-the-activity-bar.md`
**Completed:** 2026-10-30
**Commit:** uncommitted
**Verifier verdict:** PASS (second run; the first failed on 3 findings plus a missing STATE.md row)

## What shipped

- `packages/protocol/src/activity.ts`: the event type, line parser, MultiVault calldata decoder and wire re-validator, all pure (12 tests).
- `scripts/agent/agent-send-plan.ts --log`: one JSON line per call, dry or sent, with its calldata.
- `apps/mcp/src/activity-feed.ts`, `session-log.ts --serve`: tails `.arp/*.jsonl`, serves SSE and JSON on 127.0.0.1, with a CORS allowlist and a Host check (5 tests).
- `apps/web/src/services/agent-feed.ts`, `agent-feed-live.ts`: a third `agent` stream; each sent hash is confirmed from a receipt the browser reads itself.
- `apps/web/src/components/brand/ActivityLog.tsx` (now mounted in `Layout`) and `pages/ActivityPage.tsx` at `/activity`: joins invocation → declaration → stake on ids.
- `scripts/sandbox/setup.ts`: `bin/arp-sign` writes `--log`, new `bin/arp-activity`, the hook runs async on both PostToolUse events.

## Surprises

- CORS on a 127.0.0.1 server does not stop DNS rebinding: a rebound page is same-origin and needs no CORS header. The first verifier run reproduced the read with a foreign `Host` (200). A Host allowlist closes it (403 now). The ADR had stated "CORS is the boundary" as absolute.
- The wire re-validator accepted any non-empty `value`, and `BigInt()` in render would have taken down `Layout` on every page. It was latent, since the signer writes `String(bigint)`, and is now limited to `/^\d+$/`.
- A new listener and three env vars made `docs/22`'s "every env var" promise false until it was updated.

## Decisions made

- **A local read-only feed rather than chain-only or browser-only.** ADR: `.claude/choices/0091-the-agent-s-activity-reaches-the-browser-through-a-local-feed.md`.
- **`node:http`, not `serveFetch`.** The move is left to whoever adds `arp activity` (arp-41).

## Rules touched

- `.claude/rules/claims.md`: sufficient. Checks 1 and 6 caught the CORS sentence. A security claim got a reproduction command and a test, not a better sentence.
- `.claude/rules/security.md`: sufficient, but it has no line on local HTTP listeners. Consider adding "a localhost listener checks `Host`, not only `Origin`" if a second one appears.

## Suggestions for future tasks

- Any server that binds 127.0.0.1 for a browser: add a Host allowlist plus a foreign-Host test from the start.
- A new process, listener or env var under `apps/`: update `docs/22` in the same change.
- A re-validator for data off a socket: validate every field that reaches a throwing parser (`BigInt`, `new URL`), not only its type.
