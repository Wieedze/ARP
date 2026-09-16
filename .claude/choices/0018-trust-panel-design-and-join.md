# 0018 — The trust panel: one alarm colour, an evidence-weighted score, and a two-edge join

**Status:** Accepted
**Date:** 2026-09-16
**Triggered by:** `tasks/08-agent-trust-panel.md` — three decisions made during the build that the
task did not pre-specify and that a later reader would otherwise have to reverse-engineer.

## Context

Task 08 builds `/agent/:chainId/:tokenId` on top of the `@arp-protocol/erc8004` connector. Three
questions came up that neither the task, `.claude/rules/ui.md` nor `docs/05_UI_DESIGN.md` settles.

**1. `mismatch` needs a colour the design system does not have.** `docs/05` §3 is explicit —
monochrome plus *one* accent, and the accent (cyan) is already spent on primary actions and the
selected state. The task says a signature `mismatch` "must be impossible to miss". A `mismatch` is
the strongest negative claim this panel can make about anyone: a provider's document that does not
recover to the signer the document itself names. Rendering that in the same cyan as "verified" would
be indefensible; rendering it in grey would bury it.

**2. The panel's editorial claim needs a mechanism.** "A score's weight is not its number" is the
thing the task asks the design to carry, and `ui.md` leaves typography and information design open.
The live spread is real and wide: Deep3 scores Captain Dackie 64.36 on 1,445 reviewers, Clawnch 55.35
on 26, and agent 6649 59.95 on 2 — while AsterPay publishes a rule-based score with no reviewer count
at all, which is not the same as zero.

**3. The graph writes two edges per provider and the panel shows one row.** Intuition carries
`has trust provider` (object = the provider; this is the triple whose vault is the market) and
`has trust assessment` (object = the assessment atom, whose `url` is the live document). The
connector returns both as `ProviderAssessment` entries and does not join them, correctly — joining is
a presentation decision with a confidence question inside it.

That question bites in a specific place. The `has trust provider` edge's object atom carries the
provider's *homepage*, so the connector dutifully fetches `https://deep3.ai` and `https://asterpay.io`
and gets HTTP 500 and an HTML page respectively. Both are true reads and neither is a document
failure. Meanwhile the only thing tying an assessment edge to a provider edge when the document is
unreachable is the assessment atom's label, `"AsterPay KYA — Captain Dackie trust assessment"`.

## Decision

**One semantic alarm colour, scoped to `mismatch`.** `--color-alarm: #ff5f52` (6.6:1 on the
background, AA as body text) is added to the token set and may be used by exactly two things: the
`mismatch` badge and the left rule on the row carrying it. Nothing decorative may use it, and no
other verdict may. "Real TRUST at stake" — the other thing that must be impossible to miss — uses an
**inverted monochrome bar** (solid foreground, background-coloured type) rather than a second hue, so
the two alarms stay distinguishable and the palette stays one accent plus one exception.

**Type size carries evidence, not score.** A reviewer count maps to one of seven weights
(`unknown`, `none`, `single`, `thin`, `moderate`, `substantial`, `deep`) on log-ish bands, and the
weight selects the score's size (22–72px, `--text-score-1` … `--text-score-5`), its colour and its
numeric weight. Underneath sits an **evidence rail**: one hairline tick per reviewer, saturating at
48, with the exact count always stated in the caption below it. Two reviewers is two marks in a lot
of empty space; 1,445 is a solid rail. The rail is `aria-hidden` and the caption is the accessible
text. A document that publishes no reviewer count reads `unknown` and says so — never `0`.

**The panel joins on the document, falls back to the label, and reports which.** One row per
`has trust provider` edge. Its assessment edge is matched first by the **document's own**
`provider.name` (`providerMatch: "document"`), and only if the document is unreachable by the
assessment atom's **label prefix** (`"label-prefix"`), which the row then states on screen as "a
naming convention, not a proof". An assessment edge that matches nothing gets its own row with no
vault to stake on; a provider edge with no assessment gets a row with a live market and no document.
The provider edge's own fetch result is **never** surfaced as the document's failure.

## Alternatives considered

- **Reuse cyan for `mismatch`** — rejected. The one colour that means "this checks out" cannot also
  mean "this does not".
- **Invert the palette for `mismatch` too** — rejected. It is the device already carrying "real money
  on mainnet", and two different alarms that look identical is worse than one new hue.
- **Add a display serif for the score** (`docs/05` names Fraunces) — rejected. The app has committed
  to Inter + JetBrains Mono, the task says a panel that does not match `/hire` and `/tool/:id` is
  worse than one that is merely restrained, and a score is data, so mono with tabular figures is the
  correct face anyway. The characterful budget went into the rail and the size scale instead.
- **Scale the score by the score** (a 90 set larger than a 40) — rejected, and it is the exact
  inversion of the argument: it would make a costless number look authoritative.
- **A bar or a percentage for reviewer count** — rejected. A bar needs a maximum, and there is no
  honest maximum for "how many reviewers is enough". One tick per reviewer needs no denominator.
- **Join on the graph's provider atom `term_id`** — not available: the assessment edge's object is
  the assessment atom, which carries no pointer back to the provider atom. There is nothing to join
  on except the document or the label.
- **Drop rows whose document is unreachable** — rejected outright. A provider whose document cannot
  be fetched is itself the finding.
- **Show the connector's `MarketSide.totalAssets`** — rejected after checking it against the chain.
  That field is the *term* total, which folds in the triple's underlying atom vaults and runs ~1,000×
  the vault balance (0.988 TRUST against 0.0009875 for Clawnch's AsterPay claim). The panel shows
  `getVault` from the MultiVault, with `marketCap` — the curve's own vault — as the indexer fallback.

## Consequences

**Positive:**

- The design carries the argument instead of captioning it. Two scores four points apart, on 2 and
  26 reviewers, are unmistakably different objects on screen before a digit has been read.
- `mismatch` is unmissable and cannot be diluted, because exactly one thing in the codebase is
  allowed to use its colour.
- Every provider row renders under every failure mode observed live — unsigned document, stale
  document, 500 from the provider's homepage, missing assessment edge, missing provider edge.

**Negative:**

- The token set grows by one colour and five type sizes, past the "3 body sizes + 1 display" limit in
  `docs/05` §1. The sizes are scoped to the assessment rows and exist to encode one variable;
  spending them anywhere else would be a regression.
- `label-prefix` matching is a heuristic on a naming convention nobody has standardised. It is
  labelled on screen and in the type (`ProviderMatch`), but a provider who renames their assessment
  atoms silently loses the join and gets an orphan row.
- The rail saturates at 48 ticks, so 200 reviewers and 1,445 look identical in the rail. The size
  scale still separates them and the caption carries the exact figure.

**Neutral (worth knowing):**

- Reviewer count is read from `method.numReviewers` in the **raw** document, not from the connector's
  narrowed `AssessmentDocument`. That is deliberate on both sides: the field is Deep3-specific, the
  connector narrows only what ERC-8004 assessments share, and `raw` is exposed for exactly this.
- Weight bands were chosen against the live cohort: 2 → `thin`, 26 → `moderate`, 1,445 → `deep`.
- The alarm colour has no live instance today. The connector reaches `mismatch` only for a provider
  whose signing scheme has been confirmed (ADR 0019), and no such document is currently tampered.

## References

- Related task: `tasks/08-agent-trust-panel.md`
- Related ADR: `.claude/choices/0017-arp-stakes-real-trust-on-mainnet.md` (the mainnet authorisation
  and the seven safeguards this panel implements)
- Related ADR: `.claude/choices/0019-erc8004-connector-surface-deviations.md` (why `mismatch` is
  scoped per provider, which is why the alarm colour is rare by construction)
- Related rule: `.claude/rules/ui.md`, `.claude/rules/code.md`
- Related doc: `docs/05_UI_DESIGN.md` §1 and §3 (the limits this ADR extends), `docs/09_POSITIONING_AND_PLAN.md` §3
- Related files: `app/src/index.css`, `app/src/components/agent/evidence-scale.ts`,
  `app/src/services/agent-trust.ts`
