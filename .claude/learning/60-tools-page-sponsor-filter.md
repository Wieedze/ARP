# 60 — /tools counts only what the sponsor deposited for an agent

**Task:** no task file; the spec is `.claude/choices/0143-tools-page-unknown-is-not-dead-and-most-used.md`
**Completed:** 2026-11-05
**Commit:** `uncommitted` (branch `feat/pulse`, other work is uncommitted in the same tree)
**Verifier verdict:** PASS, after earlier FAILs. The last FAIL had two items: stale comments and stars missing from `/search`.

## What shipped

- `packages/graphql/src/queries/tool-listing.ts` — `proven` also filters `receiver_id: {_nilike: $sponsor}`, so the sponsor's creation deposit no longer counts.
- `packages/protocol/src/tool-listing.ts` — docs say the same; `declaredDeposits` is still returned.
- `apps/web/src/services/tool-catalog.ts` — the `usage` axis, `unknown` ranks with `alive`, ties go installs, stars, name; no `declaredDeposits` on a row.
- `apps/web/src/components/tool/ToolCatalogList.tsx` — three columns, Declared gone, a blank figure carries no label.
- `apps/web/src/hooks/use-tool-catalog.ts`, `apps/web/src/pages/ToolCatalog.tsx`, `apps/web/src/pages/SearchPage.tsx` — `useReadsUsage`, **Most used** by default, installs or stars where Usage cannot be read.
- `apps/web/src/components/tool/ToolCatalogControls.tsx`, `apps/web/src/lib/sponsor.ts`, `.env.example`, `.claude/STATE.md`, and the tests beside them.

## Surprises

- Setting the sponsor address was not enough: the sponsor's own creation deposits were being counted as proven. ADR `0110` already said the position that counts has the agent as receiver.
- A correction landed in the code and the nearest comment while four other sites kept the old claim (`claims.md` §5). One of them, in `tool-listing.ts`, still said the retracted rule outright.
- The tie change exposed a gap: `/search` passed `stars: null`, so the stated tie order held only on `/tools`.
- `~/.arp/sponsor-ledger.jsonl` holds 4 of the sponsored deposits. The rest are in `.arp/sponsor-ledger.jsonl` in the repo. Checking only the home ledger made 27 of the 31 look unproven.

## Decisions made

- **One filter** — only deposits the sponsor sent to another wallet count on `/tools` and in `/search`'s order. ADR: `.claude/choices/0143-tools-page-unknown-is-not-dead-and-most-used.md`.
- **Mainnet starts from zero** — no sponsor there, so the Usage column stays empty and the order is installs or stars. Same ADR.
- **Ties use figures no deposit can move** — installs, stars, name; edge count, positions and amount order nothing. Same ADR.

## Rules touched

- `.claude/rules/claims.md` — sufficient; §5 is the check that caught the stale comments.
- `.claude/rules/ui.md` — sufficient.
- `.claude/rules/code.md` — sufficient.
- `.claude/rules/workflow.md` — sufficient.

## Suggestions for future tasks

- Check a "passed the gate" claim against the ledger by transaction hash: on 2026-11-05, 31 of 31 sponsor-to-other deposits on testnet 13579 matched, all `content` proofs. That check and the live order were ad hoc; no script is committed.
- When two pages call `rankTools`, test the order on both. The rule lives in one function, but each caller supplies the figures.
- Not viewed in a browser: the layout below `sm` is checked only through code and tests.
- Open and not closed here: `ToolCatalog.tsx:42` still cites ADR `0046`, `TOOL_ORDERS` is a dead export, and there are two sponsor ledgers. The caller is reporting these to the user.

## Evidence ladder

**Which tier of the evidence ladder does this serve, and does it move ARP up it?**

It serves the proven tier, since the page's order now rests only on deposits that passed the proof gate, and it does not move ARP up the ladder, because those proofs are ARP's own tests on testnet 13579 and no third party has produced one.
