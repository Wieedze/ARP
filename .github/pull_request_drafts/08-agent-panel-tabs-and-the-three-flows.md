# feat(ui): tabs, stripped copy, and the plan for rating agents that never heard of ARP

**Branch** `feat/agent-panel-tabs` → `main` · 23 commits · 38 files · Tasks 12 and 15, plus the specs for 16–18.

Review order: the UI change, then the plan docs. They are independent.

---

## What ships

**Task 12 — tabs on the agent panel.** One tab per trust provider instead of stacked sections, so two
providers' opinions of the same agent sit at the same place on screen and can be compared by
switching rather than by scrolling. ADR `0028`.

**Task 15 — the copy stripped back.** Every explanatory paragraph removed from the panel and the
directory; the facts kept. The counted phrase "N stakers" became a person mark and a number
(`StakerCount.tsx`). The Agent tab comes first and is the default. One sentence over the stake
control, with the cap and the irreversibility moved to the confirmation step where they bite.
ADR `0029`.

**Docs 13 and tasks 16–18** — the plan for flows A, B and C. See below.

## The bug the review caught, which is the most important thing in this PR

The task's removal list named one string — `no signature block at assessment.signature` — and the
implementation suppressed `verdict.reason` for **every** `unverified` signature verdict. The connector
emits nine. The worst collapse:

```
could not reconstruct the signed payload: no strategy is confirmed for provider "asterpay"
```

That is a statement about **the connector's own limits** on a document that _is_ signed. It rendered
identically to a document with no signature block at all: two words, `NOT VERIFIED`.

On a page whose entire argument is that providers sign and nobody checks, conflating "they signed and
we cannot check it" with "they never signed" destroys the argument — and it reads as though the panel
checked and failed when it never could. It also contradicted the task's own Keep list: _every
signature verdict exactly as the connector reports them_.

It was a **tier regression**, not a copy bug: the panel fell back from demonstrating the evidence
ladder to asserting it.

**Why nothing caught it.** Three tests covered `unverified` and all three used a fixture carrying the
one reason that _should_ be dropped. A fixture set covering one member of a nine-member union is not
coverage of the union, and a `status` discriminant with a free-form `reason` beside it is exactly
where that hides. Same failure mode as the `$curveId` bug earlier in this project: tests that prove
the code does what I assumed, over a fixture built from the same assumption.

**Fix.** `erc8004` exports `ABSENT_SIGNATURE_REASON` and uses it at its own call site;
`describeSignature` suppresses only that reason. One copy of the string, no brittle literal
comparison, and the public `SignatureVerdict` type is unchanged — a new discriminant field would have
been wider than a copy decision warrants. Verified to survive the build as a literal type
(`dist/signature.d.ts:85`), so emitter and consumer cannot diverge.

## What the strip cost, recorded rather than engineered away

ADR `0029` carries six Negative bullets. Two are outright fact losses:

- **`Weight unknown.`** no longer says whose omission that is, so a reader can read it as a limit of
  the panel rather than of the provider's document — which inverts the point.
- **The `Statements` column lost the floor of its own scale.** The removed note read "the mirrored
  shell gives every agent five, so anything above five is somebody having bothered." The column is now
  a bare integer and nothing on the page says five is free, so `5` and `7` are indistinguishable in
  meaning. Not a sentence explaining how to judge — the constant a reader needs in order to judge at
  all.

Also recorded: `no market data` now covers both "no source can price this claim" and "nobody has
staked", and the service-level assertion that pinned the distinction was deleted with the paragraph.
Restoring it properly means two distinct empty states, which is design work, not a copy edit.

All of these removals were dictated by name. They are reported, not reversed.

## Docs 13 and the task specs — measured, and one claim corrected

`docs/13_THE_THREE_FLOWS.md` sets out three ways an agent gets rated and the order to build them:
the external **verifier** (needs nobody's consent), **hire** (the hired agent signs nothing), and the
**MCP server** (last, because it is the only one that depends on adoption).

`docs/13` was written before the cohort was measured, and measuring corrected it. `scripts/measure-cohort-endpoints.ts`
is committed so the numbers are reproducible. **n = 140 uniformly random Base token ids, 2026-10-16:**

- **`services[]` is the common spelling, not `endpoints[]`** — 106 occurrences to 2. The first
  sampler read only `endpoints` and reported _zero declared endpoints cohort-wide_; that was a key
  name, not a fact about the ecosystem. A verifier making the same mistake sees almost nothing.
- **Only 16 of 90 declared endpoints are probeable at all.** 76% carry an unsubstituted
  `{placeholder}`, 7% are a CAIP address or ENS name. **None of that is a defect** — and `docs/13`
  had framed capability conformance as the main signal when 82% of endpoints cannot be checked.
- **The volume is in the document layer**: 23% of ids have no `tokenURI`, and of those that do, 37%
  publish a registration file that does not resolve. One GET establishes it.

So the verifier classifies into **three groups, not pass/fail**: confirmed, not checkable, and
inconclusive-we-may-be-at-fault. With 82% in group 2, conflating it with group 1 would mass-slander
the cohort on the first run. The connector's rule carries over unchanged: when unsure, say
unverified, never accuse.

Where a protocol is declared the check is sharp: of 4 endpoints named `mcp`, 2 answer `initialize`
and 2 do not. Probe results stay **off-graph** — `docs/07` names mutable data as triples an
anti-pattern, and ADR `0020` priced blanket on-chain coverage at ~14,300 TRUST.

## A rule violation found out of scope, and not fixed here

`app/tsconfig.app.json` has **never** set `"strict": true`, which `.claude/rules/code.md` calls
non-negotiable. `erc8004/tsconfig.json` does, so the two workspaces have been typechecked under
different rules the whole time.

Measured: **enabling it costs zero errors.** The app code is already compliant; only the declaration
was missing. The consequence is worth stating plainly — **every `tsc -b` pass cited in a completion
report since task 01 was weaker evidence than the rule it was cited against.**

Recorded as `tasks/18`, not slipped into a UI copy commit. Both reviewers independently reached the
same answer: zero measured cost is what makes `workflow.md`'s drift signal fire, not what exempts it,
and "it was one line" is how build-level changes end up unreviewed. **Worth doing before tasks 16 and
17** — the measurement decays with every commit written under the looser flag.

## Verification

|           |                                                                     |
| --------- | ------------------------------------------------------------------- |
| `app`     | `tsc -b` 0 · `lint` 0 · **202 passed / 2 skipped** (was 199)        |
| `erc8004` | build 0 · **173 passed / 4 skipped**                                |
| Reviews   | `ui-reviewer` PASS at `3689e19` · `task-verifier` PASS at `d8418b8` |

Contrast computed independently at **7.038:1** for the staker glyph, against the 3:1 WCAG 1.4.11 asks.

## Gaps, stated plainly

- **Nothing was visually verified.** There is no browser in the build environment. Open
  `/agent/8453/2340` and `/agents` before showing anyone.
- `app/` has no DOM test environment (ADR `0011`), so `StakerCount`'s rendering rests on code review.
  The accessible name is pinned at the service level instead: `stakerLabel` is a tested pure function,
  which also caught a real drift — the visible figure was grouped (`1,445`) while the announced name
  was not (`1445`), and `role="img"` makes the label the only announced copy.
- The glyph treatment did not propagate: the panel shows the person mark while the directory still
  spells `1 position · 2 curves`. In spec, but the two surfaces now express one class of fact in two
  registers.

## Two things not from these tasks, explained rather than hidden

- **`502a010`** recovers ADR `0027` (mint into the canonical registry) plus a population correction in
  `docs/12`. It rides this branch because it never reached `main` through the earlier stacked PRs. It
  is unrelated to tasks 12 and 15.
- **`CLAUDE.md`** cited the evidence ladder as `docs/09` §2; it is §3 (§2 is "Why this document exists
  now"). Fixed in place — a wrong pointer in the section that gates every task misroutes every reader
  of it. No rule content changed, so no ADR.

## Which tier of the evidence ladder does this serve?

**Tier 3 (staked).** It does not move ARP up a tier; it protects the one ARP occupies. The strip
removed the copy that _argued_ the ladder and kept the machinery that _demonstrates_ it, which is the
stronger form of the same claim — and the signature fix is what keeps the demonstration intact. The
one sentence above the stake control is the only thing a depositor must understand before putting real
TRUST behind a provider's opinion.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
