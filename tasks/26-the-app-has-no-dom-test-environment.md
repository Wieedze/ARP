# Task 26 — The app has no DOM test environment, and it cost six defects on one page

> **Status: NOT STARTED** (recorded 2026-10-19, from two `ui-reviewer` rounds on `tasks/23`).
> ADR `0011` chose no DOM environment for `app/`. This is the bill for that choice, itemised.

## The finding

`app/` has 231 tests and **no way to render a component**. Services and hooks are tested as pure
functions — which is why `agent-trust.ts`, `tool-usage-view.ts` and the query-options pattern are
tested at all — but nothing asserts what a component puts on screen.

Two review rounds on **one page** (`tasks/23`) found six defects that a single render assertion
would each have caught. They are not hypothetical and none was found by a test:

| what shipped                                                                                                                                         | the assertion that would have caught it                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| The sidebar printed `Staked for <0.00000001 across 0 positions` beside a banner saying nobody had staked anything — **20 of the 84 live tool pages** | render an all-free tool, assert the sidebar is absent      |
| The off-curve row sorted **above** the priced edge, because it sorted on a figure the page is forbidden to display                                   | render the mixed fixture, assert the row order             |
| The counts line read `1 priced assertion · 1 staked off-curve · 3 free assertion`                                                                    | render the IPFS fixture, assert the string                 |
| A `<p>` as a direct child of `<dl>` — invalid HTML                                                                                                   | validate the rendered markup                               |
| No `aria-live` on the async region, against three precedents in the same app                                                                         | query for a live region                                    |
| The Ladder's closing paragraph described a layout it did not have, and was false on the empty state                                                  | render both states, assert the copy matches what is listed |

Every one is a pure function of a fixture that already exists in the repo. The first two were live
on mainnet data.

## What this is not

- **Not a reversal of ADR `0011`'s reasoning.** That ADR declined a DOM environment when `app/` had
  no component worth asserting over.

  Worth noticing while in there: ADR `0011` is titled _"App test scope: **services only, no
  hooks/components**"_, and hooks **are** tested now — `use-agent-profile`, `use-agent-cohort` and
  `use-tool-usage` all test their exported query options. Nobody recorded that the scope moved. It
  moved for a good reason (the options are pure and the contract is the thing that breaks), and the
  ADR should say so rather than being quietly outgrown. The page from `tasks/23` renders five states from one read and
  decides, per edge, which of three things to say about money. That is a different thing to test.

- **Not snapshot testing.** `rules/code.md`: "tested behaviourally, not by checking implementation
  details … not enzyme-style snapshots." A snapshot of this page would have passed with every one of
  the six defects in it.
- **Not a licence to test every component.** The two in scope are the ones that decide what a number
  means.

## Do

0. Amend ADR `0011`, or supersede it. Its stated scope excludes hooks, which are already tested;
   adding components on top of a scope nobody has updated makes the ADR misdescribe the repo twice.
1. Add `jsdom` and `@testing-library/react` to `app/` as devDependencies, with the justification
   `rules/ui.md`'s bundle rule asks for in the PR description — they are dev-only and ship nothing.
2. Wire the environment in `app/vitest.config.ts`. Note that file is **in neither tsconfig project**
   (`tasks/21`, measured at zero errors to add), so fix that in the same change or it stays outside
   the typecheck it is configuring.
3. Tests for `ToolUsagePanel` over fixtures that already exist: the all-free tool, the mixed
   priced/off-curve/free tool, the empty state, the malformed atom id, and the loading and error
   states.
4. Tests for `UsageEdgeRow`: that an amount never renders without a position count, that the
   off-curve state renders as itself rather than as free, and that the caption appears once per run.
5. One markup-validity check over the rendered page, which is what catches a `<p>` inside a `<dl>`.

## Do not do in this task

- Do not test the panel, the directory or the module list. They are older surfaces and retrofitting
  them is a separate decision with a separate cost.
- Do not assert on class names. The design language changes; what a number means does not.
- Do not add a browser runner. jsdom is enough for every row in the table above.

## Gate

The six defects in the table are each reproduced as a failing test against the code as it was, then
pass against the code as it is. A test that cannot be made to fail has not been shown to work —
`tasks/24` learned that the hard way.

## Which tier of the evidence ladder does this serve?

None directly — it is test infrastructure. It serves the **staked** tier indirectly and specifically:
every defect in the table above was a case of the interface saying something false about money, and
three of them were about rendering `docs/14`'s _nothing_ as though it were evidence.
