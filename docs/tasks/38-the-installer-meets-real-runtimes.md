# Task 38 — The installer meets real runtimes

**Status:** **PLAN**, 2026-10-30. Not started.
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

| step                | command                                                      | done when                                                                        |
| ------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| update Claude Code  | `claude update`                                              | `claude --version` is newer than 2.0.25, which may not know `PostToolUseFailure` |
| install Codex       | `npm i -g @openai/codex`, then run `codex` once              | `~/.codex/` exists                                                               |
| install Gemini CLI  | `npm i -g @google/gemini-cli`, then run `gemini` once        | `~/.gemini/` exists                                                              |
| install Copilot CLI | `npm i -g @github/copilot`, then run `copilot` once          | `~/.copilot/` exists                                                             |
| install Grok Build  | `curl -fsSL https://x.ai/cli/install.sh \| bash` (docs.x.ai) | `grok --version` answers                                                         |

The npm package names for Codex, Gemini and Copilot come from memory, not from a check. If one
fails, its official page decides. All of these run inside WSL. Cursor and VS Code run on Windows
and wait for part E.

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

Distribution and proof that it works. Each runtime that passes part A adds a runtime whose calls
reach the **recorded** rung. It moves no claim up a rung.
