<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Wieedze/ARP/main/docs/design/brand/arp-lockup-dark.svg" />
  <img src="https://raw.githubusercontent.com/Wieedze/ARP/main/docs/design/brand/arp-lockup-light.svg" height="40" alt="ARP" />
</picture>

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

## The Claude Code plugin

The plugin carries this program as one file, `bin/arp.js`, so it needs Node 22 and nothing from npm:

```
claude plugin marketplace add <a checkout of this repo, or owner/repo>
claude plugin install arp@arp
```

With no `arp` on `PATH`, its commands stand in for `arp share` and `arp line`. A person types them, and the model cannot invoke them:

```
/arp:share         what would be public, and what stays here. Sends nothing
/arp:share-on      turn sharing on (off by default). Sends nothing
/arp:share-off     turn it off
/arp:share-send    write the shared failures as public lines on testnet. Needs a sponsoring service
/arp:line          write one public line on testnet: --tool <url> --outcome worked|failed
```

The search in `arp_pulse` still runs `npx skills`: `npx` comes with Node, and that package comes from the npm registry. Installed from a local path, the plugin is read from that path, so keep the folder where it is.

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

`init` does not replace an MCP server named `arp` that it did not write. It leaves it, says so, does the rest and exits 6. Rename yours, or pass `--force` to replace it.

## Uninstall

```
arp uninstall          removes what init added, and nothing else
npm uninstall -g @arp-protocol/cli
```

The `.arp/` directory in each project is the hook's log. Delete it if you want it gone.
