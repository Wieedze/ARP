# Task 12 — Tabs on the agent panel, one per provider

> **Status: COMPLETE** (specified 2026-09-17, completed 2026-09-17).
> Branch `feat/agent-panel-tabs`, 5 commits from `de8ea64`, head `7146d8d`.
> `ui-reviewer` PASS · `task-verifier` PASS.
> Post-mortem: `.claude/learning/13-agent-panel-tabs.md`.
> Decisions: `.claude/choices/0028-tab-strip-carries-the-comparison.md`.

## Objective

`/agent/:chainId/:tokenId` currently stacks everything vertically: Assessments (every provider one
under the other), then Capabilities, then what could not be read. Replace that with **tabs**.

One tab per provider present on this agent — `Deep3 Labs`, `AsterPay KYA`, `ARP` — plus one **`Agent`**
tab carrying the agent's own data: identity, capabilities, and what could not be read.

Each provider tab groups **all the scores that provider publishes** for this agent: the headline score
with its evidence rail, every dimension, the signature verdict, the freshness verdict, the market and
the stake control.

## The thing not to lose

Stacking has one virtue tabs destroy: you can see Deep3's 26-reviewer score and AsterPay's unsigned
one **at the same time**. That comparison is the page's editorial claim — `docs/12` and the panel's own
design exist to argue that a score's weight is not its number, and a reader who sees one provider at a
time cannot weigh them against each other.

So the tab strip is not bare. Above or inside it, a **compact summary line per provider stays visible
in every tab**: provider name, signature verdict, and evidence weight. Enough to see at a glance that
one signs and one does not, that one rests on 1,445 reviewers and another on two. The tab supplies the
detail; the summary keeps the comparison.

Use your judgement on whether that lives in the tab labels themselves or as a row above them — but it
must be visible from every tab, and it must not become a second set of numbers competing with the
detail.

## Behaviour

- Tabs are **dynamic**: one per provider actually present. An agent with a single provider should not
  pay for a tab strip that has nothing to switch to — render it as today, or as a single labelled
  panel. Decide and say which.
- The `Agent` tab is always present.
- Default tab: the provider with the most evidence behind it. If none has any, `Agent`.
- The selected tab belongs in the URL (`?tab=deep3-labs`), so a link to a specific provider's view is
  shareable and a refresh does not lose the place.
- The stake control stays inside its provider's tab — it acts on that provider's claim, and moving it
  outside would detach it from what it is staking on.

## Constraints

- `.claude/rules/ui.md` binds. No shadcn default styling, hairline borders not shadows, no gradients,
  mono for data. A tab strip is exactly the component that arrives looking like a template — restyle
  it.
- **Accessibility is not optional here.** Proper `role="tablist"` / `role="tab"` / `role="tabpanel"`,
  `aria-selected`, arrow-key navigation between tabs, visible focus. Note: `index.css` had an
  unlayered `button:focus-visible { outline: none }` that silently killed focus rings — check it is
  still fixed before relying on the base rule.
- Verdicts render exactly as the connector reports them. A tab must never upgrade `unverified`.
- Nothing about the connector, the services or the view model needs to change unless you find a real
  reason. This is a presentation change. If `TrustPanelView` needs a grouping helper, put it in
  `agent-trust.ts` with a test, not in the component.
- `.claude/rules/code.md`: component → hook → service. No component reaches the connector directly.

## Verification

- `bun run test`, `bun run lint`, `bunx tsc -b` in `app/`
- Keyboard: tab into the strip, arrow between tabs, focus visible throughout
- No horizontal body scroll at 400px — a tab strip with three or four providers is where this breaks
- There is **no browser here**. Do not claim visual verification; say so.

## Acceptance criteria

- [x] One tab per provider present, plus `Agent`, on `/agent/8453/2340` (two providers) and `/agent/8453/1380`
- [x] A single-provider agent does not get a pointless tab strip
- [x] The per-provider summary is visible from every tab
- [x] Selected tab is in the URL and survives a refresh
- [x] Stake control stays inside its provider's tab
- [x] Arrow-key navigation works, focus is visible, ARIA roles correct
- [x] `ui-reviewer` pass, then `task-verifier` pass

## Out of scope

- The directory `/agents`, the import page, the connector.
- Any change to what a verdict means or how a score is computed.
