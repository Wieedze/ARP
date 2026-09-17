# 0029 — The page states facts and stops explaining them

**Status:** Accepted
**Date:** 2026-09-17
**Triggered by:** `tasks/15-strip-the-panel-copy.md` — the user read the running app and asked for the
prose to go. Three of the removals reverse decisions recorded in ADR 0018 and ADR 0028, and one
reverses the default they chose, so the reversal needs a record of its own.

## Context

The directory and the trust panel had accumulated a layer of copy whose job was to teach the reader
how to read the page: what a trust score rests on, why neither ordering is a ranking, why an
unverified signature is not an accusation, what a deposit is and is not. Every sentence was written
deliberately and every one was true.

Read on screen rather than in a diff, they were also the bulk of the text. The panel argued its case
twice — once in the design (type size carrying evidence, one alarm colour, the evidence rail) and
again in paragraphs restating what the design already showed.

The distinction that decides each removal: **a fact a reader needs to judge a claim stays; a sentence
telling them how to judge it goes.** `26 reviewers` is the first. "Enough reviewers to be worth
comparing" is borderline and survives as a caption. "Not checked — not an accusation" is the second
and does not.

## Decision

**The prose goes; the facts stay.** Removed outright: the directory's header paragraph and per-order
note, the row's token id and chain, the `Sources consulted` line and the loading state's list of
sources, the subtext under a `NOT VERIFIED` badge, the clause explaining an unknown weight, the tab
strip's evidence line, and the curve id in the stake confirmation. Kept, and not mistaken for
verbosity: the identity rail, every signature and freshness verdict exactly as the connector reports
it, the dimensions table, the mainnet notice.

**A staker count is a mark and a number.** `1 position · 1 distinct staker` becomes an inline person
glyph — hairline stroke, sized in `em`, `role="img"` with the full phrase as its `aria-label` — and
the figure. The count is not optional: these vaults hold one or two positions, and a market cap shown
without its staker count misrepresents the market, which is the whole reason the words were there.
Only the words go.

**The `Agent` tab comes first and is the default**, replacing ADR 0028's "the provider with the most
evidence behind it". The page is about the agent; what it is for comes before what a stranger says
about it. The old rule's test is rewritten against the same fixture rather than left passing.

**The stake control says one thing**: "Your deposit is the market's confidence in this provider's
assessment of this agent." A deposit does not change the provider's score — it changes how much
capital stands behind the claim that the score is worth believing — and no wording that blurs the two
is acceptable, however short. The ceiling, the irreversibility and the fact that this is real TRUST
on mainnet move to the confirmation step, where they bite.

## Alternatives considered

- **Paraphrasing the removed clauses to keep their content** — rejected, and it was the tempting one.
  Rewriting "the document publishes no reviewer count" as "no count in this document" keeps exactly
  what the user asked to remove while appearing to comply. The instruction was concision, not a
  quieter version of the same paragraph; where a removal costs something, the cost is reported rather
  than engineered away.
- **Keeping the evidence line in the tab strip** — rejected. It is ADR 0028's central device and the
  argument for it still holds, but the strip is one tab away from the evidence rail, which states the
  same thing at a size where it can be read as form.
- **Dropping the staker count with its words** — rejected outright. It is the one number on the
  market panel that stops a dust vault reading as a market.
- **`<span class="sr-only">` beside an `aria-hidden` glyph** instead of `role="img"` — equivalent for
  a screen reader and used elsewhere in this codebase, but the task asked for an `aria-label` and
  `role="img"` is what makes one legal on a `span`.
- **Keeping the old default tab and only reordering the strip** — rejected: a strip whose first tab
  is not the one a bare URL opens is two rules where there was one.

## Consequences

**Positive:**

- The panel argues in one register. Type size, the evidence rail and the alarm colour carry the
  claim; the text states facts.
- The stake control's sentence is the one thing a reader must understand before spending, and it is
  now the only thing above the form.
- Fewer places for the page to disagree with itself: `describeStakers`, `describePositionCount`,
  `describeChain`, `EVIDENCE_TONE_CLASS`, `defaultSlugFor` and two `TrustPanelView` fields had no
  readers left and are gone.

**Negative:**

- `Weight unknown.` no longer says whose omission that is. A reader can now read it as a limit of
  this panel rather than of the provider's document, which inverts the point. This is the one removal
  that costs a fact rather than a sentence, and it is recorded here rather than softened.
- The tab strip no longer shows what a provider's number rests on, so the comparison ADR 0028 was
  built to preserve is weaker: from any tab a reader sees who signed, not who has 26 reviewers and
  who has none.
- The directory row no longer distinguishes two agents that share a display name without opening one.
- An agent whose sources partly failed no longer says which sources were consulted anywhere on the
  page; `What could not be read` still names the ones that failed, which is the half that matters.

**Neutral (worth knowing):**

- `SignatureCopy.detail` is now `string | null`. The connector's `unverified` reason is a restatement
  of the label in the document's own field names, so the label carries the verdict alone; `verified`
  and `mismatch` keep their detail because it names addresses the label does not.
- One item in the task could not be located: "the token id and chain in the stake confirmation".
  There is no token id in the confirmation step, and the only chain it names is "Intuition mainnet"
  by name. The curve id was removed; the vault term id was kept, because a reader about to sign
  should be able to see which vault. The chain-id numerals in the wrong-network notice were also
  kept — that notice exists to say which chain a wallet is on.
- No browser was available for this task. Nothing here is visually verified.

## References

- Related task: `tasks/15-strip-the-panel-copy.md`
- Related ADR: `.claude/choices/0018-trust-panel-design-and-join.md` (the evidence scale and the
  staker-count rule this keeps, in a shorter form)
- Related ADR: `.claude/choices/0028-tab-strip-carries-the-comparison.md` (the default tab and the
  three-line tab, both reversed here)
- Related ADR: `.claude/choices/0017-arp-stakes-real-trust-on-mainnet.md` (safeguard 4, which is why
  the cap and the mainnet warning moved to the confirmation rather than disappearing)
- Related rule: `.claude/rules/ui.md`
- Related files: `app/src/components/agent/StakerCount.tsx`,
  `app/src/components/agent/TrustPanelTabs.tsx`, `app/src/components/agent/StakeControl.tsx`,
  `app/src/services/agent-trust.ts`, `app/src/services/trust-format.ts`,
  `app/src/pages/AgentDirectory.tsx`
