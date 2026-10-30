# 21 — Three apps over two packages: mcp, node, hook

**Task:** `tasks/32-two-apps-the-mcp-and-the-node.md`
**Completed:** 2026-10-30
**Commit:** `064e3df`..`10959f9` on `refactor/monorepo-apps`
**Verifier verdict:** PASS — second pass. First FAIL: hook snippet not pointing at the bin, and
"the node" still naming the MCP server in docs/21, four scripts and apps/mcp.

## What shipped

- `apps/web` (was `app/`), `apps/mcp` (server, tools, content, fetch-skill, session-log, data),
  `apps/node` (viem only), `apps/hook`. Each one is a workspace with its own `lint` (tsc). Only mcp has tests (41).
- `packages/graphql` — transport, client, 25 query documents (23 constants + 2 builders);
  `protocol` depends on it through `workspace:*`.
- `bun build --target=bun` bundles, one JS file per bin, viem external, nothing published.
- `docs/22` split per program; `data/measurements/node-outbound-2026-10-30T0220.json` (6 literals,
  9 sites, 6 outbound, 0 ours). The earlier `-2026-10-30.json` was kept: same figures, old naming.
- `docs/design/` holds the three handoffs.

## Surprises

- Two of three blockers were the **rename, not the move**. The path sweep put new paths next to an
  old name ("the node running … apps/mcp/src/server.ts"), and the measurement script then wrote
  that old name into a new append-only file. A sweep for paths does not catch a renamed concept.
- A hook snippet written as a repo-relative `bun run apps/hook/src/hook.ts` works only inside this
  repo. Fixed to an absolute path to the bundle, run once from a foreign directory.
- The task's own §4 grep filters on `^./`, but this environment's grep prints no `./` prefix, so
  the filter excludes nothing. The hits were read by hand: all of them are in tasks/, data/measurements/,
  choices/ and learning/.

## Decisions made

- **Scripts import apps by relative path, not by package name** (deviation from deliverable 6):
  scripts/ is not a workspace, and `@arp/mcp` has no `exports`. Only `verify-content-route.ts`
  imports an app. Recorded in `223b40f` and in tasks/32 §5.
- **`apps/mcp/src/data.ts`**: deployments and catalogue are imported as a map keyed by chain id, so
  the bundle carries them. Consequence: they are frozen at build time. Edit `data/deployments/*.json`,
  rebuild. Not an ADR. Recorded in `18d478b` and in tasks/32 §5.
- ADR: `.claude/choices/0082-two-apps-the-mcp-and-the-node.md`.

## Rules touched

- `claims.md` check 5 — sufficient, but the check was not applied to a concept rename. Grepping
  the old *name* as well as the old *path* would have caught it.
- `code.md` testing line — `apps/node` and `apps/hook` have no test suite. They are pre-existing
  code that was moved, not new code. Worth a task.

## Suggestions for future tasks

- When an ADR renames a concept, grep the old name across living files in the same commit as the
  path sweep, and read every hit.
- A snippet a stranger pastes into their own config gets run from a directory outside the repo
  before it is written down.
- Open defects carried forward: the node accepts one payment twice (STATE), and verify-domain-tree
  crashes on a 429 (STATE). Root `lint` still fails on missing `solhint` (pre-existing).
- Vercel: if Root Directory is `app`, change it in the dashboard. The repo cannot show this setting.
