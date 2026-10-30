# 0082 — Three apps: the MCP server, the agent node and the runtime hook are different programs

**Status:** Accepted. Amends `0041` (a `packages/graphql` under the protocol package).
**Date:** 2026-10-30
**Triggered by:** the user, 2026-10-30: _« ce que j'imaginais c'est un package graphql pour les
query sur la chaîne, et après un dossier apps avec toute l'app, un dossier mcp pour le mcp et un
dossier node qui contient le node à build et à installer […] dans le même principe qu'un mono
repo »_, then _« c'est une bonne idée de séparer mcp et node ? »_ — and _« oui je valide »_ on the
answer below.

## Context

Measured 2026-10-30, on `feat/agent-panel-tabs`:

- The workspaces are `app`, `contracts`, `packages/protocol`. Everything else is in `scripts/`,
  flat, and **outside every gate** (`claims.md` check 4 — `tsc -b` covers `app/src`,
  `check:scripts` is a separate opt-in).
- **"The node" names two programs.** `docs/22_RUNNING_THE_NODE.md:19-22` uses the name for
  `scripts/arp-mcp-server.ts`, the process an MCP client launches over stdio. `scripts/agent-node.ts`
  is a second program with the same name: it listens on a port the agent publishes in its ERC-8004
  registration file, checks on chain that the requester paid, and signs receipts with
  `AGENT_PRIVATE_KEY` (ADR `0045`).
- Their trust surfaces differ in kind:

  |                  | `arp-mcp-server.ts`                                     | `agent-node.ts`                                   |
  | ---------------- | ------------------------------------------------------- | ------------------------------------------------- |
  | launched by      | an MCP client, stdio, local                             | the operator, as a server                         |
  | reachable from   | the machine it runs on                                  | the public address in the registration file       |
  | key held         | `.arp/receipt-key`, generated, signs content receipts   | the agent's own key, signs hire receipts          |
  | imports          | ~20 modules of `packages/protocol/src` by relative path | `viem` only — 3 imports, `scripts/agent-node.ts:28-30` |

- 42 files in `scripts/` import `../packages/protocol/src/...` by relative path rather than
  `@arp-protocol/core` (`grep -l "packages/protocol/src" scripts/*.ts scripts/measure/*.ts | wc -l`).
- Two tests in `packages/protocol/test/` reach into `scripts/` (`rig-files.test.ts:3`,
  `arp-mcp-server.test.ts:250`) — the package's tests depend on the code that depends on the package.

## Decision

The repository becomes a monorepo of apps over packages:

```
apps/web/     the current app/
apps/mcp/     arp-mcp-server, arp-mcp-tools, arp-content, arp-fetch-skill, session-log
apps/node/    agent-node
apps/hook/    arp-session-hook (see "Decided after", point 5)
packages/graphql/    Intuition queries + typed client, no ARP logic (see "Decided after")
packages/protocol/   @arp-protocol/core, depends on graphql
contracts/    unchanged
scripts/      measure-*, seed-*, verify-*, demo-*, build-* only
```

Each app is a workspace with its own `package.json`, `tsconfig`, tests and gates, and imports the
protocol as `"@arp-protocol/core": "workspace:*"` — never by relative path into `src/`.

**"The node" means `apps/node` from now on.** The MCP server is "the MCP server". `docs/22` is
rewritten to say which program each claim is about, because a reader installing one is owed the
trust surface of that one and not the other's.

The reason for two apps and not one: somebody installing the MCP server to query the graph must not
also receive a program that opens a public port and holds the agent's key. Shared code between them
— there is little today — goes into `packages/protocol`, not into one app imported by the other.

## Alternatives considered

- **One `apps/node` holding both** — what the user's first sketch implied. Rejected: one install
  would carry two threat models, and `docs/22`'s promise ("read what you install") becomes a promise
  about a program twice the size of the one the reader wanted.
- **Keep them in `scripts/` and fix only the names** — rejected: it leaves them outside every gate,
  which is the defect `claims.md` check 4 records.

## Consequences

**Positive:**

- The MCP server and the node enter `bun --filter '*' test|lint`, which they never have.
- The protocol's tests stop importing `scripts/`; the dependency points one way.
- A reader of `docs/22` gets one program's trust surface per section.

**Negative:**

- Every living reference to the old paths moves: `README.md`, `docs/21`, `docs/22`, `CLAUDE.md`'s
  directory map, `.claude/STATE.md`, `rules/portability.md` (its `app/src/lib/deployments.ts:1`
  row), `rules/ui.md` (its `cd app` gates), `vercel.json`, `data/deployments/13579.json:145`.
- `scripts/measure/node-outbound.ts:66-68` names the files whose outbound hosts `docs/22` quotes. It
  is repointed and **re-run**, and `docs/22` quotes the new measurement file — the old one stays,
  append-only (ADR `0064`).
- Moving `app/` changes every `../../../deployments/` import depth inside it.

**Neutral (worth knowing):**

- Append-only records (ADRs, post-mortems, `data/measurements/`) keep the old paths. They were true when
  written.
- `@arp-protocol/core`'s index may not export everything the MCP server imports by deep path today.
  Whatever is missing is either exported or the import was reaching past the package's surface,
  which is worth knowing either way.

## Decided after, the same day

Four questions the split left open, put to the user and answered 2026-10-30:

1. **A separate `packages/graphql` — yes.** The Intuition queries leave `@arp-protocol/core` for a
   package that holds the queries and a typed client and no business logic; `protocol` depends on
   it. Today they sit in `packages/protocol/src/sources/intuition/queries.ts` and 8 other files
   there, and **zero** in `app/src`. This **amends ADR `0041`**, which merged two packages into one
   on 2026-10-19: that ADR removed two packages doing one job, and this one adds two packages doing
   two jobs, a read layer under a logic layer. The boundary is that `packages/graphql` knows the
   Intuition schema and nothing about ARP's own terms.
2. **Distribution: npm plus one JS bundle per app.** `@arp-protocol/core` (and `packages/graphql`
   under it) is published to npm for library users. Each app ships as one readable file from
   `bun build --target=bun`, run with `bunx`, never as a `--compile` binary, because `docs/22` asks
   the reader to read what they install. **Publishing is outward-facing and is confirmed by the user
   each time**; the task builds the pipeline and does not run it.
3. **The untracked design handoffs** (`arp-pages/`, `arp-skill-page/`, `claim-field-port/`) move
   under `docs/design/`.
4. **Timing: on its own branch**, cut from `feat/agent-panel-tabs` once everything on it is
   committed and pushed (the user, 2026-10-30: _« tout commit tout push sur une branche, et faire le
   refacto sur une autre branche »_). This replaced "after merge", the first answer the same day.
5. **The runtime hook is a third installable, `apps/hook`.** The user: _« et le hook du runtime,
   que des gens installent »_. It is wired into the runtime's own `.claude/settings.json` and fires
   on every tool call, seeing every tool input, so its install path and its trust surface are
   neither the MCP server's nor the node's. It is already small: `scripts/arp-session-hook.ts:54-57`
   imports `node:fs`, `node:path` and one function of the protocol, `refForInvocation`.
6. **Names: `mcp`, `node`, `hook`, under `apps/`.** The user had called the 1,715-line MCP server
   "the node", as `docs/22` does; asked, they kept "node" for `agent-node.ts`. `apps/` holds what
   runs, `packages/` what is imported.

## References

- Related rule: `.claude/rules/code.md`, `.claude/rules/portability.md`, `.claude/rules/claims.md`
- Related doc: `docs/22_RUNNING_THE_NODE.md`
- Related ADR: `0041` (one protocol package), `0045` (the node), `0064` (measurements are append-only),
  `0080` (the node signs for what it served)
- Task: `tasks/32-two-apps-the-mcp-and-the-node.md`
