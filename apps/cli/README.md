# @arp-protocol/cli

ARP's agent-side programs in one binary. Node 22 or later.

```
arp mcp            the MCP server, over stdio (how an MCP client launches it). --http for 127.0.0.1
arp hook           the runtime hook: one payload on stdin, one line in .arp/session.jsonl
arp node           the hire endpoint. Opt-in: 127.0.0.1, reached through a tunnel you rent
arp init --node    bind the node to your ERC-8004 agent: the token's owner signs once
```

All three run on your machine, and none of them signs a transaction.

- **What each one reads, writes and connects to** is in
  [`docs/22_RUNNING_THE_NODE.md`](https://github.com/Wieedze/ARP/blob/main/docs/22_RUNNING_THE_NODE.md).
- **What the hook records**, and what it never records, is
  [ADR `0090`](https://github.com/Wieedze/ARP/blob/main/.claude/choices/0090-what-the-hook-records.md).

## Install into your runtime

```
arp init --dry-run     see what would change
arp init               do it: asks first, backs up every file it edits
arp doctor             check it: entries present, hook in place, the server answers
```

`init` finds Claude Code, Grok Build, Cursor, Gemini CLI, Codex and Copilot (VS Code, CLI) on this machine. It adds the MCP
server to each one, and the hook to Claude Code (Grok Build reads Claude Code's files). For any
other MCP client, `arp init --print` prints the entry to paste. `--yes` and `--no-input` are for
scripts, `--runtime claude,cursor` narrows the run, and `--project` writes the project's files.

## Uninstall

```
arp uninstall          removes what init added, and nothing else
npm uninstall -g @arp-protocol/cli
```

The `.arp/` directory in each project is the hook's log. Delete it if you want it gone.
