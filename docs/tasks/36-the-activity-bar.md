# Task 36 — The activity bar: what the agent triggered, and what it declared

**Status:** done, 2026-10-30 (see completion note at the end).
**Asked by:** the user — « une barre d'événements en bas de ma page … pour que ma démo soit
compréhensible » and « un endroit où je vois le trigger des skills et MCP ». Reference:
`intuition-box/Liquid-Voting`, `src/components/TxConsole.tsx` and `src/lib/chain/tx-log.ts` (commit
`1bc3e5c`).
**User decisions (2026-10-30):** a small local feed rather than the chain alone or the browser alone,
and a bar on every page **plus** an `/activity` page.
**Rules:** `code.md`, `ui.md`, `portability.md`, `claims.md`, `workflow.md`.
**Reviewers:** `ui-reviewer`, then `task-verifier`.

## Why the reference does not carry over as it is

Liquid-Voting's console logs what **its browser** signs, and the agent is that browser there. ARP's
demo is the reverse: the agent runs in Claude Code and the browser watches. A browser cannot read
`.arp/session.jsonl`, so the reference's design gives a page that sees none of the loop.

## What ships

| layer | file | what |
| --- | --- | --- |
| protocol, pure | `packages/protocol/src/activity.ts` | one event type for the three local records; a line parser; a MultiVault calldata decoder; a wire re-validator |
| signer | `scripts/agent/agent-send-plan.ts --log` | one JSON line per call, dry or sent, with its calldata |
| feed | `apps/mcp/src/activity-feed.ts`, `session-log.ts --serve` | tails `.arp/{session,receipts,sent}.jsonl`, serves SSE + JSON on 127.0.0.1, CORS for named origins only |
| web service | `apps/web/src/services/agent-feed.ts`, `agent-feed-live.ts` | the feed → the existing `ActivityLog` as a third stream, `agent`; each sent hash confirmed by reading its receipt from the chain |
| web UI | `components/brand/ActivityLog.tsx` mounted in `Layout`; `pages/ActivityPage.tsx` at `/activity` | the bar; a page joining each invocation to its declaration and its stake |
| sandbox | `scripts/sandbox/setup.ts` | `bin/arp-sign` logs to `.arp/sent.jsonl`; `bin/arp-activity` runs the feed; hook wired on both events |

`ActivityLog` already existed (`c037c58`, 2026-10-30 02:30) and nothing mounted it. It is extended
here rather than duplicated, and its labels moved to English with the rest of the app.

## Amended 2026-10-30 — every transaction, clickable

The user, after the first commit: « tout ce qui se passe on-chain a un id de tx et doit être dans
les logs d'activité et cliquable vers l'explorer », and « un accès dans la navbar ». So the first
"Do not do" bullet — *instrument the web app's own write sites* — is withdrawn, and struck through
below:

- `services/tx-record.ts`: `waitAndRecord` replaces `waitForTransactionReceipt` at all 17 service
  sites that wait for a receipt. `recordSent` and `recordSettled` are used in `use-stake-actions`
  (deposit, redeem), where sending and waiting are two calls. Each records `sent` with the hash,
  then `confirmed` or `refused`, on the waiting client's chain.
  - Three functions send without waiting: `depositOnAtom`, `redeemRegisterModule` and
    `redeemStakeOnAtom`. Nothing in the product calls any of them (grepped 2026-10-30).
    `redeemCreateAtom` doesn't wait either, but both its callers do; `redeemArpDelegation` is the
    send underneath all of them.
- **Chain stream.** The indexer's `transaction_hash` now rides on `RecentDeclaration.txHash`. It was
  checked live on both chains before it was added to the query.
- **Clickable hashes.** Every hash in the bar is a link to its own chain's explorer.
- **Navbar.** `Activity` is in the left group.

## Amended 2026-10-30 — who did what, and the toggle

The user: « on doit voir le lien entre offchain et on chain … c'est quoi cette signature ? … il faut
aussi les id agent », and « tout doit répondre au switch mainnet et testnet ».

- **Who.** `getTermLabels` (`packages/protocol/src/term-labels.ts`, query `ATOM_LABELS_QUERY`) reads
  what the chosen chain's indexer calls each id. The query was checked live on both chains first. A
  wallet is named by the identity atom it declared from, so `0xB86F…` reads `Agent 13579:8`. A
  wallet that declared nothing stays an address. The `0x76dc…` on a receipt is named for what it is:
  the content server that signed it, with « signed receipt, not a transaction ».
- **The link.** `/activity`'s two columns became one timeline: Time · Who · Off chain · On chain ·
  Transaction. Each transaction names the invocation that caused it, and each invocation lists the
  declaration and stakes it led to. Both joins are on ids (`timelineRows`).
- **The toggle.** The bar and the page show only the chosen chain's transactions; off-chain events
  show on both. Chain-stream entries now always carry their chain.

## Do not do in this task

- ~~Instrument the web app's own write sites.~~ Withdrawn the same day, see the amendment above.
- Add an `arp activity` command to the CLI. arp-41 takes it once this lands.

## Completion note

2026-10-30, commit `353df6d`. `ui-reviewer` FAIL (8 findings, fixed); `task-verifier` FAIL (3, fixed), then PASS. Post-mortem `.claude/learning/25-the-activity-bar.md`, ADR `0091`. Amendment (every transaction, clickable; Activity in the nav): commit `63c1fbc`, `task-verifier` FAIL (4, fixed) then PASS.
