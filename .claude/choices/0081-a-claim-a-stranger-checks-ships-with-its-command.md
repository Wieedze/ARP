# 0081 — A claim a stranger is asked to check ships with the command that checks it

**Status:** Accepted
**Date:** 2026-10-30
**Triggered by:** the user's decision, asked as a yes/no after
`.claude/learning/20-arp-serves-the-content-and-signs-the-access.md` proposed it — _« oui ça a l'air
d'être un très bon garde-fou »_

## Context

`.claude/rules/claims.md` had five checks. All five catch a claim that is **wrong**: a consequence
stated without measuring what bounds it, numbers summed across contexts, a third party quoted for
something they did not say, a green gate whose scope did not cover the change, and a retraction that
landed in one place out of several.

`tasks/31` produced a failure none of the five names. `docs/22_RUNNING_THE_NODE.md` is written for
somebody deciding whether to install the node — a stranger, by construction, and the document's
entire purpose is that they do not have to trust us. Its outbound-connection section failed **three
review rounds running**, for the same reason each time:

| round | the claim                                            | what was wrong                                               |
| ----- | ---------------------------------------------------- | ------------------------------------------------------------ |
| 2     | "four fixed hosts … the only literals in the code"   | five hosts, and a second caller-steerable fetch              |
| 3     | "six URL literals", with the `grep` to run           | **true** — and the `grep` returned 116 lines across 31 hosts |
| 4     | the section cites `scripts/measure/node-outbound.ts` | held                                                         |

Round 3 is the one that forced this ADR. The claim was **accurate**: exactly six host literals in
the three node scripts. The command shipped beside it swept `scripts/`, which holds measurement
scripts and demos no running node loads, so a reader following the instruction got a number nineteen
times larger than the one they were told. A reader in that position does not conclude that our scope
was narrower than our command. They conclude the document is wrong.

Two further facts decided the shape of the rule rather than merely motivating it.

**Prose discipline was already being applied and did not work.** Four rounds, by an author trying
hard, with `claims.md` loaded. The class reproduced anyway — twice _inside a fix for the same
class_: a "fourth limit below" written above a list that said three, and one falsifiable security
claim replaced by a second falsifiable security claim.

**The contrast across those rounds is unusually clean.** Every figure re-derived from a committed
measurement was exact on the first try, in both verification rounds — 475/48/46/139, 19/8/95, the
test counts, 6 literals and 6 outbound. Every hand-maintained figure was wrong in both — four hosts,
six literals, three drift signals, two additions, three limits, 25 tests, "0 of 601", "in progress".
The variable was not care. It was whether a number had a script behind it.

## Decision

**`claims.md` gains a sixth check:**

> A claim offered to a stranger as checkable ships with the command that checks it, and the
> command's scope is verified against the claim's scope before the claim is written down.

Plus a third habit beside the two that were there: **run the command before you write it down** —
the command, not the claim. Paste it, run it, read what comes back, and only then write the sentence
that cites it. Check 6 exists because that was not done: the `grep` was composed from what it ought
to match rather than from what it did.

**The scope clause is the operative half.** Check 4 already asks whether a gate's scope covers the
change; this asks the mirror question about a check offered outward, and round 3 shows they fail
independently — the claim was right and the check was wrong.

Three counts in `claims.md` moved with the addition ("five failures" → six, "Two habits" → three,
"four of the five checks" → four of six), and `00-INDEX.md`'s one-line summary gained the clause.
That sweep is check 5 applied to the file that defines it.

## Alternatives considered

- **Leave it to care.** Rejected by measurement, not by argument: four rounds of care were applied
  and the class reproduced, including inside its own fixes. A rule whose only mechanism is
  attention has no mechanism.
- **Require a script for every figure.** Too wide. `claims.md` already recommends committing the
  script as a _habit_, and most figures in a commit message or a post-mortem are read by people who
  can open the code beside them. Making it a requirement everywhere would make the rule expensive
  enough to be routed around, which is the failure mode its own docstring warns about for
  `check-contrast.ts` — "a check that teaches people to silence it".
- **Forbid offering a command at all**, and let a reader derive their own. Rejected: it removes the
  only thing that made round 4 hold, and it moves the work onto the person with least context.
- **A pre-commit hook that runs every command quoted in a document.** Attractive and not buildable
  as stated — a quoted command may be slow, may need a token, may be destructive. The check being
  human and cheap is what makes it survivable.

## Consequences

**Positive:**

- The one class of claim where this repo's own argument says assertions are worth least — something
  a stranger is asked to take on trust — now has to carry its own verification.
- It converts a maintenance burden into an artefact. `scripts/measure/node-outbound.ts` keeps
  working as the node changes; the sentence it replaced decayed at the rate the file around it
  changed.
- Writing such a script finds defects immediately. `node-outbound.ts` found two of its own before it
  found anything else: it listed the node's inbound HTTP handler as an outbound connection, and
  missed the probe's real fetch because that goes through `doFetch`.

**Negative:**

- It costs real time in the one case where no script exists and one has to be written. The rule is
  deliberately narrow for that reason, and names the class rather than applying everywhere.
- A committed script is a thing that can itself be wrong, and wrong with more authority. The
  mitigation is in the rule's own text rather than assumed: the command's scope is checked against
  the claim's, and `node-outbound.ts`'s header states what it does **not** enumerate — a viem
  `http()` transport is an outbound connection with no host literal and no `fetch` call, so its
  title was narrowed to what it measures.
- A sixth check lengthens a rule file that is already long, and `CLAUDE.md` warns against loading
  rules indiscriminately. Mitigated by the counts above being correct, which is what makes the file
  skimmable.

**Neutral (worth knowing):**

- It does not change what may be claimed, only what a claim has to arrive with. Nothing already
  written becomes false.
- The audit it is most likely to trigger first is `docs/`: any document that offers a reader a
  command to check a figure now owes that command's scope a look.

## References

- Triggered by: `.claude/learning/20-arp-serves-the-content-and-signs-the-access.md`, which proposed
  it and carries the round-by-round record
- Rule changed: `.claude/rules/claims.md` (check 6, third habit, three counts), `.claude/rules/00-INDEX.md`
- The worked example: `docs/22_RUNNING_THE_NODE.md`, `scripts/measure/node-outbound.ts`,
  `measurements/node-outbound-2026-10-29.json`
- Related ADR: `0031` (claims.md's origin — the five failures), `0043` (check 5, the retraction
  sweep), `0064` (one measurement file per run), `0080` (the node signs for what it served)
