# 14 — Strip the panel's copy down

**Task:** `tasks/15-strip-the-panel-copy.md`
**Completed:** 2026-10-16
**Commit:** `3689e19` (fixes) on `feat/agent-panel-tabs`; implementation `7ccf585`..`99dafd8`
**Verifier verdict:** `ui-reviewer` PASS at `3689e19`. `task-verifier` second pass **pending** — its
first pass held on an open `ui-reviewer` gate that had in fact already returned PASS, because the two
reviews ran concurrently and the verifier could not see it. Its other two punch-list items (the ADR
bullet, the ladder sentence) are closed in `d8418b8`. **This line is updated when the verdict
arrives; do not read the task as verified until it says so.**

## What shipped

- `app/src/pages/AgentDirectory.tsx`, `components/agent/CohortList.tsx` — directory header
  paragraph, per-order notes, and the row's chain + token id removed.
- `app/src/pages/AgentTrustPanel.tsx`, `components/agent/{AgentIdentityPanel,VerdictLines,TrustPanelTabs}.tsx`
  — `Sources consulted`, `Not checked — not an accusation.`, the reviewer-count sentence, the curve
  id, and the strip's third line removed.
- `app/src/components/agent/StakerCount.tsx` (new) — a person mark and a number in place of the
  counted phrase.
- `app/src/services/agent-trust.ts` — `buildPanelTabs` prepends the agent tab and defaults to it;
  `defaultSlugFor` and `reviewerTotal` deleted.
- `app/src/components/agent/StakeControl.tsx` — one sentence over the control; the cap and the
  irreversibility moved to `ConfirmStep`, where they bite.
- `erc8004/src/signature.ts`, `index.ts` — `ABSENT_SIGNATURE_REASON` exported (see below).
- `.claude/choices/0029-*.md` — the editorial principle, and six recorded costs.

## Surprises

**The removal list and the Keep list collided on exactly one string, and I resolved the collision the
wrong way.** The task named `no signature block at assessment.signature` for removal and also said
"every signature verdict and freshness verdict, exactly as the connector reports them". I suppressed
`verdict.reason` for _all_ `unverified` verdicts on the theory that the reason restates the label in
the document's own field names. That theory is true for one of the nine reasons the connector emits.

The worst case was `could not reconstruct the signed payload: no strategy is confirmed for provider
…` — a statement about the connector's own limits on a document that **is** signed. It rendered
identically to a document with no signature block: two words, `NOT VERIFIED`. On a page whose
argument is that providers sign and nobody checks, that is the one conflation that destroys the
argument, and it reads as though the panel checked and failed when it never could.

**Nothing caught it because the fixture set held only the absent-signature case.** Three tests
covered `unverified` and all three passed a fixture carrying the one reason that _should_ be dropped.
This is the same failure mode as the `$curveId` bug earlier in this project: tests that prove the
code does what I assumed, over a fixture built from the same assumption. The lesson is not "add more
tests" — it is that a fixture set covering one member of a nine-member union is not coverage of the
union, and a `status` discriminant with a free-form `reason` beside it is exactly where that hides.

**A dictated removal can take a calibration constant with it.** The per-order note said "the mirrored
shell gives every agent five, so anything above five is somebody having bothered." The `Statements`
column survives as a bare integer and nothing on the page now says five is free, so `5` and `7` are
indistinguishable in meaning. Recorded in the ADR rather than reversed. Worth generalising: when
stripping explanatory copy, check whether a sentence was carrying a _scale_ and not an explanation.

## Decisions made

- **Export the constant rather than widen the type or match a literal.** The reviewer offered a
  `code` discriminant on `SignatureVerdict` (non-brittle but a public-type change wider than a copy
  decision warrants) or a local string comparison (exactly spec-compliant but brittle). A third
  route gets both: `erc8004` exports `ABSENT_SIGNATURE_REASON` and uses it at its own call site, so
  emitter and suppressor cannot diverge and the string exists once. ADR: `.claude/choices/0029-*.md`,
  Neutral section.
- **Correct the ADR in place, quoting what it had claimed.** `.claude/choices/` is append-only in
  spirit; silently replacing the false claim would have erased why the bug was plausible.
- **`stakerLabel` and `formatStakerCount` as pure exports.** The deleted `describeStakers` suite took
  the singular/plural/zero coverage with it, and `app/` has no DOM environment (ADR 0011). Exporting
  the label restores it without a new test dependency — and caught a real drift: the visible figure
  was grouped (`1,445`) while the accessible name was not (`1445`), which matters because
  `role="img"` makes the label the only announced copy.
- **Record `strict` rather than fix it.** See "Rules touched".

## Rules touched

- `.claude/rules/workflow.md` — **sufficient, and load-bearing.** Its scope discipline is what kept
  the `strict` flag out of a UI copy commit. Both reviewers independently reached the same answer:
  zero measured cost is what makes the drift signal fire, not what exempts it. Recorded as
  `tasks/18-strict-is-off-in-the-app.md`.
- `.claude/rules/code.md` — **violated repo-wide, not by this task.** `app/tsconfig.app.json` has
  never set `strict: true`, which `code.md` calls non-negotiable. Measured: enabling it costs **zero
  errors**, so the app code is already compliant and only the declaration was missing. Consequence
  worth stating plainly: every `tsc -b` pass cited in a completion report since task 01 was weaker
  evidence than the rule it was cited against. The measurement decays with every commit written under
  the looser flag, so task 18 is worth doing before tasks 16 and 17.
- `.claude/rules/ui.md` — sufficient. The anti-template scan was clean on first pass.
- `CLAUDE.md` — **wrong citation, fixed.** The mandatory evidence-ladder check cited
  `docs/09_POSITIONING_AND_PLAN.md` §2; the ladder is §3 (§2 is "Why this document exists now").
  A wrong pointer in the section that gates every task, so corrected in place. No rule content
  changed, hence no ADR.

## Suggestions for future tasks

- **Run `ui-reviewer` and `task-verifier` in sequence, not in parallel.** Running them concurrently
  cost a whole verifier pass: the verifier's only blocking finding was an unmet `ui-reviewer` gate
  that had already been satisfied. The verifier gate depends on the reviewer verdict by construction.
- When a task's removal list and Keep list both touch one field, say in the task file which wins.
  This one was resolvable, but only after a reviewer read nine call sites.
- The glyph treatment did not propagate: `MarketPanel` shows the person mark while the directory
  still spells `1 position · 2 curves`. In spec — the task scoped the replacement to the panel — but
  the two surfaces now express the same class of fact in two registers. Follow-up candidate.
- `UNVERIFIED_UNRECONSTRUCTABLE` now carries populated `attempts`, because the connector never emits
  an empty array for that reason. Nothing reads `attempts` yet; a task that renders which
  reconstructions were tried should start from that fixture rather than build a new one.

## Which tier of the evidence ladder does this serve?

**Tier 3 (staked), and it does not move ARP up a tier — it protects the tier ARP already occupies.**
The strip removed the copy that _argued_ the ladder ("providers sign … and no consumer checks
either"); what survives is the verdict machinery that _demonstrates_ it, which is the stronger form
of the same claim. The fix matters for exactly this reason: a panel that cannot distinguish "signed,
unverifiable by us" from "never signed" has lost the demonstration and kept only the assertion, which
is tier 1. And the one sentence above the stake control is the only thing a depositor must understand
before putting real TRUST behind a provider's opinion — the cap and the irreversibility now land at
the step where they bite.
