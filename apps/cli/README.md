# @arp-protocol/cli

ARP's agent-side programs in one binary. Node 22 or later.

```
arp mcp            the MCP server, over stdio (how an MCP client launches it). --http for 127.0.0.1
arp hook           the runtime hook: one payload on stdin, one line in .arp/session.jsonl
arp node           the hire endpoint. Opt-in: it listens on every interface with your agent key
```

All three run on your machine, and none of them signs a transaction.

- **What each one reads, writes and connects to** is in
  [`docs/22_RUNNING_THE_NODE.md`](https://github.com/Wieedze/ARP/blob/main/docs/22_RUNNING_THE_NODE.md).
- **What the hook records**, and what it never records, is
  [ADR `0090`](https://github.com/Wieedze/ARP/blob/main/.claude/choices/0090-what-the-hook-records.md).

`arp init`, which wires the MCP server and the hook into your runtime, comes next. Until then, see
`docs/22` for the settings to add by hand.

## Uninstall

```
npm uninstall -g @arp-protocol/cli
```

Then remove the `arp` entries you added to your runtime's settings, and the `.arp/` directory in
each project.
