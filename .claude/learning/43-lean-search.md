# 43 — Lean search: more tools found, fewer tokens spent

**Task:** `docs/tasks/49-lean-search.md`
**Completed:** 2026-11-02
**Commit:** `b850a45` (Desktop host fix), `f4ac9d4` (search); this file uncommitted
**Verifier verdict:** PASS on round 2 (round 1 FAIL: one live defect, three claim errors, one uncommented cast, vacuous tests)

## What shipped

- `apps/mcp/src/content.ts`, `apps/cli/src/cli.ts`, `apps/mcp/src/server.ts`, `packages/protocol/src/node/serve.ts`: `arp mcp` starts under Claude Desktop's built-in Node. A receipt key it cannot write is fail-soft. stdin is taken at load through `bufferedCopy`. No top-level await on the server. `apps/cli/test/desktop-host.test.ts` reproduces all three.
- `apps/mcp/src/tool-search.ts`: pure `describe`, `relevance`, `shortPurpose`, `collapseCopies` and `pageOf`, unit-tested in `apps/mcp/test/tool-search.test.ts`.
- `apps/mcp/src/handlers/find-tools.ts`, `apps/mcp/src/tools.ts`: `arp_find_tools` gains `query`, `offset`/`total`/`next_offset`, a short row by default and `detail: "full"`.
- `data/catalogue/skill-facts.json`: moved from `apps/web/src/data/` so the MCP server and the web app read one file.

## Surprises

- **Collapsing copies hid a declaration.** "Keep the most installed copy" picked a registered copy with 0 declarations over the one an agent had declared (`product-photography`). Measured by the verifier on testnet 13579, 2026-11-02: 1 group of 31 multi-copy groups across 745 rows. Fixed: the copy with the most declarations wins, installs break ties, and declarations are never summed across atoms. Confirmed live after the fix: `declarations: 1, copies: 6`.
- **"About three times" was 2.3 to 2.6 times.** The before side had duplicates too: 19 distinct in the first 25 rows, 68 in the first 100. Only a recount of the before side gave the true ratio.
- The server-test stub returns no tool rows, so row-shape and paging assertions there passed on an empty list. They moved to unit tests on literals.

## Decisions made

- **Short row by default, full one parameter away; text ranking never returned.** ADR: `.claude/choices/0108-find-tools-answers-a-short-row.md`.

## Rules touched

- `.claude/rules/claims.md`: sufficient. Check 1 (reachability) found the collapse defect, and a ratio must be re-derived from both sides, not just the after side.
- `.claude/rules/code.md`: sufficient. The uncommented `as` cast on a JSON import was caught.

## Suggestions for future tasks

- When a step merges or dedups rows, measure what the merge drops (which row survives, and which figure goes with it) against live data before choosing the tie-break.
- A test over a stub must assert that the stub returns rows before it asserts their shape. Otherwise put the logic in a pure module.
- The one-off stdio measurements were run twice by hand. If find_tools is measured again, commit the probe under `scripts/measure/`.

## Evidence ladder

Tier 3 (staked), on the reading side. A declaration is a claim someone paid a fee for, and making the read cheap is what leads agents to consult ARP and then declare. It does not move ARP up the ladder, and the default row hides the backing behind each declaration, which stays one parameter away with `detail: "full"`.
