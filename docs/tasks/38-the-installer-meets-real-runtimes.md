# Task 38 — The installer meets real runtimes

**Status:** **Part A done for Claude Code, 2026-11-02** (branch `feat/38-claude-code-demo`, built on top of task 49, PR #32). Captures from 2.1.316 are fixtures; `arp init` pins testnet; `.arp/` ignores itself; doctor
requires claude ≥ 2.1.316; `packages --tarball` for testers. Post-mortem
`.claude/learning/NN-the-installer-meets-real-runtimes.md`. Open: archive hosting, part D's
decisions, parts B, C, E. Planned 2026-10-30. **Narrowed 2026-11-02 by the user: Claude Code
first, for the demo; every other runtime waits for the port.** So part A runs for Claude Code only,
parts B, C and E wait, and part D is needed only before something is published.
**Decided 2026-11-02 by the user: everything on testnet 13579 for now, declarations included.**
`arp init` writes `ARP_TARGET=testnet` into every MCP entry (`SERVER_ENV` in
`apps/cli/src/install/targets.ts`); the server's own default, mainnet, is unchanged. Found live:
the entry without it read mainnet and returned `edges_read: 0` next to a web app on testnet.
**Done together with the user**: every step that needs a runtime runs on their machine, and every
step that publishes needs their word.
**Finishes:** task 33's 33i (second half) and 33d (Grok, Gemini, Codex), and clears what 33f needs
before anything is published.
**Rules:** `code.md`, `security.md`, `claims.md`, `workflow.md`.
**Reviewers:** `task-verifier` per part.

---

## 1. Why

`arp init`, the capture and the Claude Code plugin pass every test on this machine. Three things
are still only proven by documentation:

- the hook reading Codex, Gemini, Cursor and Copilot;
- the plugin and the extension installing under Grok and Gemini;
- the Codex plugin.

This task replaces documentation with one real run per runtime.

## 2. Before starting (the user)

| step                | command                                                      | done when                                                                 |
| ------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| update Claude Code  | `claude update`                                              | `claude --version` is 2.1.316 or newer: 2.0.25 loaded zero hooks (part A) |
| install Codex       | `npm i -g @openai/codex`, then run `codex` once              | `~/.codex/` exists                                                        |
| install Gemini CLI  | `npm i -g @google/gemini-cli`, then run `gemini` once        | `~/.gemini/` exists                                                       |
| install Copilot CLI | `npm i -g @github/copilot`, then run `copilot` once          | `~/.copilot/` exists                                                      |
| install Grok Build  | `curl -fsSL https://x.ai/cli/install.sh \| bash` (docs.x.ai) | `grok --version` answers                                                  |

The npm package names for Codex, Gemini and Copilot come from memory, not from a check. If one
fails, its official page decides. All of these run inside WSL. Cursor and VS Code run on Windows
and wait for part E.

For the demo, only the first row is needed. The other four wait for the port.

## 3. Parts, in order

### A — Captures (33i, second half)

1. In `apps/cli`, run `bun run build`, then `node dist/cli.js init --capture --dry-run`, then
   `node dist/cli.js init --capture`.
2. In each runtime, restart it, then make one `arp` MCP call that succeeds and one that fails.
   Codex asks to trust the hook: accept.
3. Read `~/.arp/captures/` (redacted, ADR `0090` "Extension: captures"), then hand it over.
4. For each runtime:
   - turn the capture into a fixture under `apps/hook/test/fixtures/<runtime>/`;
   - write its adapter in `apps/hook/src/payload.ts`;
   - add its hook to plain `arp init`, not only `--capture`.

   Copilot must not be read as Grok: tell them apart by `toolArgs` against `toolInput`. Gemini
   needs the configured server list to split `mcp_<server>_<tool>`, unless `mcp_context` names
   the server.

5. `node dist/cli.js init` returns the machine to plain mode.

**Done when** each installed runtime has a fixture, an adapter test, and a hook in plain `init`.

**Claude Code, done 2026-11-02** (2.1.316, user scope, `~/arp-demo`). Six `arp` calls gave six
`ok` lines and one failing call gave one `tool_error` line; the hook needed no change. The two
captures are `apps/hook/test/fixtures/claude/`, fed end to end in `apps/hook/test/hook.test.ts`.
What the capture showed that the docs did not: an MCP `tool_response` is the bare content array,
and the runtime adds `mcp_server: {name, source}`. Three things the run found:

- **Claude Code 2.0.25 loaded zero hooks** from `settings.json` ("Found 0 hook matchers" in its
  debug log) while `/mcp` worked, so an old runtime records nothing without any error.
  ~~`arp doctor` should say so.~~ **Fixed in `229b4b8`**: `arp doctor` fails a `claude` older than
  2.1.316.
- **The MCP entry read mainnet** (`edges_read: 0` next to a web app on testnet); fixed by
  `SERVER_ENV` above.
- **`.arp/receipt-key` is not gitignored outside this repo.** The MCP server writes it in the
  working directory and only this repository's root `.gitignore` covers it. Latent here
  (`~/arp-demo` is not a git repo); ~~must be fixed before any tester round.~~ **Fixed in
  `1645acc` and `333d375`**: the server writes `.arp/.gitignore` (`*`) beside the key, also for a
  key that already exists, and a directory that refuses it no longer stops the server.

### B — The plugin under Grok, the extension under Gemini (33d)

1. Make a local copy with `bun run packages --local /tmp/arp-pkg`.
2. Grok: `grok plugin marketplace add /tmp/arp-pkg`, then `grok plugin install arp --trust`. One
   MCP call must write one line in `.arp/session.jsonl`. This checks xAI's claim that Grok reads
   Claude Code plugins.
3. Gemini: `gemini extensions install /tmp/arp-pkg/packaging/gemini/arp` (or `link`). The `arp`
   MCP server must answer.

**Done when** both install and one call works. Each result goes into task 33's 33d table.

### C — The Codex plugin (33d)

1. Re-read the plugin schema verbatim. So far it was only read through a summary.
2. Add a `.gitignore` exception for `.agents/plugins/`. Today `.agents/` holds vendored skills and
   is ignored whole.
3. Generate `packaging/codex/arp/` from `packages.ts`, with the same version rule.
4. Install it in Codex. Its docs say plugin hooks run only in Codex desktop, so the CLI's hook stays
   `arp init`'s.

### For testers before an npm release (2026-11-02)

The user chose an `npm pack` archive at a private URL. `bun run packages --tarball <https url> <dir>`
(in `apps/cli`) writes the plugin into `<dir>` with its MCP entry running
`npx -y --package <url> arp mcp`, and the archive beside it. `npx -y <url>.tgz mcp`, the first form
tried, executes the archive itself and fails. Tried from a local HTTP server, with `npx` pointed
at the archive by hand (`--tarball` accepts only an `https://` URL, so it cannot write that entry):
the archive starts and answers `initialize` on 13579. Hosting is not decided.

Every generated plugin entry carries `ARP_TARGET=testnet` and `ARP_TOOLS=read` (task 45: the
plugin is for people who search). `arp doctor` fails a `claude` older than 2.1.316, the oldest one
seen running the hooks.

The committed plugin's `.mcp.json` (`packaging/claude/arp/`) runs `npx -y @arp-protocol/cli@0.0.1`,
which is not on npm, so until a publish or a hosted archive only `arp init` (local `dist`) or a
`--tarball` copy starts. The plugin entry's `ARP_TOOLS=read` also hides `arp_declare_session`, so
the demo's declare step goes through `arp init`'s entry.

### D — Decisions before publishing (33f)

| question               | why it blocks                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **the licence**        | no LICENSE file in the repo, while `apps/cli/package.json` and the Claude plugin's `plugin.json` say MIT                                      |
| **one version**        | `apps/mcp/src/server.ts` reports `serverInfo.version` `0.2.0`, while the package is `0.0.1`                                                   |
| **the Gemini gallery** | it expects `gemini-extension.json` at the repository root. Here it is in `packaging/gemini/arp/`: a release archive, or a separate repository |
| **the npm scope**      | `@arp-protocol` must belong to the user on npmjs.com before the first publish                                                                 |

Each one is the user's answer. None is guessed.

### E — Windows (Cursor, VS Code)

`arp init` run in WSL writes only WSL's home directory. Cursor and VS Code on Windows read
`C:\Users\<name>\`. Either:

- run `arp` from Windows (Node on Windows, `node dist\cli.js init --capture`);
- or add a `--windows-home` option that writes there from WSL.

The user chooses.

## 4. Do not do in this task

- Publish anything (npm, a marketplace, a gallery) without the user's word, every time.
- Ship a hook for a runtime without a fixture from a real capture.
- Keep a capture in the repository unredacted. Fixtures are the redacted files, re-read before they
  are committed.

## 5. Evidence ladder

Distribution and proof that it works. It serves tier 3, **staked**, and indirectly: the runtime's
own record of what it used is the input to a paid `uses` declaration, which can carry a deposit.
It moves no claim up a rung itself, and it holds only on the `arp init` path — the plugin entry
hides the declare tool.
