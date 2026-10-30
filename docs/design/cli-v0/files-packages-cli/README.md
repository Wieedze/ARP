# @arp-protocol/cli

When a tool your agent uses fails, is it you, or everyone?

This version answers the first half, on your machine: a Claude Code hook records every MCP tool
call, and `arp status` shows, per tool, how many calls, how many worked, and how long they took.
**Nothing leaves your machine in this version.** The network column (how the same tool does for
other agents) and the public declaration arrive in the next ones.

```bash
npx @arp-protocol/cli init      # Node 22.13 or later
# restart Claude Code, use your agent, then
arp status
```

## Commands

| command                          | effect                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `arp init [--project]`           | install the hooks in `~/.claude/settings.json` (or the project's), create `~/.arp/arp.db` |
| `arp status`                     | every tool over 7 days, most urgent first                                                 |
| `arp status <tool>`              | one tool by day, its failures by category, its changes                                    |
| `arp status --days 30`, `--json` | another window; the same data as JSON                                                     |
| `arp ignore <tool>`              | never publish this tool                                                                   |
| `arp forget [--uninstall]`       | erase the local database (and remove the hooks)                                           |

## What is recorded, and what never is

Per call: the tool, the function name, `ok` or a failure category (`tool_error`, `auth`,
`timeout`, `unreachable`, `payment`), at most a status code such as `502`, the duration, the time
and the session id.

**Never**: an argument, the content of an answer, a full error message, a header, a key. A test
passes a known string through a call and searches the database file for it.

A server started from a script or a local path, or served from localhost, is **private**: it
appears in `arp status` and is never published.

## How it stays out of your agent's way

- The tool call hooks are registered `async`: Claude Code does not wait for them.
- The hook's own work is well under the 20 ms budget (measured over 1,000 calls in the tests);
  starting the process costs about 80 to 90 ms on a laptop, which is why it runs asynchronously.
- It makes no network request, and if anything fails (a locked database, a full disk) it exits 0
  in silence. `ARP_DEBUG=1` prints the reason.
- Calls are kept 90 days, then folded into one count per day and per tool.

`ARP_HOME` moves the database elsewhere.
