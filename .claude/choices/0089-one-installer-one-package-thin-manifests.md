# 0089 — One installer: one npm package, a thin native manifest per runtime

**Status:** Accepted
**Date:** 2026-10-30
**Triggered by:** user request — _« je veux un seul installer, pense friction et surtout pense comme
une entreprise professionnelle »_, then _« installable en cli en npx (npm) et en plugin claude, codex
et autre »_. Plan: `docs/tasks/33-one-installer.md`. Research: `docs/23_INSTALLING_ARP.md`.

## Context

Installing ARP's agent-side programs today takes four steps: clone the repo, install Bun, build
three apps, then edit `settings.json` with an absolute path. The three programs are the hook, the MCP
server and the node, and all three run on the operator's machine, not at ARP (ADR `0045`). Each
runtime packages extensions differently:

- Claude Code has plugins that bundle MCP servers, hooks and skills.
- Codex has its own plugin format.
- Gemini CLI has extensions.
- Grok Build reads Claude Code plugins as they are.
- VS Code and Cursor only take MCP config files.

ADR `0082` keeps the three programs separate because they do not share a trust surface: the node
listens on every interface and holds the agent's key.

## Decision

**All the code ships in one npm package, `@arp-protocol/cli`, with a single `arp` binary. Each
runtime gets a thin manifest that calls it**, generated at release so that its pinned version always
matches the package.

| subcommand                                | program                    |
| ----------------------------------------- | -------------------------- |
| `arp mcp`                                 | the MCP server, over stdio |
| `arp hook`                                | the hook                   |
| `arp node`                                | the node, opt-in only      |
| `arp init`, `arp uninstall`, `arp doctor` | the installer              |

The programs share a binary, not a process. `arp mcp` never opens the node's port and never reads
its key, so ADR `0082` holds.

Five choices are part of this decision:

1. **Node ≥ 22 is what the install requires, not Bun.** `npx` means npm, and npm means Node. ~~Four~~
   **Six** Bun call sites needed porting (`docs/tasks/33` §3.1, corrected in 33b: the count missed
   two `import.meta.main`). Development keeps Bun.
2. **The hook is never run through `npx` per call.** `init` resolves the installed file once, and a
   plugin uses its root variable instead.
3. **Keys live in a 0600 file, not in an environment variable** (clig.dev, "Environment
   variables"). In a Claude Code plugin they go through `userConfig` `sensitive`, which uses the OS
   keychain.
4. **No telemetry.**
5. **No runtime is targeted without its official docs read.** Cursor gets an MCP entry and no hook,
   because its hooks page returned 404. Meta's Muse Code is not targeted, because no official
   source was found. Both are covered by `init --print`.

`arp init` follows clig.dev and the Sentry wizard: it prompts only on a TTY and has `--no-input`,
`--dry-run`, `--yes` and an `uninstall` command. It shows the path and the diff before writing
another program's file, backs that file up, and leaves the file as it is when run a second time.
Publishing to npm uses trusted publishing with provenance. Every publish and every registry
listing is confirmed by the user.

## Alternatives considered

- **A Claude Code plugin only.** It reaches one runtime and Grok. Codex, Gemini, VS Code and
  Cursor would have nothing.
- **One package per runtime, each with its own copy of the code.** Six copies drift. A fix to the
  hook would need six releases.
- **Keep Bun as the install runtime.** Every operator would need Bun, and npm would carry a package
  that `npx` cannot run.
- **Run the hook through `npx` on every call.** It would resolve or download the package on every
  tool call, and a cleaned npm cache would disable it silently.
- **The `docs/design/cli-v0` patch as it was.** It also had a SQLite database, verdicts and a network
  column, which this decision leaves out (`docs/23`). Only `install.ts`'s idempotent merge
  technique is kept.

## Consequences

**Positive:**

- One command per runtime, and one codebase behind all of them.
- Grok Build is covered by the Claude Code plugin at no extra cost. Its own docs say it reads them,
  but this has to be tested (`docs/tasks/33` 33d).

**Negative:**

- The apps' Bun-only code has to be ported.
- A release script now generates and validates manifests for five formats.
- Codex's plugin hooks are documented for its desktop app only, so its CLI's hook goes through
  `arp init` rather than through the plugin.

**Neutral (worth knowing):**

- The node is opt-in (`init --node`) and gets a unit file or a container image as a template, not an
  installed service. A server is not a hook.
- Being listed is not being used. `docs/23` §7 records what decides use: the tool descriptions, the
  hook, and what the first run shows.

## References

- Plan: `docs/tasks/33-one-installer.md`
- Research and sources: `docs/23_INSTALLING_ARP.md`
- Related ADRs: `0045` (installed, not hosted), `0082` (three programs), `0087` (a tool is its
  package), `0090` (what the hook records)
- First sub-task's post-mortem: `.claude/learning/23-one-installer-33a.md`
