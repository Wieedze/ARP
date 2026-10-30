# 24 — Task 33b: `@arp-protocol/cli`, built for Node

**Task:** `docs/tasks/33-one-installer.md` (sub-task 33b only; 33c–33h not started)
**Completed:** 2026-10-30
**Commit:** uncommitted at verification (working tree on `refactor/monorepo-apps`)
**Verifier verdict:** PASS (second pass; the first failed on five stale sentences, none in the code)

## What shipped

- `packages/protocol/src/node/serve.ts` — `serveFetch` (fetch handler over `node:http`, 413 over a body limit, 500 on a throw) and `linesOf` (stdio). Subpath `@arp-protocol/core/node`, so the web bundle never sees `node:http`. 4 tests, green under Bun and under Node 22 (vitest).
- `apps/mcp/src/server.ts`, `apps/node/src/node.ts` — `Bun.*` and `import.meta.main` replaced by an exported `main()`. MCP stays loopback by default and now caps a body at 1 MiB. The node still binds every interface; `ss` shows `*:port` for both `Bun.serve` and `node:http` with no host, so this is unchanged.
- `apps/cli` — `@arp-protocol/cli`, bin `arp` (`mcp`, `hook`, `node`, `--help`, `--version`, exit 2 on unknown). `dist/cli.js` plus code-split chunks for mcp and node. `dist/hook.js` is built on its own and loaded by a URL resolved at run time. 6 tests.
- `apps/cli/scripts/check-node.sh` (`bun run check:node`) — packs, installs and runs the tarball with Node 22 under `env -i` with no Bun reachable. 11 checks, including the node over a real socket and `npx --package <tarball>`.
- `packages/protocol/package.json` — `"./node"` export, `"sideEffects": false`.

## Surprises

- **The §3.1 count was four; the real number was six.** `grep "Bun\."` cannot see `import.meta.main`, which Node 22 leaves unset. Check what a runtime does not set, not only what it names.
- **First pass FAILed on five sentences, zero code defects:**
  - §3.1 still said "four", and that is the paragraph ADR 0089 and `docs/23` cite. The correction had landed two sections away (`claims.md` check 5 again).
  - The task status line was stale.
  - `docs/22` cited `node.ts:110`/`:118`/`:141`, which shifted when two import lines were added (check 6: a stranger-facing grep).
  - A `Bun.serve` comment in `task.ts` was stale.
- **A shared code-split chunk made the hook slow.** As a chunk, `arp hook` statically pulled the 120 KB protocol chunk plus viem: 0.35–0.37 s per tool call under Node 22. Built standalone and tree-shaken (needed `sideEffects: false`), it is 12.8 KB, has no viem and takes 0.03–0.04 s (re-measured by the verifier, n=2).
- **Under Bun's `node:http`, breaking out of a body loop early turns a 413 into a bare 200.** Drain, then refuse.
- **`--external @metamask/smart-accounts-kit` is not dead.** Removing it bundles the kit (1.1 MB) through a dynamic import in `delegated.ts`. A cli test now guards it.
- **Docker had no daemon.** The "clean container" gate became a clean `PATH` with an explicit no-bun check.

## Decisions made

- **The shared server adapter lives in `packages/protocol`** behind a subpath export, per ADR `0082`. It is not in one app imported by another.
- **The hook is built from `../hook/src/hook.ts` by path**, not through an `exports` entry. This deviates slightly from "through their exports". The reason is the hook's per-call latency. Not ADR-worthy; recorded here.
- **The MCP HTTP mode gets a 1 MiB body cap**, replacing Bun's implicit 128 MiB.

ADR `0089` was amended (count struck, four to six). No new ADR.

## Rules touched

- `claims.md` — sufficient. Checks 5 and 6 caught all five first-pass failures. The lesson is the same as 33a's: line-number citations in docs go stale as soon as a file's header grows.
- `security.md`, `portability.md`, `code.md` — sufficient.

## Suggestions for future tasks

- When porting off a runtime, grep for what it **sets** (`import.meta.main`, `import.meta.dir`) as well as what it **names** (`Bun.`).
- After adding lines above a cited location, re-run every grep a doc quotes against that file.
- A command that runs on every tool call gets its own build entry and a measured cold-start time in its gate.
- Commit hygiene: the working tree mixes another session's activity-feed work (`packages/protocol/src/index.ts` activity exports, `apps/mcp/src/activity-feed.ts`, `apps/web` ActivityLog files). Stage 33b by hunk.
