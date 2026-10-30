# 0090 — What the hook records: outcome and identity, never content or credentials

**Status:** Accepted. Extended 2026-10-30 by task 33i — see "Extension: captures" at the end.
**Date:** 2026-10-30
**Triggered by:** task `docs/tasks/33-one-installer.md` 33a, and its first `task-verifier` FAIL.
Post-mortem `.claude/learning/23-one-installer-33a.md`.

## Context

The hook (`apps/hook`) writes the runtime's record of what an agent invoked, and that record later
feeds a declaration (`arp_declare_session`). Before 33a it had four gaps:

- It was wired on `PostToolUse` only. Claude Code sends a failed call to `PostToolUseFailure`
  (code.claude.com/docs/en/hooks), so no failure was ever recorded.
- It read Claude Code's snake_case payload only. Grok Build runs the hooks in
  `~/.claude/settings.json` and sends camelCase keys.
- An MCP call's ref was `tool_input.url`. That is an argument, for example the page a fetch tool was
  asked to read, so it named the wrong thing and wrote down what the agent did.
- Grok reads both its own hook files and Claude Code's, so one call could be written twice.

Fixing the third gap by reading the server's URL from configuration opened a fourth: a configured
URL is the operator's, and it can carry a key. The verifier reproduced `?apiKey=SENTINEL` reaching
the log verbatim, because `normaliseToolUrl` keeps the query.

## Decision

**Per call, the hook writes:**

- the call id;
- the payload's format, `claude` or `grok`;
- an outcome: `ok`, `tool_error`, `auth`, `timeout`, `unreachable` or `payment`;
- at most a status code;
- the duration the runtime measured;
- the response's size;
- what was invoked: a skill's name and source, or an MCP server's name and its URL.

**It never writes** an argument, a response's content, an error's text, or anything in a configured
URL that could be a credential.

The rules this takes:

1. **An MCP server is named by its configuration, not by an argument.** The ref is the remote URL,
   or the npm or PyPI page of the package a launcher runs (`apps/hook/src/mcp-config.ts`). A script,
   a local path or localhost gives no ref. This matches ADR `0087`'s identity table.
2. **Credentials are stripped before normalising.** The query, the fragment and the userinfo are
   always dropped. If any path segment is shaped like a credential (24 or more
   `[A-Za-z0-9_-]` characters, letters and digits mixed), the whole path is dropped and the origin
   is kept.
3. **The format is recorded, not the runtime.** Codex also writes snake_case, so a payload's shape
   says how it was written and not who wrote it.
4. **One line per call.** `parseSessionLog` keeps one line per (session, call id). Lines without an id
   predate this ADR and are kept as they are.
5. **A cancelled or interrupted call is not written.** Nothing was used.
6. **The log stays per working directory**, at `<cwd>/.arp/session.jsonl`. The first time the hook
   creates `.arp/`, it writes `.arp/.gitignore` containing `*`. `${CLAUDE_PLUGIN_DATA}` was
   rejected because it is one directory for every project.

## Alternatives considered

- **Keep `tool_input.url` as the MCP ref.** It is an argument. It identifies a page, not a tool,
  and it records what the agent did.
- **Keep the configured URL whole.** It leaks keys that the operator put in their own configuration,
  and an atom made from it would publish them permanently.
- **Keep the origin only, for every remote server.** This is private by construction, but it merges
  every server on one host and loses `/mcp`-style paths that ADR `0087`'s endpoint atoms need.
- **Detect the runtime from the environment, for example `CLAUDE_PROJECT_DIR`.** It is not documented
  as exclusive to Claude Code, and a wrong runtime label is worse than an honest format label.
- **Write the log under `${CLAUDE_PLUGIN_DATA}`.** It would merge every project's sessions into one
  log, and the MCP server reads the log per project.

## Consequences

**Positive:**

- Failures are visible, and `auth` is kept apart from `tool_error`, which separates a configuration
  problem from a broken tool.
- An MCP call carries the tool's identity instead of none.
- The sentinel tests now cover configuration as well as the payload.

**Negative:**

- **The path-token rule is a heuristic.** A shorter token passes: `sk_live_9f8e7d6c5b4a`, 19
  characters, was verified to reach the log. That is **latent**, not live: the log is local and
  gitignored, and `resolveInvocations` never reads an MCP ref. **It must be revisited before any
  task turns an MCP ref into an atom**, because an atom is permanent and a log line is not.
- Two servers on one host that differ only by a token-shaped path share a ref.

**Neutral (worth knowing):**

- `resolveInvocations` still reports MCP calls as `unknown`. Under ADR `0087` the resolution belongs
  in `packages/protocol/`, shared with the web, and `mcp-config.ts` should move there when it is
  built.
- The fixtures come from documented examples, not captured payloads. Grok's `toolResult` field name
  was read through a summary of its docs page.

## References

- Related rule: `.claude/rules/security.md` (the log's privacy covers configuration, not only
  arguments and responses)
- Related docs: `docs/22_RUNNING_THE_NODE.md` (the hook section), `docs/23_INSTALLING_ARP.md` §3 and
  §6.4
- Related ADRs: `0054` (an atom id is a function of a normalised URL), `0087` (a tool is its
  package), `0089` (one installer)
- Triggered by post-mortem: `.claude/learning/23-one-installer-33a.md`

## Extension: captures (task 33i, 2026-10-30)

`arp hook --capture` writes a second
file, `~/.arp/captures/`, redacted **deny by default** (`apps/hook/src/capture.ts`):

- **At the top level:** a listed set of naming strings (event, tool, ids, model) and every number and
  boolean are kept. A URL keeps its scheme and host only.
- **At every deeper level:** strings become their length, numbers become `<number>`, booleans are
  kept, and a key is kept only if it is identifier-shaped and not credential-shaped (20 or more
  characters mixing letters and digits, such as `AKIA…` or `ghp_…`).

That residue (top-level numbers, deep booleans, field names) is accepted explicitly, because an
adapter needs the payload's structure. It is not the same rule as the session log, which keeps
only the duration. The first version listed content fields instead, and the verifier got a password, a
token, a card number and nested names through it.
