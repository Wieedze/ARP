<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../docs/design/brand/arp-lockup-dark.svg" />
  <img src="../../docs/design/brand/arp-lockup-light.svg" height="40" alt="ARP" />
</picture>

# ARP hook

Records which tools your agent actually used, as the runtime saw them. This record is what a
declaration is built from later.

It runs after every tool call (`PostToolUse` and `PostToolUseFailure`) and appends one line to
`.arp/session.jsonl` for each skill or MCP call.

**It makes no network call.** It writes locally and nothing else.

## Install

```bash
arp init         # copies the hook to ~/.arp/bin and registers it, backing up your settings first
arp uninstall    # removes it
```

By hand: `cd apps/hook && bun run build`, then point both events in `.claude/settings.json` at
`apps/hook/dist/arp-hook.js`. The exact snippet is in
[Running the node](../../docs/22_RUNNING_THE_NODE.md#the-hook--appshook).

## What it writes, and what it never writes

Per call: the tool, the outcome (`ok`, `tool_error`, `auth`, `timeout`, `unreachable`, `payment`),
the status code, the duration and the size of the response.

**Never** the response itself, the arguments or the error text, because those can hold a key or a
file. A URL is stripped of its query, credentials and anything that looks like a token. The first
time it runs, it writes a `.gitignore` in `.arp/` so the log is never committed by accident.

A payload it cannot read exits cleanly and writes nothing, so the hook never blocks a tool call.

```bash
bun test     # from apps/hook
```
