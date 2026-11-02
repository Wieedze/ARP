# Task 46 — The redesign from references: one page at a time, our modules kept

**Status:** 46a and 46d **built** 2026-11-02. The user approved the two shared layouts the same day
(list pages follow `/tools`, detail pages follow the skill page) and ADR `0104`. 46b, 46c and 46e wait
for task 47 (plain words) to commit, because it edits the same files. 46f waits on the user.
**ADR:** `0104` (detail pages put the facts on the right). Each ui.md rule a page relaxes gets one.
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
| The two shared layouts, and the agent page's facts on the right | **yes** ("oui"), on the mockup page "ARP — une grammaire, toutes les pages": list pages follow `/tools`, detail pages follow the skill page. ADR `0104` |
| `/register` | the two-tile mockup on that same page. Built first because task 47 does not touch `Register.tsx`: _« ok fait la »_ |
| The line under the tool URL field ("The scheme, `www.`, a trailing slash and a fragment are normalised away…") | **remove it**: _« on enlève »_. Done after task 47 is merged into this branch, because task 47 edits `ToolRegister.tsx` |

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

**Done** 2026-11-02, `21eb064`. ui-reviewer PASS, task-verifier PASS, post-mortem `.claude/learning/36-the-redesign-from-references.md`.

**Tests.** `pageOfTools`, 4 in `services/__tests__/tool-rank.test.ts`. The page, 4 in
`pages/ToolCatalog.test.tsx`: 25 rows and stepping, and the return to page 1 on order, index and
domain. With the three resets removed, 3 of the 4 fail.

## 4. Proposed, and built where marked

A row is built only after the user has chosen its mockup (§2).

| | Page | Proposal | Rules touched |
| --- | --- | --- | --- |
| 46b | `/agent/:chainId/:tokenId` | open on the first non-empty tab; drop the "Graph read from" line and the mainnet declare sentence; the CAIP-19 shown once | none |
| | | facts in cards on the right, like the skill page | two-column detail view, **amended** by ADR `0104` |
| 46c | `/activity` | one table with chips instead of three stacked blocks | none |
| 46d | `/register` | **built** `986896b`, post-mortem 37 (`Choice` in `YourAgent.tsx` now has no importer outside its file; drop its `export` once task 47 commits that file): two choice tiles, each with a mono line of what it needs (`ERC-8004 identity · wallet`, `URL · wallet`). No symbol: a Sigil comes from chain data. `pages/Register.test.tsx`, 2 tests | none |
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
