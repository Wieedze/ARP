# 11 — The agent directory lists the whole cohort

**Task:** `tasks/10-agent-directory-full-cohort.md`
**Completed:** 2026-09-16
**Commit:** `26da3b8` (branch `feat/agent-trust-panel`, 8 commits from `dd2fc7f`)
**Verifier verdict:** PASS (second pass; first pass held on an open `ui-reviewer` gate, not on code)

## What shipped

**Package `@arp-protocol/erc8004`**

- `erc8004/src/listing.ts` — `listAgents`, `listingCapableSources`, `resolveListOptions`,
  `NoListingSourceError`, `ListAgentsFailedError`. First source that can answer owns the page; pages
  are never merged or re-ranked.
- `erc8004/src/sources/intuition/queries.ts` — `COHORT_QUERY` + frozen `COHORT_ORDER_BY`. Order is a
  variable so there is one query text, but the orders themselves are a frozen literal — nothing
  builds an order clause from caller input.
- `erc8004/src/sources/intuition/map.ts` — `mapAgentListing`, `mapAtomMarket`, `mapIdentities`.
- `erc8004/src/sources/source.ts` — `listAgents?` added to `TrustSource`, optional, Intuition only.
- `erc8004/src/types.ts` — `AgentListing`, `AgentPage`, `AgentAtomMarket`, `AgentListOrder`,
  `ListAgentsOptions`, `ResolvedListAgentsOptions`.
- 3 mainnet-recorded cohort fixtures, 19 tests in `test/listing.test.ts`, live smoke extended.

**App**

- `app/src/services/agent-cohort.ts` — `COHORT_ORDERS`, `toCohortRow`, `buildCohortView`. Pure.
  Does no sorting or filtering of its own, by design.
- `app/src/hooks/use-agent-cohort.ts` — order **and** offset both in the query key.
- `app/src/components/agent/CohortList.tsx` — one grid, hairline per row, 4 columns collapsing to 2
  below `sm` with the headers moving into `sr-only` per-cell units.
- `app/src/pages/AgentDirectory.tsx` — rewritten; lookup form retained for BSC/Ethereum.
- `app/src/services/trust-format.ts` — `describeAtomPositions`, `describeChain`.
- 22 new tests (127 → 149 app-wide).

## Surprises

- **The task's own query was wrong, and only a real row showed it.** It paired
  `term.total_market_cap` (all curves) with `vaults(curve_id: $curveId).position_count` (one curve).
  Captain Dackie holds 6.34 TRUST on curve 2 and 0 positions on curve 1, so the specified query
  prints "6.34 TRUST · 0 positions" — the exact misreading the position-count requirement exists to
  prevent, produced by the mechanism meant to prevent it. ADR 0023.
- **A GraphQL variable does not coerce where a literal does.** `$curveId: String!` against a Hasura
  `numeric` column is rejected at _validation_, taking the whole trust surface query down — every
  assessment, market and capability edge behind it. The panel had been rendering agents with zero
  providers. **Fixtures are structurally blind to this**: a fixture answers whatever it is asked, so
  a query the indexer would refuse passes every hermetic test in the suite. Only the opt-in live
  smoke test caught it (`9c24681`).
- **One mainnet atom claims sixteen ERC-8004 identities.** `Ouro Proof-of-Compute Oracle` carries
  sixteen `same as` edges, all Base token ids; a second atom with the same label carries sixteen
  more. Clawnch carries a `did:web:clawn.ch` edge that is a true statement about a different
  namespace. "Take the first `same as` object" gets both wrong. ADR 0024.
- **The graph stores `""` for a missing image**, and `<img src="">` resolves against the page URL —
  it would render the document as an avatar. An empty string is not an image.
- **A `focus-visible` rule fixed in Task 08 was inert the whole time.** `button:focus-visible` set
  `outline: none` and swapped the border to accent — no indicator at all on a selected toggle whose
  resting border is already accent. Worse, the rule is _unlayered_, so per CSS Cascade 5 it beat
  every `focus-visible:outline-*` utility in `@layer utilities`, silently killing rings in
  `StakeControl` and the lookup form since Task 08. Found by reading the emitted stylesheet, not the
  source.

## Decisions made

- **Cohort market cap and position count read at the same scope, across every curve.** The list is
  _ordered_ by `term.total_market_cap`, so a curve-scoped cap would give an order whose column does
  not descend. Consequence: the cohort read takes no curve parameter at all. ADR:
  `.claude/choices/0023-cohort-listing-reads-the-atom-market-across-every-curve.md`.
- **A row with an ambiguous identity gets no link and the reason instead.** Sample of 4 `same as`
  edges plus a filtered aggregate count; `ref` is set only when every edge was seen and exactly one
  parses as an ERC-8004 CAIP-19 id. ADR:
  `.claude/choices/0024-a-cohort-row-refuses-an-ambiguous-identity.md`.
- **Both order clauses end in `subject_id: asc`.** The mirrored shell gives thousands of agents an
  identical statement count; an unbroken tie makes offset pagination non-deterministic and pages
  drop and repeat rows. A test asserts the tiebreak on every order.
- **`select` and `textarea` joined the ring selector for consistency, not repair** — their border
  swap was already a real replacement, but two controls focusing differently from every other
  control on the same form is a thing a reader has to decode.

## Rules touched

- `.claude/rules/code.md` — sufficient. "No dead weight" is what forced the two inert
  `focus:outline-none` utilities out; the argument that a dead class is a _trap_ (move the ring into
  a layer one day and the input silently loses focus) is worth reusing.
- `.claude/rules/ui.md` — sufficient and load-bearing. Its "focus rings are visible, not
  `focus:outline-none` without a replacement" is what surfaced the Task 08 cascade bug. **Note for
  anyone editing `app/src/index.css`: the focus block is deliberately unlayered and must stay that
  way** — Tailwind v4 utilities live in `@layer utilities`, and unlayered wins regardless of
  specificity.
- `.claude/rules/workflow.md` — sufficient. Worth recording that the caller declared both deviations
  and the unverifiable a11y criteria _before_ the verifier looked, which turned two potential
  scope-violation findings into confirmations.
- `security.md` / `solidity.md` — not loaded. No contract surface in this task.

## Suggestions for future tasks

- **A recorded fixture cannot validate a query.** Every new or edited GraphQL query needs one live
  assertion, or it is unverified no matter how green the suite is. This cost a silently broken trust
  panel once already.
- **Verify a spec's query against a real row before implementing it.** The task's pairing was
  verified live "before the work started" and still shipped the bug, because it was checked for
  _syntax_, not against a row where the two scopes disagree. Pick the adversarial row.
- **Do not pre-check acceptance boxes.** `29db912` marked all nine `[x]`, including
  "`ui-reviewer` pass, then `task-verifier` pass", before either agent had returned. Eight were
  accurate; one recorded intent. A checklist that records intent stops being usable as evidence.
  Corrected in `26da3b8`.
- **A reviewer's fix can invalidate a verification in flight.** `5d9142a` landed _during_ the first
  verification pass, so the state verified was already behind the state described. When a review
  loop is still open, finish it before invoking the verifier.
- **No browser in this environment.** Keyboard reach, focus visibility and 400px behaviour were read
  off markup, Tailwind classes and the emitted stylesheet — never observed. The cascade bug above is
  proof that reading is not free of error even when it is careful. Someone should open `/agents` at
  phone width once.
- App test scope stays services-only per ADR 0011, so `CohortList.tsx` and `AgentDirectory.tsx` have
  no render tests; the logic that would be tested lives in `agent-cohort.ts`, where it is.

## Residuals the verifier accepted rather than closed

- Six files outside this task's set (`StakeControl`, `RegisterModule`, `ToolDetail`, `AgentRegister`,
  `Hire`, `ModuleList`) still carry `focus:outline-none`. They went from inert to redundant — none is
  broken. Deliberately not swept: blind-editing a real-money stake control to delete no-ops is the
  worse trade. Wants a browser.
- Density is ~6 rows above the fold against `ui.md`'s ~15. The ~470px preamble is the cost, not the
  ~51px row. Carried forward by `ui-reviewer` as non-blocking.
- App-wide `a:hover` cyan and `--color-border-strong` at 1.33:1 as a control boundary are
  `docs/05_UI_DESIGN.md` §2 token decisions predating this task. They want an ADR, not a drive-by.
- The `Ouro` rows sit high in the evidence order and cannot be opened at all. Reaching one means the
  lookup form with a token id the row does not offer. Accepted in ADR 0024 as better than a link to
  an agent the row may not be about.
