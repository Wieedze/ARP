# Task 46 — The redesign from references: one page at a time, our modules kept

**Status:** 46a **built** 2026-11-02. 46b–46f **proposed**, waiting on the user's choice per page.
**ADR:** none yet. Each ui.md rule a page relaxes gets one, like `0067` and `0073`.
**Rules:** `ui.md`, `code.md`, `claims.md`, `workflow.md`.
**Reviewers:** `ui-reviewer`, then `task-verifier`.
**Required skills:** none beyond the rules.

---

## 1. Why

The user took a Mobbin subscription on 2026-11-02 to clean the site up from proven layouts, page by
page, without losing what makes it ARP. The proposals, with a capture of each page as it stood and
the Mobbin references behind each one, were published to the user that day.

## 2. The user's decisions (2026-11-02)

| Question | Decision |
| --- | --- |
| Firm, whatever a reference does | no explanatory sentence in the UI; no mouse-reactive effect; the Sigil with no container; ADR `0057`'s fonts and colours; one accent |
| Also firm, said this session | **our custom modules stay**: `ClaimField` with its circles and loupe, `Sigil` / `AtomSigil`, `SourceField`, `RingLoader`. A reference changes the layout around them, never them: _« je veux quand même garder mes trucs custom, mes couleurs et tout »_ |
| Negotiable, one ADR each | dense 15+ row lists, the two-column detail view, borders-not-shadows, the anti-template list |
| Order | `/tools` first |
| `/tools` | variant A of five, without its two parts that reversed earlier decisions (below) |

## 3. 46a — `/tools` pages its list (built)

It rendered every row at once: 662 skills on testnet 13579, a page 54,915px tall at 1440px wide,
measured in a headless browser on 2026-11-02. `/agents` already paged by 25.

- `pageOfTools` and `TOOL_PAGE_SIZE = 25` in `apps/web/src/services/tool-catalog.ts`. Pure, clamps
  an offset the list shrank under to its last page.
- `apps/web/src/pages/ToolCatalog.tsx` pages the ranked list. Changing the order, the index or the
  domain filter returns to the first page.
- The header's "In the list" box is gone. The pager's `1–25 of N` is the same count: what is shown
  after the index and the domain filter.

**Left out of variant A, on purpose.** A smaller page title reverses the user's 2026-10-27 call that
put display type back at 88px (`index.css`, the comment on `--text-display`). A `—` in an empty
cell reverses the decision written in `ToolCatalogList.tsx` that a zero is blanked.

**Tests.** `pageOfTools`, 4 in `services/__tests__/tool-rank.test.ts`. The page, 4 in
`pages/ToolCatalog.test.tsx`: 25 rows and stepping, and the return to page 1 on order, index and
domain. With the three resets removed, 3 of the 4 fail.

## 4. Proposed, not started

Each waits on the user's choice of mockup.

| | Page | Proposal | Rules touched |
| --- | --- | --- | --- |
| 46b | `/agent/:chainId/:tokenId` | open on the first non-empty tab; drop the "Graph read from" line and the mainnet declare sentence; the CAIP-19 shown once | none |
| | | Support panel sticky on the right | two-column detail view |
| 46c | `/activity` | one table with chips instead of three stacked blocks | none |
| 46d | `/register` | two choice tiles, each with a mono line of what it needs | none |
| 46e | `/agents` | the id lookup inside the search; `—` when nobody holds a position, which has to match what `/tools` does | none |
| | | filter chips | new feature, scope |
| 46f | the shell | the giant footer wordmark on `/` only | ADR `0057`'s handoff |

## 5. Do not do in this task

- Touch `ClaimField`, the Sigils, `SourceField` or `RingLoader`.
- Start a page the user has not chosen a mockup for.
- Relax a ui.md rule without its ADR and its amendment.

## 6. Evidence ladder

UI work serves no tier directly: it makes the **staked** tier easier to read and reach. A paged
`/tools` lets a reader get to the tools with stake behind them. It does not move ARP up the ladder.
