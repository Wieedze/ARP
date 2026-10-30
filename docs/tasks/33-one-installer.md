# Task 33 — One installer: npx, and a native package per runtime

**Status:** **PLAN**, 2026-10-30. **33a COMPLETE** 2026-10-30, `task-verifier` PASS on the second pass, post-mortem `.claude/learning/23-one-installer-33a.md`. 33b–33h not started. It splits into the sub-tasks in §4. Each one is
verified on its own, and the parts that publish are confirmed by the user every time (task 32 §2.12).
**Required skills:** none beyond the repo's own.
**Rules:** `code.md`, `security.md` (a key moves to a file), `portability.md`, `claims.md`, `workflow.md`.
**Reviewers:** `task-verifier` per sub-task.
**ADRs:** `0089` (one installer, the decisions in §3), `0090` (what the hook records, 33a).
**Research:** `docs/23_INSTALLING_ARP.md`. Every third-party fact below comes from there or from the
sources listed in §6.

---

## 1. Why

The user, 2026-10-30: _« je veux un seul installer, pense friction … comme une entreprise
professionnelle »_. Then: _« installable en cli en npx (npm) et en plugin claude, codex et
autre »_.

Today an operator clones the repo, installs Bun, builds three apps and writes the hook into
`settings.json` with an absolute path (the settings snippet in `apps/hook/src/hook.ts`'s header). That is four steps where
there should be one.

## 2. The shape

**One npm package, `@arp-protocol/cli`, holds all the code. The native packages are thin manifests
that call it.**

```
npx @arp-protocol/cli init                any runtime: detects them, writes the MCP entry and the hook
claude plugin install arp@arp             Claude Code
codex plugin marketplace add <repo>       Codex
gemini extensions install <repo url>      Gemini CLI
code --add-mcp '{…}'                      VS Code (Copilot); `arp init` writes the hook
Cursor                                    `arp init` writes ~/.cursor/mcp.json
grok plugin install arp --trust           Grok Build: reads the Claude Code plugin as it is
npx @arp-protocol/cli init --print        any other MCP client: prints the entry to paste
```

The `arp` binary has these subcommands:

| subcommand                                  | what it is                                   | today       |
| ------------------------------------------- | -------------------------------------------- | ----------- |
| `arp mcp`                                   | the MCP server over stdio                    | `apps/mcp`  |
| `arp hook`                                  | reads one payload on stdin, appends one line | `apps/hook` |
| `arp node`                                  | the hire endpoint, opt-in                    | `apps/node` |
| `arp init` / `arp uninstall` / `arp doctor` | install, remove, diagnose                    | new         |

The three apps stay three programs with three trust surfaces, as ADR `0082` requires. They share a
binary, not a process: `arp mcp` never opens the node's port and never reads its key.

**One version everywhere.** Every manifest pins `@arp-protocol/cli@<exact version>`. A script
generates those manifests from `package.json` at release time, so a manifest and the package can
never disagree.

## 3. Decisions this plan takes, which the user can overturn

1. **Node ≥ 22 is the runtime the install requires, not Bun.** `npx` means npm, and npm means Node.
   Bun-specific code on the agent side, measured with
   `grep -rn "Bun\." apps/mcp/src apps/node/src apps/hook/src packages/*/src`, amounts to four call
   sites: stdio at `apps/mcp/src/server.ts:244` and `:246`, and `Bun.serve` at `:284` and at
   `apps/node/src/node.ts:141`. The other hits are comments. Development keeps Bun; only the build
   targets Node.
2. **The hook does not run through `npx` on each call.** That would download or resolve the package
   on every tool call. `init` resolves the installed file once and writes its absolute path. Plugins
   use their root variable instead (`${CLAUDE_PLUGIN_ROOT}`, `${extensionPath}`). The hook is
   registered `async` wherever the runtime allows it.
3. **Keys live in a 0600 file, not in an environment variable.** This follows clig.dev ("Do not read
   secrets from environment variables") and matches `.arp/receipt-key` (`docs/22_RUNNING_THE_NODE.md:65`).
   On Claude Code the plugin's `userConfig` with `"sensitive": true` uses the OS keychain instead.
4. **No telemetry.** Nothing new phones home. `arp doctor` makes its checks locally and says what
   it reads.
5. **Cursor gets an MCP entry only for now.** Its hook documentation could not be read
   (`cursor.com/docs/hooks.md` returned 404 on 2026-10-30). No hook is written for a format we
   cannot cite.
6. **Grok Build gets no package of its own.** Its docs say "Grok automatically reads Claude Code
   marketplaces, plugins, skills, MCPs, agents, hooks, and instruction files", and that a plugin
   "accepts … the `.claude-plugin/` equivalents" (sources in §6). So the Claude Code plugin is its
   package too. This is checked by installing it under `grok`, not assumed.
7. **Meta's Muse Code is not targeted.** Only secondary blogs describe it. Neither ai.meta.com nor
   ai.meta.com/muse mentions a coding agent, and its developer docs (`dev.meta.ai`) were not read.
   Until they are, it is served by `--print`, like any other MCP client.

## 4. Sub-tasks, in order

### 33a — The hook sees what each runtime sends

The hook, before any packaging work, because every package ships it.

- Register on `PostToolUseFailure` as well as `PostToolUse`. A failed MCP call currently never
  reaches the hook (`docs/23` §3).
- Read `duration_ms` and `error` where the payload has them.
- **One adapter per runtime, normalising to one `Invocation`.** The runtimes differ:

  | runtime           | event after a call                   | MCP tool name                                                           | failure                                                 |
  | ----------------- | ------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------- |
  | Claude Code       | `PostToolUse` + `PostToolUseFailure` | `mcp__<server>__<tool>`, plugin form `mcp__plugin_<p>_<server>__<tool>` | top-level `error`                                       |
  | Codex             | `PostToolUse`                        | not documented. Capture one                                             | not documented                                          |
  | Gemini CLI        | `AfterTool`                          | `mcp_<server>_<tool>`                                                   | `tool_response.error`                                   |
  | VS Code / Copilot | `postToolUse` (Preview)              | not on the page read. Capture one                                       | not on the page read                                    |
  | Grok Build        | `PostToolUse` + `PostToolUseFailure` | not on the page read. Capture one                                       | `PostToolUseFailure`; its fields were not read verbatim |

  The rows marked "capture one" are filled in from a real payload, recorded as a test fixture, before
  their adapter is written.

- **The adapter is chosen by the payload's shape, never by the file the hook was installed from.**
  Grok runs the hooks in `~/.claude/settings.json`, but its envelope "uses camelCase keys throughout
  where Claude uses snake_case" (`toolName`, `sessionId`). So one hook entry receives two shapes.
- **One call, one line.** Grok reads both its own hook files and Claude Code's. A hook installed in
  both places would fire twice. The log keeps the call id (`tool_use_id` / `toolUseId`) and the
  reader skips a duplicate.
- Each line records the payload's **format** (`claude` or `grok`), not the runtime: Codex also
  writes snake_case, so a shape says how a line was written and not who wrote it.
- Take from `docs/design/cli-v0/` (`docs/23`): `mcp-config.ts`, which maps a server name to its URL or its
  npm/PyPI page, normalised by `core` (ADR `0054`); `classify.ts`, the failure categories; and the
  sentinel test, which proves no argument or answer is stored. Leave out its SQLite database, its
  verdicts and its `tool-id.ts`.
- The MCP server's `arp_declare_session` reads the same log. **Settled:** per working directory, as
  today, and the hook writes `.arp/.gitignore` (`docs/23` §6.4).
- **A configured URL can carry a key** (`?apiKey=`, `user:pass@`, a token in the path). The ref drops
  the query, the fragment and the userinfo, and falls back to the origin when a path segment is
  credential-shaped (`apps/hook/src/mcp-config.ts`). Found by the verifier's first pass.

### 33b — `@arp-protocol/cli`, built for Node

- New app `apps/cli`. It depends on `apps/mcp`, `apps/node` and `apps/hook` through their exports,
  not through copies.
- Port the four Bun call sites (§3.1) behind small adapters (`node:http`, `process.stdin`). Keep
  `bun test` and the gates.
- `bun build --target=node`, one file per entry, with a `#!/usr/bin/env node` banner.
  `engines.node >=22`.
- **Gate:** run `npx` against a locally packed tarball (`npm pack`, then `npx ./arp-protocol-cli-*.tgz
--help`) in a clean container with Node and no Bun. A green `bun test` says nothing about this
  (`claims.md` check 4).

### 33c — `arp init`, `arp uninstall`, `arp doctor`

The behaviours clig.dev and the Sentry wizard agree on (`docs/23` §4):

- **Detection.** For each runtime, check whether its config directory or its binary exists. List
  what was found and act only on those runtimes.
- **Consent.** Before writing to another program's file, print the path and the diff. Prompt only
  on a TTY. `--yes` accepts; `--no-input` fails with the flag to pass instead.
- **`--dry-run`** prints everything and writes nothing.
- **Idempotent.** Each of our entries carries a marker, as `docs/design/cli-v0/…/install.ts` does. A second
  run replaces our entry and touches nothing else.
- **Backup.** Every file is copied to `<file>.arp-backup-<date>` before its first modification.
- **`--runtime claude,codex,…`** narrows the run, and `--project` writes the project-scope file
  instead of the user one.
- **`arp uninstall`** removes our entries only. **`arp doctor`** checks each entry is present, the
  hook file resolves, and the MCP server answers `initialize`.
- Exit codes are mapped: 0 for success, and one code each for "nothing to install", "refused" and
  "write failed".
- **Per-runtime writers:**

  | runtime     | MCP                                                                          | hook                                                                           |
  | ----------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
  | Claude Code | `claude mcp add` if present, else `~/.claude.json`                           | `~/.claude/settings.json`                                                      |
  | Codex       | `codex mcp add` if present, else `~/.codex/config.toml` `[mcp_servers.arp]`  | `~/.codex/hooks.json`. Codex asks the user to trust it on first run, so say so |
  | Gemini CLI  | `~/.gemini/settings.json` `mcpServers`                                       | `~/.gemini/settings.json` `hooks`                                              |
  | VS Code     | `code --add-mcp` if present                                                  | `~/.copilot/hooks/arp.json`                                                    |
  | Cursor      | `~/.cursor/mcp.json`                                                         | none (§3.5)                                                                    |
  | Grok Build  | nothing if Claude Code's entry exists, which Grok reads. Else `grok mcp add` | nothing if Claude Code's hook exists. Else `~/.grok/hooks/arp.json`            |
  | any other   | `--print` writes the `mcpServers` JSON to stdout and touches no file         | none                                                                           |

### 33d — Native packages

All of them live in one directory, `packaging/`, and are generated by the release script (§2).

- **Claude Code:** `.claude-plugin/plugin.json`, `.mcp.json`, `hooks/hooks.json` and
  `skills/arp/SKILL.md`. The repo root carries `.claude-plugin/marketplace.json`, so
  `claude plugin marketplace add <owner>/ARP` works. Gate: `claude plugin validate`. The node key
  goes through `userConfig` `sensitive`.
- **Codex:** `plugin.json` (with `.codex-plugin/plugin.json` as a fallback), `mcp.json`, `skills/`
  and `hooks/hooks.json`. Marketplace at `.agents/plugins/marketplace.json`. Note from the docs: plugin
  hooks are "supported for plugins installed manually in Codex desktop", so for the Codex CLI the
  hook goes through `arp init`.
- **Gemini CLI:** `gemini-extension.json` (`mcpServers`, `contextFileName` pointing at the skill)
  and `hooks/hooks.json`.
- **Grok Build:** the Claude Code plugin, unchanged:
  `grok plugin marketplace add <owner>/ARP` then `grok plugin install arp --trust`. Gate: install it
  under `grok` and check that one MCP call writes one line.
- **VS Code / Copilot:** documented as `code --add-mcp` + `arp init --runtime vscode`. Its plugin
  format is in Preview and its reference page was not read, so it is **not built** in this task.
- **The skill everywhere it is read:** `~/.agents/skills/arp/` (Codex) and the plugin `skills/`
  directories, all copies of `skills/arp/SKILL.md`, generated rather than hand-copied.

### 33e — The node, opt-in

- `arp init --node` asks for, or takes as flags, the registry, the agent id and the port. It writes
  the key to `~/.arp/agent-key` (0600) and the config to `~/.arp/node.json`.
- `arp node` starts it in the foreground. Running it permanently is the operator's job, so ship a
  `systemd` unit and a `Dockerfile` as templates, not as installed services. A server is not a hook.
- `docs/22_RUNNING_THE_NODE.md:373` moves from an environment variable to the key file.
  `AGENT_PRIVATE_KEY` stays readable for one release, with a warning.

### 33f — Release

- GitHub Actions, npm **trusted publishing** (OIDC, provenance generated without a token). No npm
  token on a laptop. Readers can check with `npm audit signatures`.
- Semver and a changelog. The release script bumps `package.json`, regenerates every manifest (§2),
  tags the release and publishes.
- **Every publish is confirmed by the user** (task 32 §2.12), and so is the first push of each
  marketplace.

### 33g — Docs

- `README.md`: one install block per runtime, with uninstall directly below it (clig.dev,
  Distribution).
- `docs/22_RUNNING_THE_NODE.md`: the programs are now reached through `arp …`. Every path and line is
  re-checked.
- `docs/23_INSTALLING_ARP.md`: the open questions this plan settled are marked settled, with the
  sub-task that settled them.

### 33h — Listed, and used

`docs/23` §7 holds the channels and the reasons.

- **Registries.** Publish to the official MCP Registry from CI (`server.json`, `mcpName` in
  `package.json`, GitHub OIDC). Make the repo a Claude Code marketplace and a Codex marketplace.
  Add the GitHub topic `gemini-cli-extension`. Submit to `claude-plugins-official` through its form.
  **Each one is a publication, so each needs the user's confirmation.**
- **One command per listing**, with uninstall below it.
- **The descriptions the model reads.** Rewrite the MCP tool descriptions and the skill's
  description, and add one scenario test per runtime in which the agent calls ARP unprompted.
- **First run.** `arp init` ends on something the operator could not see before. What that is
  comes from `docs/12` and is decided with the user before it is built.

## 5. Do not do in this task

- No SQLite, `arp status`, verdicts or network column (`docs/23`).
- No hosted service. Everything installed runs on the operator's machine (ADR `0045`).
- No telemetry, opt-in or otherwise. That needs its own decision.
- No VS Code plugin and no Cursor hook until their reference pages are read (§3.5, §4 33d).
- No publish without the user's confirmation, each time.

## 6. Sources

Read 2026-10-30.

- Claude Code: https://code.claude.com/docs/en/plugins-reference ·
  https://code.claude.com/docs/en/plugin-marketplaces · https://code.claude.com/docs/en/hooks
- Codex: https://learn.chatgpt.com/docs/extend/mcp?surface=cli · https://learn.chatgpt.com/codex/hooks ·
  https://developers.openai.com/plugins/build/plugins · https://learn.chatgpt.com/codex/build-skills.
  Some Codex details were read through a summary of the page, not verbatim. Re-read before writing
  the Codex writer.
- Gemini CLI: https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/reference.md ·
  https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md
- VS Code: https://code.visualstudio.com/docs/agents/reference/mcp-configuration ·
  https://code.visualstudio.com/docs/agent-customization/hooks
- Cursor: https://cursor.com/docs/context/mcp
- Grok Build: https://docs.x.ai/build/features/skills-plugins-marketplaces · and, in
  https://github.com/xai-org/grok-build, `crates/codegen/xai-grok-pager/docs/user-guide/` files
  `07-mcp-servers.md`, `09-plugins.md` and `10-hooks.md`. The `PostToolUse` output field names
  were read through a summary, not verbatim.
- Meta Muse Code: no official source found. https://ai.meta.com/ and https://ai.meta.com/muse/
  describe Muse as a personal agent and mention no coding agent.
- Practices: https://clig.dev · https://github.com/getsentry/sentry-wizard ·
  https://docs.npmjs.com/generating-provenance-statements

## 7. Evidence ladder

It moves the hook's record, the _recorded_ rung, from "available to whoever builds the repo" to
"one command away" on every runtime that has a hook. That widens who reaches the staked and proven
rungs (`docs/09` §3). It moves no claim up a rung by itself.
