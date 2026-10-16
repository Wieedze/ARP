# Task 15 — Strip the panel's copy down

> **Status: COMPLETE** 2026-10-16 · commits `7ccf585`..`99dafd8`, fixes `3689e19` ·
> post-mortem `.claude/learning/14-strip-the-panel-copy.md` · ADR `.claude/choices/0029-*.md`
> Specified 2026-09-17. Same branch and surface as Task 12.

## Objective

The agent panel and the directory explain themselves too much. Remove the explanatory prose, keep the
facts, and replace counted words with a mark.

This reverses several deliberate choices made earlier. They were made to be honest about what a number
rests on; the honesty stays, the paragraphs go. **Nothing in this task removes information a reader
needs to judge a claim — only the sentences telling them how to judge it.**

## Remove outright

In the directory (`/agents`):

- `All 28,648 that the Intuition graph mirrors carry a trust score. Providers sign their assessments
and declare how long they stay valid, and no consumer checks either. Open one and see what its
rating is actually resting on.`
- `Neither order is a quality ranking. How many statements the graph holds about the agent. The
mirrored shell gives every agent five, so anything above five is somebody having bothered. Ordering
by a provider's score is the one thing this panel argues against, so it is not offered.`
- The chain and token id from the row chrome.

In the panel (`/agent/:chainId/:tokenId`):

- The whole `Sources consulted` block — the three lines naming the Intuition graph, the ERC-8004
  registry on 8453, and each provider's resolver.
- `no signature block at assessment.signature`
- `Not checked — not an accusation.`
- `— the document publishes no reviewer count.`
- The curve id wherever it is displayed.
- The token id and chain in the stake confirmation.

In the tab strip:

- The third line under each provider (`no reviewer count`, `insufficient evidence`). **Keep the
  verdict line** — `NOT VERIFIED`, `NO ASSESSMENT` — that one carries a fact.

## Keep, and do not mistake for verbosity

- The left identity rail: `CAIP-19`, `REGISTRY`, `TOKEN ID`, `OWNER`, atom, registration file, URL.
  That is the agent's only verifiable address, not chrome.
- Every signature verdict and freshness verdict, exactly as the connector reports them.
- The dimensions table.
- The mainnet notice.

## Replace, do not delete

`1 position · 1 distinct staker` becomes a **person glyph and a number**. Inline SVG, sized to the
type, `aria-label` carrying the full phrase so a screen reader still gets `1 distinct staker`.

The count itself is not optional. These vaults hold one or two positions and a market figure shown
without its staker count misrepresents the market — that is why it was put there. The words go; the
number stays.

## Reorder

The **`Agent` tab comes first** and is the default, with its capabilities. Providers follow.

This replaces the current default — "the provider with the most evidence". Update the rule and the
test that pins it rather than leaving a stale expectation.

## Rewrite: the stake control

Currently:

> Take a position on AsterPay KYA
> A deposit into the vault on the claim this agent · has trust provider · AsterPay KYA, on Intuition
> mainnet. Real TRUST, not recoverable by this panel. Up to 1 TRUST per transaction.

The point to convey is one sentence: **backing this claim raises the market's confidence in this
provider's assessment of this agent.** Everything else is machinery the reader did not ask about.

One caution on wording, and it matters. A deposit does **not** change the provider's score — it
changes how much capital stands behind the claim that the score is worth believing. Copy saying
"raises this agent's trust score" would be false. Something of the order of _"Back this assessment —
your deposit is the market's confidence in it"_ is true and short. Use your judgement; keep it under
two lines; do not make it false to make it shorter.

The `1 TRUST` cap and the fact that it is real money must survive somewhere — the confirmation step is
the right place, since that is where it bites. Do not drop them entirely.

## Constraints

- `.claude/rules/ui.md` binds. No emoji — the person mark is an inline SVG, not a character.
- Verdicts render exactly as the connector reports them.
- Update or delete any test asserting removed copy. Do not keep copy alive to keep a test green.
- No browser here. Do not claim visual verification.

## Acceptance criteria

- [ ] Every string in "Remove outright" is gone
- [ ] Every item in "Keep" is still present
- [ ] Staker count renders as glyph + number with an accessible label
- [ ] `Agent` tab is first and default; the old default rule and its test are updated
- [ ] Stake copy is under two lines and does not claim a deposit changes a score
- [ ] `bun run test`, `bun run lint`, `bunx tsc -b` clean
- [ ] `ui-reviewer` pass, then `task-verifier` pass
