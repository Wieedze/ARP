# 0063 — The app tests hooks and components, and ADR 0011's scope says so

**Status:** Accepted
**Date:** 2026-10-27
**Triggered by:** `tasks/26`, closing `tasks/13` with it
**Supersedes the scope of:** `0011-app-test-scope-services-only.md`

## Context

ADR `0011` is titled _"App test scope: services only, no hooks/components"_. It declined a DOM
environment when `app/` had no component worth asserting over, and that was right at the time.

Two things happened to it since, and **neither was recorded**:

**Hooks are tested.** `use-agent-profile`, `use-agent-cohort`, `use-tool-usage`, `use-atom-standing`
and `use-stake-session` all test their exported query options. The scope moved for a good reason —
the options are pure, and the key, the guard and the mapping are the parts that break — but an ADR
that says "no hooks" while the repo tests hooks is misdescribing itself.

**Components shipped defects nothing could catch.** `tasks/26` itemises eight, found across three
review rounds on **one page**, three of them live on mainnet data:

- a sidebar printing `Staked for <0.00000001 across 0 positions` beside a banner saying nobody had
  staked anything — on 20 of the 84 live tool pages
- an off-curve row sorting above a priced edge, on a figure the page is forbidden to display
- a counts line that double-counted an off-curve edge
- a `<p>` as a direct child of `<dl>`
- no `aria-live` on the async region, against three precedents in the same app
- a closing paragraph describing a layout the page did not have

**Two of the eight were closed without a DOM**, by moving pure functions into `tool-usage-view.ts`.
That is the right move whenever a defect is a pure function of the view, and it is why this ADR does
not say "test everything": it says the node environment is still the first place to look.

The other six are about what the DOM contains. Nothing reached them.

## Decision

**`app/` has a DOM test environment, and the test scope is services, hooks, and the components that
decide what a number means.**

`app/vitest.config.ts` runs **two projects**: `*.test.ts` in `node`, `*.test.tsx` in `happy-dom`.
Splitting by extension rather than by directory means a file's environment is visible at its name,
and the 383 existing node tests keep running without a DOM they do not need.

`happy-dom`, not `jsdom` which `tasks/26` names: the same contract, faster, and both are dev-only.

`rules/code.md`'s line about React Testing Library — the one `tasks/13` recorded as unsatisfiable —
is satisfiable now, and says so.

## Alternatives considered

- **Keep `0011` and test nothing in the DOM.** The eight defects are the argument against. Three
  were live on mainnet data; none was found by a test.
- **One environment for everything.** Simpler config, and it makes 383 pure-function tests pay for a
  DOM. The two-project split costs five lines.
- **jsdom**, as the task named. happy-dom implements the same surface faster. If something needs
  jsdom specifically, the project entry is where to say so.
- **Snapshot tests.** Explicitly refused. `rules/code.md` already does, and the reason is concrete:
  a snapshot of that page would have passed with all eight defects in it.
- **Amend `0011` in place.** It is a record of a decision made with the information of its day, and
  that decision was correct then. Superseding its scope keeps both readable.

## Consequences

**Positive:**

- The six DOM-shaped defects are now reachable. `AtomPanel.test.tsx` asserts the dust rule, the
  live region, the three distinct empty states, the sentence shape and the truncation floor;
  `UsageEdgeRow.test.tsx` asserts that an amount never renders without its position count, that
  off-curve is its own state, and that the chain's own symbol is used.
- **The first run found two defects in the tests themselves**, which is worth recording because it
  is what a new environment does: a fixture helper that took `overrides` and never spread them, so
  four tests asserted against a default they had not asked for; and a text query matching two nodes
  because the page says the same sentence twice on the first row of a run.
- `renderWithProviders` passes the chain **explicitly** and never reads `localStorage`. The real
  provider calls `readStored()`, so tests would inherit whatever a previous test wrote and the
  symbol in every assertion would depend on test order.

**Negative:**

- Four dev dependencies — `@testing-library/react`, `@testing-library/jest-dom`,
  `@testing-library/user-event`, `happy-dom` — which `rules/ui.md`'s bundle rule says to justify.
  They ship nothing; the justification is the eight defects.
- A component test can assert the wrong thing confidently. Both failures above were in the test, not
  the code. The discipline is unchanged: a defect that is a pure function of the view goes in the
  service, where it is cheaper to assert and harder to get wrong.

**Neutral (worth knowing):**

- `environmentMatchGlobs` is **gone in Vitest 4**. A config carrying it fails silently, every
  `.tsx` test runs in `node`, and the only symptom is `document is not defined` at the first render
  — which reads as a missing dependency rather than a dead config key. The first version of this
  config had it.
- `app/vitest.config.ts` is still in neither tsconfig project (`tasks/21`, measured at zero errors
  to add). Left there deliberately rather than folded in here.

## References

- Supersedes the scope of: `.claude/choices/0011-app-test-scope-services-only.md`
- Closes: `tasks/13-a-rule-the-repo-cannot-satisfy.md`, `tasks/26-the-app-has-no-dom-test-environment.md`
- Related rule: `.claude/rules/code.md` — the line that was unsatisfiable
