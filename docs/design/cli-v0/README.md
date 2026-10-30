# ARP CLI v0, week 1: the hook, the local database, arp status

Built on `feat/agent-panel-tabs` at `b5682d9`, as one commit on a new branch `feat/arp-cli-v0`.

Apply from the repo root:

```bash
git checkout -b feat/arp-cli-v0 feat/agent-panel-tabs
git am docs/design/cli-v0/0001-feat-cli-the-usage-hook-the-local-database-and-arp-s.patch
bun install
cd packages/cli && bun run test
```

`files-packages-cli/` is the same package as plain files.

## What is in it

| spec item | state |
| --- | --- |
| hook on discovery (SessionStart) and on each MCP call (Pre, Post, PostToolUseFailure) | done |
| tool identity: remote URL, npm or PyPI package page, else private | done |
| outcome categories `ok`, `tool_error`, `auth`, `timeout`, `unreachable`, `payment`; cancelled calls not counted | done |
| SQLite `~/.arp/arp.db`, tables `tools`, `calls`, `changes`, `sync`; 90 day retention then daily counts | done |
| never stores arguments, answers, error messages, headers, keys | done, tested with a sentinel string |
| `arp status`, `arp status <tool>`, `--days`, `--json`, `arp forget`, `arp ignore`, `arp init` | done |
| verdict rules in spec order, with the thresholds as constants | done; without the network reading every tool reads `not enough data`, as the spec's first rule says |
| host changed alert, at the top of `arp status` and once in the session | done |
| functions changed, price changed | not yet: the hook cannot see `tools/list` without a network call |
| identity, sponsor delegation, `uses` triple, `arp sync` | week 2 |
| signed weekly reports, network snapshot, the network column | week 3 |
| badge, `npx @arp-protocol/cli init` published | week 4 |

## Two things to check against the spec

1. **The hook payload is not fully documented.** Claude Code documents `PostToolUseFailure` as an event, but not the exact fields of its payload or of `tool_response`. The classifier reads defensively (`error`, `tool_response`, `isError`, `status`) and falls back to `tool_error` on a failure and `ok` otherwise. Capture a few real payloads with `ARP_DEBUG` before tuning it.
2. **The 20 ms budget.** The hook's own work is measured under it over 1,000 calls. Starting the Node process costs about 80 to 90 ms, so the tool call hooks are registered `async` and Claude Code does not wait for them. If a Claude Code version ignores `async`, each MCP call would wait about 90 ms.

One deliberate change from the spec: a tool's local id is a fingerprint of its **server name**, not of its URL. Keyed by URL, a server moving to another host would become a second tool and the "host changed" alert could never fire.
