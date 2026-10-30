# 23 — Installing ARP: one command, and what professionals do

**Status:** research and direction, 2026-10-30. Not a task. The decision it records is the user's:
_« je veux un seul installer, pense friction et surtout pense comme une entreprise professionnelle »_.
The decisions taken from it are ADR `0089` (one installer) and ADR `0090` (what the hook records).
Everything about a third party below cites the page it came from; everything about this repo cites a
file and a line.

---

## 1. Where each program lives

Only the web app (and `apps/api`, local for now) runs at ARP. The three other programs run **on
the agent's side**. `docs/22_RUNNING_THE_NODE.md` §"Three programs" describes each one.

| program     | job                                                                                                | who needs it                           |
| ----------- | -------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `apps/hook` | the runtime writes one line per tool call to `.arp/session.jsonl`                                  | every agent that declares what it used |
| `apps/mcp`  | reads the graph, fetches skills, prepares transactions. `arp_declare_session` reads the hook's log | every agent                            |
| `apps/node` | a public address where the agent is **hired**: it checks the payment and signs a receipt           | only an agent that sells work          |

So the natural bundle is **hook + MCP server**: one writes the log and the other reads it. The node
is a different kind of thing. It is a long-running server bound to every interface that holds the
agent's key, and ADR `0082` keeps it apart for that reason.

## 2. The professional answer for Claude Code is a plugin

Claude Code has a packaging unit made for exactly this case. One plugin ships MCP servers, hooks
and skills together:

```
arp/
├── .claude-plugin/plugin.json
├── .mcp.json              the MCP server
├── hooks/hooks.json       the hook, on PostToolUse and PostToolUseFailure
└── skills/arp/SKILL.md    the publishable skill, skills/arp/SKILL.md today
```

Install is two shell commands with no JSON to edit, and both run non-interactively:

```
claude plugin marketplace add <owner>/<repo>
claude plugin install arp@<marketplace>
```

Facts from https://code.claude.com/docs/en/plugins-reference and
https://code.claude.com/docs/en/plugin-marketplaces, read 2026-10-30:

- `${CLAUDE_PLUGIN_ROOT}` is the installed version's path. Use it in the hook command, so there are
  no absolute paths. Today the hook needs one (the settings snippet in `apps/hook/src/hook.ts`'s header).
- `${CLAUDE_PLUGIN_DATA}` (`~/.claude/plugins/data/<id>/`) survives updates. State goes there, not in
  the plugin root, because the root "changes when the plugin updates".
- `userConfig` prompts for values when the plugin is enabled. With `"sensitive": true` a value goes to
  "the platform's secure credential store instead" of `settings.json`. That is where a key belongs.
- Versions: if `version` is set, users get a new copy only when it changes. Without it they follow
  commits. Auto-update is off by default
  (https://code.claude.com/docs/en/plugins/host-marketplace).
- A plugin's MCP tools are named `mcp__plugin_<plugin>_<server>__<tool>`
  (https://code.claude.com/docs/en/hooks). The hook's server regex must accept that form.

**What this replaces in `docs/design/cli-v0/`.** Its `install.ts` merges hooks into `settings.json` by hand.
A plugin makes that unnecessary for Claude Code. The idempotent merge is still the right technique
for runtimes that have no plugin system (§4).

## 3. Two defects the docs reveal in the current hook

The documentation is the source for both. Neither has been reproduced with a live payload yet.
**Both are fixed by task 33a**, 2026-10-30: the hook's documented wiring covers both events and it
records `duration_ms` (`apps/hook/src/payload.ts`). The text below describes the hook as it was.

1. **Failed calls never reach it.** `PostToolUse` runs "after a tool call succeeds" and
   `PostToolUseFailure` "after a tool call fails: the tool threw an error, or an MCP tool returned an
   error result". The hook was registered on `PostToolUse` only, so its `failed` flag could never be
   true for an MCP error. The failure payload carries a top-level
   `error` string and `is_interrupt`, not `tool_response`.
2. **`duration_ms` is already in the payload** of both events. Measuring a call does not need a
   `PreToolUse` and `PostToolUse` pair stored between processes, which is what `docs/design/cli-v0/` built
   SQLite for.

Hooks can also be registered `"async": true`, so Claude Code does not wait for them
(hooks reference, command-hook fields).

## 4. Practices to follow, whatever the packaging

From https://clig.dev unless stated. Each line names the clig.dev section it comes from.

| practice                                        | source                                                                                                                                                                     | what it means for ARP                                                                                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| one command, idempotent                         | Robustness: "operations should be idempotent where possible"                                                                                                               | `arp init` twice leaves one copy of everything                                                                                                            |
| never require a prompt                          | Interactivity: "Only use prompts … if `stdin` is … a TTY", support `--no-input`                                                                                            | an agent installs ARP with no human present; every answer is a flag too                                                                                   |
| dry-run                                         | Arguments and flags: "`-n`, `--dry-run` … describe the changes"                                                                                                            | `arp init --dry-run` prints the files it would write                                                                                                      |
| consent before editing another program's config | Configuration: "ask the user for consent and tell them exactly what you're doing"                                                                                          | print the path and the diff of `~/.claude.json`, `.cursor/mcp.json` … before writing                                                                      |
| uninstall is a command                          | Distribution: "Make it easy to uninstall"                                                                                                                                  | `arp uninstall` removes only our entries. Sentry has `--uninstall` (https://github.com/getsentry/sentry-wizard)                                           |
| no secrets in env vars                          | Environment variables: "Do not read secrets from environment variables"                                                                                                    | `AGENT_PRIVATE_KEY` today (`docs/22_RUNNING_THE_NODE.md:373`). Prefer a 0600 file, as `.arp/receipt-key` already is (`:65`), or the plugin's secure store |
| no telemetry without consent                    | Analytics: "Do not phone home … without consent", ideally opt-in                                                                                                           | already ARP's posture (`docs/22`, outbound counted). Sentry's wizard is opt-out, which is the pattern to avoid                                            |
| a single file to run                            | Distribution: "distribute as a single binary"                                                                                                                              | ~~all three builds target Bun, so installing requires Bun. **Open**~~ **Settled**: `@arp-protocol/cli` targets Node ≥ 22 (task 33b, ADR `0089`)           |
| supply chain                                    | npm docs: trusted publishing via OIDC, provenance "automatically generated", checked with `npm audit signatures` (https://docs.npmjs.com/generating-provenance-statements) | publish `@arp-protocol/*` from CI with trusted publishing, never from a laptop token                                                                      |
| clean exit, brief output                        | The Basics, Output                                                                                                                                                         | zero on success, a short "what changed" summary, nothing animated when not a TTY                                                                          |

## 5. The shape this points to

The plan that builds it is `docs/tasks/33-one-installer.md`. Its summary:

```
npx @arp-protocol/cli init                any runtime: detects them, writes the MCP entry and the hook
claude plugin install arp@arp             Claude Code: hook + MCP server + skill
grok plugin install arp --trust           Grok Build: the same Claude Code plugin, unchanged
codex plugin marketplace add <repo>       Codex: its own plugin format; the CLI's hook via `arp init`
gemini extensions install <repo url>      Gemini CLI: an extension
code --add-mcp '{…}'                      VS Code (Copilot); `arp init` writes the hook
npx @arp-protocol/cli init --print        any other MCP client: prints the entry, writes nothing
npx @arp-protocol/cli init --node         the node, opt-in. It is a server, so it gets a unit file
                                          or an image, not a hook
```

One npm package holds the code. Each native package is a thin manifest that pins its exact version,
generated at release so the two never disagree.

### Runtimes, and how sure we are of each

| runtime           | MCP                     | hook after a call                                           | package                            | confidence                                                                                     |
| ----------------- | ----------------------- | ----------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| Claude Code       | yes                     | `PostToolUse` + `PostToolUseFailure`                        | plugin                             | official docs, read verbatim                                                                   |
| Grok Build        | yes                     | `PostToolUse` + `PostToolUseFailure`, **camelCase** payload | reads the Claude plugin            | official docs and repo. Claude compatibility is claimed by xAI and must be tested              |
| Codex             | yes                     | `PostToolUse`                                               | plugin, marketplace                | official docs, partly read through a summary                                                   |
| Gemini CLI        | yes                     | `AfterTool`                                                 | extension                          | official docs. Its site announces a replacement by "Antigravity CLI" for unpaid users. Recheck |
| VS Code / Copilot | yes, root key `servers` | `postToolUse`, Preview                                      | plugin format in Preview, not read | official docs, partly                                                                          |
| Cursor            | yes                     | unknown: its hook page returned 404                         | none                               | MCP page only                                                                                  |
| Meta Muse Code    | unknown                 | unknown                                                     | unknown                            | **no official source.** Only blogs; ai.meta.com mentions no coding agent                       |

Two consequences for the hook, both in task 33a. **The payload is identified by its shape**: Grok
runs Claude's hooks with camelCase keys. **A call is written once**: Grok reads its own hook files
and Claude's, so a hook installed in both fires twice, and the log deduplicates on the call id.

## 6. Open questions

1. ~~Node or Bun~~. **Node ≥ 22**, decided in task 33 §3.1. Ported in 33b: six Bun call sites, not the four first counted.
2. ~~Which clients~~. Settled by the table above. Muse Code and Cursor's hook wait for official docs.
3. ~~The marketplace~~. Both: ARP's own repo serves as a marketplace, and the official ones are a
   submission (§7).
4. ~~Where the log lives under a plugin~~. **Per working directory, `<cwd>/.arp/session.jsonl`, as
   today** — settled by task 33a, 2026-10-30. The hook takes `cwd` from the payload and the MCP
   server reads the same project's file. `${CLAUDE_PLUGIN_DATA}` is one directory for every
   project, so two projects' sessions would land in one log. And since `.arp/` sits in the
   operator's repository, the hook writes `.arp/.gitignore` (`*`) the first time it creates the
   directory ("Where it writes" in `apps/hook/src/hook.ts`'s header).

## 7. Discovered, installed, used

Three different problems. Being listed solves the first and does nothing for the third.

### 7.1 Discovered: be where each runtime looks

| channel                       | how                                                                                                                                                                                                                                                                                                           | reaches                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Official MCP Registry**     | a `server.json`, published with `mcp-publisher` (`init`, `validate`, `login`, `publish`). Ownership is proven by an `mcpName` field in the npm `package.json`. It stores metadata only, so the npm package is published first. Login can be GitHub OIDC from CI. It has no review. It is described as preview | every MCP client. Microsoft says the GitHub MCP Registry will use it as a source |
| **`claude-plugins-official`** | Anthropic's marketplace, present in every Claude Code. Submission is a form, claude.ai/settings/plugins/submit or platform.claude.com/plugins/submit. "You do not need to re-submit the form for updates"                                                                                                     | Claude Code, and Grok through its Claude compatibility                           |
| **ARP's own marketplace**     | `.claude-plugin/marketplace.json` at the repo root, and `.agents/plugins/marketplace.json` for Codex                                                                                                                                                                                                          | anyone with the repo URL, from day one, without waiting for a review             |
| **Gemini CLI gallery**        | no submission. The repo gets the topic `gemini-cli-extension`, `gemini-extension.json` sits at the root, and a release is tagged. The gallery crawls daily                                                                                                                                                    | Gemini CLI                                                                       |
| **skills.sh**                 | `skills/arp/SKILL.md`, already in the repo and publishable (ADR `0052`). Whether it is listed there today was not checked                                                                                                                                                                                     | every agent that reads skills                                                    |
| **npm**                       | name, description, `keywords` (`mcp`, `claude-code`, `agent`, `erc-8004`), provenance                                                                                                                                                                                                                         | people who search npm                                                            |

Third-party directories (Smithery, mcp.so, Glama) mostly copy the official registry. They come
after it, not instead of it.

**Every listing shows one command**, its runtime's, with uninstall directly below it. A listing that
offers six ways in is a decision handed to the reader.

### 7.2 Installed

Task 33. The rule is the one in §4: one command, idempotent, no prompt required, a dry run, consent
before writing another program's file, and an uninstall command.

### 7.3 Used: the model chooses, not the human

An operator installs ARP once. After that, every use is a decision the model makes.

- **The MCP tool descriptions and the skill's description are what the model reads.** They decide
  whether ARP is called. Write them like an API surface, and test them with a scenario where the
  agent should call ARP without being told to.
- **The hook removes that decision for the record.** An invocation is written whether or not the
  agent "thinks of ARP" (§1, `apps/hook/src/hook.ts` header). That is the structural advantage, and
  it is why the hook is task 33's first sub-task.
- **`SessionStart` can put one line of context in front of the agent.** Claude Code, Grok, Codex and
  VS Code document a session-start event. For Gemini CLI, Cursor and Muse Code it was not
  confirmed. Keep it to one line of fact, never a pitch (`ui.md`, Copy).
- **The operator needs a reason within the first run.** `arp init` ends by showing something the
  operator could not see before. What that is comes from `docs/12`, not from this document. If the
  first useful output is in the README rather than in the terminal, the install is a trial that ends
  in an uninstall.

**What a listing does not do.** It gives credibility and a one-click install. Nobody arrives because
of it. Use comes from §7.3.

## 8. Sources

Read 2026-10-30. Third-party pages are marked.

- Claude Code: https://code.claude.com/docs/en/plugins-reference ·
  https://code.claude.com/docs/en/plugin-marketplaces · https://code.claude.com/docs/en/hooks ·
  https://code.claude.com/docs/en/discover-plugins · https://www.claude.com/docs/plugins/submit
- Grok Build: https://docs.x.ai/build/features/skills-plugins-marketplaces ·
  https://github.com/xai-org/grok-build (`crates/codegen/xai-grok-pager/docs/user-guide/`)
- Codex: https://learn.chatgpt.com/codex/hooks · https://developers.openai.com/plugins/build/plugins
- Gemini CLI: https://geminicli.com/docs/extensions/releasing/ ·
  https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md
- VS Code: https://code.visualstudio.com/docs/agents/reference/mcp-configuration ·
  https://code.visualstudio.com/docs/agent-customization/hooks
- MCP Registry: https://learn.microsoft.com/en-us/dotnet/ai/quickstarts/publish-mcp-registry ·
  https://composio.dev/blog/how-to-publish-mcp-server (third party)
- Meta: https://ai.meta.com/ · https://ai.meta.com/muse/ (no coding agent mentioned)
- Practices: https://clig.dev · https://github.com/getsentry/sentry-wizard ·
  https://docs.npmjs.com/generating-provenance-statements
