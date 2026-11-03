<img src="../../docs/design/brand/arp-lockup.svg" height="40" alt="ARP" />

# ARP probe

A Cloudflare Worker that answers "is it me, or is it down for everyone?". Every five minutes it
asks each remote MCP server in the catalogue whether it answers, and reads each package's npm or
PyPI record.

## Schedule

```
cron   */5 * * * *   one cycle: every target in parallel, each with its own timeout
```

The readings are kept in D1, Cloudflare's SQL database.

## Endpoints

| route               | returns                                                 |
| ------------------- | ------------------------------------------------------- |
| `GET /probe`        | each target's latest reading, and its last 24 hours     |
| `GET /probe?days=7` | the same over 7 days (30 at most)                       |
| `GET /healthz`      | how many targets, and when the last cycle ran           |

## What it is, and what it is not

A dated fact: "this server answered ARP at 14:10". It is **not** a score and it is never written
on chain. A server can answer the handshake and still fail every real call, so whether a tool
actually works comes from the agents that use it.

It holds no key and sends nothing but one `initialize` per endpoint and one registry read per
package. The targets come from [`data/catalogue/`](../../data/catalogue).

## Run it

Local only for now.

```bash
bun run dev     # applies the D1 migrations, then wrangler dev on :8788 with the cron testable
bun test
```
