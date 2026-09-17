# 0027 — The tab strip carries the comparison, and ARP gets a tab

**Status:** Accepted
**Date:** 2026-09-17
**Triggered by:** `tasks/12-agent-panel-tabs.md` — four decisions the task left to judgement, and one
extension of ADR 0018 that a later reader would otherwise read as a violation of it.

## Context

Task 12 replaces the stacked right column of `/agent/:chainId/:tokenId` with tabs: one per trust
provider, plus the agent's own data. The task is explicit that stacking has one virtue tabs destroy —
a reader could see Deep3's 26-reviewer score and AsterPay's unsigned one at the same time — and that
the replacement must keep that comparison visible from every tab without becoming "a second set of
numbers competing with the detail".

Four things were left open, and a fifth surfaced during the build.

1. **Where the per-provider summary lives** — in the tab labels, or in a row above the strip.
2. **Whether ARP gets a tab.** The task's objective enumerates `Deep3 Labs`, `AsterPay KYA`, `ARP` as
   the provider tabs. ARP publishes no assessment of anybody; its row says so.
3. **When a strip appears at all.** The task requires that a single-provider agent "should not pay
   for a tab strip that has nothing to switch to", and leaves the threshold to the implementer. One
   provider covers 99.99% of this cohort, so whatever the threshold is, it decides what almost every
   agent renders.
4. **What the default tab is** when the URL names none. The task says "the provider with the most
   evidence behind it", which still has to be defined against `ReviewerBasis`.
5. **The alarm colour.** ADR 0018 scopes `--color-alarm` to "the `mismatch` badge and the left rule
   on the row carrying it". With tabs, the row carrying a mismatch can be the one tab a reader is not
   looking at, and the ADR was written when there was no such thing.

## Decision

**The summary lives in the tab labels, and it carries no score.** Each provider tab is three lines:
the provider's name, the connector's signature verdict, and the reviewer count that verdict's
document rests on. The score stays in the panel. That is not a space saving — a strip of scores would
rank providers by exactly the variable ADR 0018 argues is not the measure, and it would do it in the
one component that is visible from every tab. The strip states what a number *rests on*; the panel
states the number.

**ARP gets a tab.** Its abstention is a claim about this agent and only reads as a position if it
sits where a position sits. Its two summary lines are `no assessment` and `insufficient evidence`,
which is the same shape as a provider's two lines and contains no arithmetic.

**The strip appears at two or more providers.** Below that there is no comparison to preserve, and
the page renders exactly as it did before this task — stacked, with the ARP block under the single
assessment. `shouldUseTabs` is one exported predicate so the threshold is testable and is stated in
one place.

**The default tab is the provider with the largest published reviewer count**, ties going to graph
order, and `Agent` when no provider publishes a count at all. Deliberately not the highest score:
opening on the loudest number would undo the panel's argument on the first screen.

**The alarm colour extends to the tab of a mismatched provider** — its verdict line and its rule, and
nothing else. This is ADR 0018's "the left rule on the row carrying it" applied to the control that
now hides that row, not a new use. The scope is unchanged in substance: exactly one condition in the
codebase may use the colour, and it is still `mismatch`.

The consequence of that last one for the rest of the strip is that the accent is spent on the
selected state, so it cannot also mean "signed". `verified` and `not verified` are separated by
foreground weight instead — the device `FreshnessLine` already uses for stale against fresh.

## Alternatives considered

- **A summary row above the strip** — rejected. It prints every provider's name twice within 40px and
  gives the reader two places to look for the same fact, which is the "second set of numbers" the
  task warns against. The strip is already the thing that is visible from every tab; putting the
  summary anywhere else adds a component to keep in sync with it.
- **Score in the tab label** — rejected, and it is the sharpest version of the mistake this panel
  exists to argue against: four numbers side by side, sized identically, ranked by the one value that
  costs nothing to publish.
- **A micro evidence rail in the tab** — rejected. The rail is ADR 0018's device and it works because
  it is large enough to be read as form rather than as a bar; at 11px it would be a texture, and it
  would compete with the real rail one click away.
- **No ARP tab, ARP folded into the `Agent` tab** — rejected. ARP is not the agent, and filing its
  abstention under the agent's own data misattributes it.
- **ARP counted as a provider for the tab threshold** — rejected. It would mean every agent gets a
  strip, including the 99.99% with one graph provider, which is the case the task explicitly says
  must not pay for one.
- **Strip at one or more providers** — rejected for the same reason. One provider plus ARP plus Agent
  is a control with no comparison behind it.
- **Default to the highest score** — rejected; see above.
- **Manual tab activation** (arrow moves focus, Enter selects) — considered because a provider panel
  mounts a vault read. Rejected: the reads are react-query-cached per claim and are the same reads a
  reader would trigger by visiting the tabs anyway, and automatic activation is the WAI-ARIA default
  a keyboard user will expect.
- **Keeping the alarm colour out of the strip and using full-foreground weight for `mismatch`** —
  rejected. Full foreground is already what `verified` uses, so the two strongest opposite verdicts
  would render identically in the one place a reader sees all providers at once.
- **Moving the identity rail into the `Agent` tab** — rejected after seeing the live page. Identity
  belongs to no provider; hiding it behind a tab would make it disappear whenever someone is reading
  one.

## Consequences

**Positive:**

- The comparison survives. From any tab a reader sees that one provider signs and rests on 26
  reviewers while another publishes no count at all, without either score being repeated.
- The default tab encodes the panel's argument in its navigation, not only in its typography.
- `?tab=` makes a provider's view linkable, which is the first time one claim on this page has had
  its own address.
- The common case — one provider — is unchanged, so 99.99% of the cohort does not pay for this
  feature at all.

**Negative:**

- Two render paths for the right column (stacked and tabbed) that have to stay in agreement. The
  shared pieces are components (`AssessmentRow`, `CapabilitySection`, `UnreadSources`); what is
  duplicated is the section headings and their levels.
- Tab slugs are derived from provider names, so a provider that renames itself changes the URL its
  old links pointed at. They fall back to the default tab rather than erroring, which is silent.
- A provider tab's panel repeats the provider's name in `AssessmentRow`'s own heading. Left as is:
  the heading also carries the provider's URL, and the panel needs a heading of its own.

**Neutral (worth knowing):**

- `AssessmentRow` is keyed on the row in the tabbed path. Without the key React reuses the instance
  across a tab switch and `StakeControl` keeps the quote it built for the previous provider's claim —
  a real-value confusion, not a cosmetic one.
- `StakeControl`'s heading now names the provider and spells out the claim, because a reader can land
  on a tab straight from a URL with no assessment block scrolled above it.
- The `index.css` focus repair from Task 08 is still in place: the emitted stylesheet contains no
  `outline: none` and the base rule covers both `button:focus-visible` and `[tabindex]:focus-visible`,
  which is what gives the tabpanel its ring.

## References

- Related task: `tasks/12-agent-panel-tabs.md`
- Related ADR: `.claude/choices/0018-trust-panel-design-and-join.md` (the alarm colour and the
  evidence scale this extends rather than reopens)
- Related ADR: `.claude/choices/0017-arp-stakes-real-trust-on-mainnet.md` (why the stake control must
  name what it is staking on)
- Related rule: `.claude/rules/ui.md`, `.claude/rules/code.md`
- Related files: `app/src/services/agent-trust.ts`, `app/src/components/agent/TrustPanelTabs.tsx`,
  `app/src/components/agent/tab-ids.ts`, `app/src/components/agent/UnreadSources.tsx`,
  `app/src/pages/AgentTrustPanel.tsx`
