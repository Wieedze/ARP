# 0091 — The agent's activity reaches the browser through a local, read-only feed

**Status:** Accepted
**Date:** 2026-10-30
**Triggered by:** `docs/tasks/36-the-activity-bar.md`, user decision of the same day

## Context

A demo of ARP shows an agent working in Claude Code: it invokes skills, calls MCP servers, signs a
declaration and a stake. The web app is where an audience watches, and it can see none of it:

- **Off-chain records.** The hook's log, the skill receipts and the signer's output are files in
  `.arp/` on the operator's machine.
- **The chain.** It carries the declaration and the deposit, and nothing about the invocation that
  led to them.

## Decision

1. **A local feed: one read-only process on 127.0.0.1.** `arp-session-log --serve` tails the three
   files and streams them as Server-Sent Events.
2. **The browser checks the signer's claims itself.** It relays the feed into the existing activity
   log as a third stream, `agent`. Then it confirms every hash the signer reports by reading the
   receipt from its own RPC client.
3. **Each record has its writer.** The signer gained `--log`, so each signed call leaves a record
   with its calldata. The decoding is pure and lives in `@arp-protocol/core`, and the feed and the
   browser share it.

## Alternatives considered

- **The chain alone** (poll the indexer for the agent's wallet). This needs no server, but it shows
  only the last step of the loop: no invocation and no receipt. It was offered and declined.
- **The browser alone, as Liquid-Voting does.** That works only when the browser is the actor, and
  here the agent is. It was offered and declined.
- **Writing the events into the page source or browser storage.** The browser cannot read the
  files, so the events would have to be copied there by hand.

## Consequences

**Positive:**

- Every step of `docs/12`'s loop has a row, and the rows are joined on ids, never on names:
  - the invocation's `ref` against the create-triple's object;
  - the triple id, read once from `calculateTripleId`, against the deposit's term.
- The feed holds no key and writes nothing.
- **Two checks, not one.** The feed binds 127.0.0.1, answers CORS only for named origins, and
  refuses (403) any request whose `Host` is not `127.0.0.1:<port>` or `localhost:<port>`. CORS
  alone does not stop DNS rebinding: a page whose name is re-pointed at 127.0.0.1 is same-origin
  with the feed. The `Host` check was added after `task-verifier` reproduced exactly that read.
  `apps/mcp/test/activity-feed.test.ts` sends a foreign `Host` and expects 403.

**Negative:**

- **Two terminals for a demo**: the feed and the dev server.
- **A deployed build shows no agent stream** unless `VITE_ARP_ACTIVITY_URL` names a feed. This is
  deliberate: a deployed page does not open a socket to its visitor's localhost.
- **A `sent` row is the signer's word until it is confirmed.** It turns into the chain's word only
  once the browser has read the receipt, which takes one RPC call per hash.

**Neutral (worth knowing):**

- **`node:http`, not `@arp-protocol/core/node`'s `serveFetch`.** `serveFetch` landed the same
  afternoon (`5c8417f`). Moving the feed onto it would let it run under Node inside the `arp`
  binary. That change is left to whoever adds `arp activity`.
- **The tail's limits.** It re-reads a file whose size shrinks, or whose modification time changes
  at the same size. A `touch` therefore replays that file. The browser drops the duplicates by key,
  so a replay costs a re-read and nothing else.
