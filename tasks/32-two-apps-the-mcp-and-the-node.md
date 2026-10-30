# Task 32 — Three apps over two packages: mcp, node, hook

**Status:** **COMPLETE** 2026-10-30. `task-verifier` PASS on the second pass (the first failed on
naming and on a hook command that worked only inside this repo). Commits `064e3df`..`10959f9` on
`refactor/monorepo-apps`. ADR `0082`. Post-mortem: `.claude/learning/21-two-apps-the-mcp-and-the-node.md`.
**Required skills:** none beyond the repo's own.
**Rules:** `code.md`, `ui.md` (the gates move), `portability.md`, `claims.md`, `workflow.md`.
**Reviewers:** `ui-reviewer` (the web app moved, nothing in it should change), then `task-verifier`.
**ADR:** `0082`.

---

## 1. Why

The user, 2026-10-30, wants the repo laid out as a monorepo: apps over packages, each with its own
dependencies and an internal organisation that follows its job. ADR `0082` records the split and the
reason the MCP server and the node are two apps rather than one.

## 2. Deliverables

1. **`app/` → `apps/web/`.** Root `workspaces`, root `vercel.json` (`buildCommand`,
   `outputDirectory`), every `../../../deployments/` import inside it. Nothing in the app itself
   changes — `ui-reviewer` confirms the four gates are green and the diff is paths only.
2. **`apps/mcp/`**, its own `package.json` with `bin` entries, `tsconfig`, `test/`:
   `arp-mcp-server.ts`, `arp-mcp-tools.ts`, `arp-content.ts`, `arp-fetch-skill.ts`,
   `session-log.ts`, laid out by role (`src/server`, `src/tools`, `src/content`, `bin/` — settle
   at task time from what each file does).
3. **`apps/node/`**, same shape: `agent-node.ts`. **`apps/hook/`**, same shape:
   `arp-session-hook.ts`, and the `.claude/settings.json` snippet in its header points at the new
   `bin`.
4. **Imports go through the package.** Every `../packages/protocol/src/...` in the moved files
   becomes `@arp-protocol/core`. Whatever the index does not export is listed in the completion
   report, each one either exported or rewritten.
5. **The protocol's tests stop importing `scripts/`.** `packages/protocol/test/rig-files.test.ts`
   and `arp-mcp-server.test.ts` move to `apps/mcp/test/`.
6. **Scripts that stay import the apps by package name**, not relative path:
   `verify-content-route.ts`, `demo-hire.ts`, `demo-loop.ts`, `rig-registration-files.ts`,
   `measure/node-outbound.ts`, `measure/mcp-staked-flag.ts`.
7. **Gates.** `bun run test` and `bun run lint` at the root cover both apps. State in the report
   which gate covers which directory (`claims.md` check 4).
8. **`docs/22` is rewritten per program.** "The node" means `apps/node`; the MCP server is named as
   such. Every file path and line reference in it is re-checked against the new tree.
9. **`node-outbound.ts` is repointed and re-run.** `docs/22` quotes the new measurement file. The
   old one is not touched (ADR `0064`).
10. **Living references updated**: `README.md`, `docs/21`, `CLAUDE.md` directory map,
    `.claude/STATE.md`, `rules/portability.md`, `rules/ui.md`, `deployments/13579.json:145`. Grep
    each old path and read every hit (`claims.md` check 5); ADRs, post-mortems and `measurements/`
    are append-only and keep the old paths.
11. **`packages/graphql/`.** The queries and the Intuition client move out of
    `packages/protocol/src/sources/intuition/` and the 8 other files of `protocol` that hold a query.
    It knows the Intuition schema and nothing about ARP's terms. `protocol` depends on it through
    `workspace:*`; the apps import from `protocol`, and from `graphql` only for a raw read.
    `portability.md`'s invariant holds for both packages: no chain constant outside `src/arp/`.
12. **Build, not publish.** Each app gets a `build` script producing one JS file
    (`bun build --target=bun`) and a `bin` entry. Each package gets `build` + `files`. **Nothing
    is published in this task**: publishing to npm is confirmed by the user each time.
13. **`arp-pages/`, `arp-skill-page/`, `claim-field-port/` → `docs/design/`**, tracked.

## 3. Do not do in this task

- **No `npm publish`, no release tag.** Deliverable 12 builds; the user publishes.
- **No `--compile` binary.** ADR `0082`, decided point 2.
- **No behaviour change** in any moved file. A move and a fix in the same commit cannot be reviewed.
  Commit the moves first, the import rewrites second, the graphql extraction third.

## 4. Check before closing

```
bun install && bun run test && bun run lint && bun run check
cd apps/web && bunx tsc -b && bun run check:tokens
grep -rn "scripts/arp-mcp\|scripts/agent-node\|scripts/arp-content\|scripts/arp-session-hook\|cd app " \
  --include=*.md --include=*.ts --include=*.json . | grep -v node_modules \
  | grep -v "^\(\./\)\?\(\.claude/choices\|\.claude/learning\|measurements\|tasks\)/"
```

The last command returns nothing, or each hit is explained in the report.

## 5. What landed, and the three things a reader should know

Commits `064e3df`..HEAD on `refactor/monorepo-apps`. Every deliverable above landed except as
noted here.

- **Deliverable 6 deviates.** Scripts that stay in `scripts/` import an app by **relative path**,
  not by package name: `scripts/` is not a workspace and `@arp/mcp` declares no `exports`, so a
  package-name import would resolve only by hoisting and would be a deep import anyway. Only one
  script imports an app at all (`verify-content-route.ts:35`); the other five name app paths in
  comments or strings.
- **The MCP bundle freezes its data at build time.** `apps/mcp/src/data.ts` imports every chain's
  `deployments/<chain>.json` and `catalogue/skills-<chain>.json`, so a rebuilt file is needed after
  either changes. From source nothing changed in practice — the import reads the repo's files.
- **Vercel.** The root `vercel.json` now builds `apps/web`. If the Vercel project's Root Directory
  setting is `app`, it points at a directory that no longer exists and has to be changed in the
  dashboard; the repo cannot show which it is.
