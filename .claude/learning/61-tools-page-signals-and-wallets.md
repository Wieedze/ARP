# 61 — /tools says Signals, not Usage, and shows the wallets behind it

**Task:** no task file; the spec is `.claude/choices/0143-tools-page-unknown-is-not-dead-and-most-used.md`
**Completed:** 2026-11-05
**Commit:** `uncommitted` (branch `feat/pulse`, on top of `4aa6a4c`, other work is uncommitted in the same tree)
**Verifier verdict:** PASS, after one FAIL of 12 items: stale wording, gate wording, test names, and no RepoPage wallets test.

## What shipped

- `packages/graphql/src/queries/tool-listing.ts` — `sponsored` replaces `proven`; `SPONSORED_WALLETS_QUERY` (`uses` edges only) and `TOOL_WALLETS_QUERY`, both `_eq` on the checksummed address.
- `packages/protocol/src/tool-listing.ts` — `sponsoredDeposits`, `sponsoredWallets` (`null` when the read fails, hits its limit, or has no sponsor), `getToolWallets`.
- `apps/web/src/services/tool-catalog.ts`, `apps/web/src/components/tool/ToolCatalogList.tsx` — the Signals and Wallets columns, the `signals` axis labelled **Most signals**.
- `apps/web/src/components/atom/ToolWallets.tsx`, `apps/web/src/hooks/use-tool-wallets.ts` — the wallet list on the skill, repository and generic atom pages.
- `apps/web/src/hooks/use-tool-catalog.ts`, `apps/web/src/lib/sponsor.ts`, `apps/web/src/pages/ToolCatalog.tsx`, `apps/web/src/pages/SearchPage.tsx`, `.env.example`, `.claude/STATE.md`, `.claude/choices/INDEX.md` — the rename carried through.

## Surprises

- The label stopped being true from another branch: `POST /line` (ADR `0144`, `feat/agent-pulse`) deposits in the agent's name with no proof, and on chain that deposit looks like a proven one. Nothing on this branch changed, and "Usage" became a false claim.
- Selecting the wallets inside the listing with `_ilike` did not answer in 40s on testnet 13579; a separate read with `_eq` answers in under a second.
- The first wallet query read every sponsored deposit, so `/line`'s qualifier levels used up its 250 rows. It now filters on the `uses` predicate.

## Decisions made

- **Signals, the user's word** — `/tools` no longer claims a proof. ADR: `.claude/choices/0143-tools-page-unknown-is-not-dead-and-most-used.md`.
- **Wallets read deposits, not positions, and order nothing** — a later withdrawal does not lower the figure. Same ADR.
- **`/line`'s unproven deposit stays** — dropping it breaks the line, since `pulse-usage.ts` counts an agent as declarer through its position. Same ADR.

## Verification

Gate scope: `apps/web` (`tsc -b`, eslint, `check:tokens`, vitest: 84 files, 767 passed, 2 skipped), `packages/protocol` (1044 passed, 4 skipped), `packages/graphql` (21 passed), and `check:scripts`, exit 0. `apps/mcp` calls `listTools` and its own gates were not run; the root `check:scripts` does not cover it. Not viewed in a browser.

Live, testnet 13579, 2026-11-05, a one-off read through `listTools` and `getToolWallets` against the address in `apps/web/.env`, not committed as a script:

- the wallet query: 0.49 s, 31 rows, 31 edges, 30 distinct wallets, below its limit of 250;
- the listing: 44 edges, 16 tools, 5 with signals, 33 signals in all;
- for each of the 5, `sponsoredWallets` equals the length of `getToolWallets`, and its deposits equal `sponsoredDeposits`: 15/15, 11/11, 4/3, 2/1, 1/1 (signals/wallets).

No tool has signals without wallets, or wallets without signals.

## Left open, to be reported to the user

- `apps/web/src/pages/Landing.tsx:333` still says "used · proven", outside this column.
- A row with blank figures may misalign on a phone, with the name now spanning three rows.
- `getToolWallets` has a limit of 250 and no truncation signal. 15 wallets is the most on one tool today, so this is latent.
- ADR `0144` resolves only on `feat/agent-pulse` until it merges.
- `TOOL_ORDERS` is exported and used only by its test.

## Rules touched

- `.claude/rules/claims.md` — sufficient. Check 5 caught the sweep in both directions: the rename had overwritten dated quotations of "Most used" that had to be restored.
- `.claude/rules/ui.md`, `.claude/rules/code.md` — sufficient.
- `.claude/rules/portability.md` — sufficient. The sponsor address stays config, and mainnet has none.

## Suggestions for future tasks

- When renaming a word that a past passage quotes, read each hit before replacing it: a dated quotation keeps the old word.
- A count that reads an event table beside other writers needs a predicate filter from the start, or another feature's rows use up its page.
- `.claude/learning/60-tools-page-sponsor-filter.md` still says Usage and Most used. It is append-only and correct for its date; read this file after it.

## Evidence ladder

**Which tier of the evidence ladder does this serve, and does it move ARP up it?**

It serves the staked tier, since Signals counts what was deposited in an agent's name with or without a proof, and it does not move ARP up the ladder, because those deposits are ARP's own tests on testnet 13579 paid by ARP's own sponsor.
