# Claims

Load at the **end** of every task, with `workflow.md`, before writing the completion report. Also
load it before answering a question with a number in it.

This rule exists because of a measured failure pattern, not a hypothetical one. On 2026-10-16 six
statements in one session were wrong while every underlying measurement was right — two independent
reviewers re-derived the numbers and got the same values. The break was never in the measurement. It
was always in the step from the measurement to the sentence. See ADR 0031.

## The six failures, and the check that stops each

### 1. A consequence stated without measuring what bounds it

> Claimed: "185 mainnet edges are mislabelled as protocols today."
> True: **zero**. The code path could not reach a single one of them.

**Check:** before saying a defect affects N things, measure how many of those N the code can actually
reach. A wrong branch nothing reaches is **latent**, not live. Say which.

Reachability is usually one query. `scripts/measure/predicate-reachability.ts` is the one that
settled this case: `getCapabilities` only runs on a subject resolved through `same as`, and no `uses`
subject had one.

**A defect fixed before it could fire is good news.** Reporting it as a live incident is worse than
reporting it accurately, because the next reader inherits the inflated number.

### 2. Numbers from different contexts summed into one figure

> Claimed: "a vocabulary slot with 328 genuine edges."
> True: 185 mainnet + 143 testnet — one atom's edges summed across two chains — presented one
> paragraph from a fragmentation claim describing a different, larger set.

**Check:** one number, one context. Name the chain, the date, and the population. Never add across
chains, networks or time windows to make a figure larger. If two numbers are doing one job, the job
needs two numbers.

And **never attach an adjective the data contradicts**. "Genuine tool-usage edges" was false of a set
that contained `love`, `developed` and three book titles — stated in the same document, two bullets
down.

### 3. A claim attributed to a source that did not say it

> Claimed: "Intuition publicly invited a connector proposal."
> True: nothing in the repo supports it. What exists is `docs/07` Appendix B's "ask the Business
> Development team to extend the canon" — a documented route, not an invitation.

**Check:** every claim about what a third party said, wants or permits carries a citation to a file
and a line, or it does not get written. This is the failure that propagates furthest, because it is
the kind of sentence that gets quoted back as settled.

### 4. "The checks pass" without verifying the checks cover the change

> Claimed: "tsc 0, lint 0, tests pass."
> True for the repo, **false for the two files the commit existed to fix**. `apps/web/tsconfig.app.json`
> includes only `src`, so `scripts/` is outside `tsc -b` and its `noUnusedLocals`; there is no eslint
> config at the repo root, so `eslint .` from `app/` never sees `scripts/`; `bun build` strips types
> without checking unused locals. A dead variable survived all three.

**Check:** before citing a green check, confirm its scope includes the files you changed. `tsc -b`
over `apps/web/src` says nothing about `scripts/`. A passing suite over mocked transport says the variable
was passed, not that the query was valid — that one cost a live mainnet outage earlier in the same
project.

Name the gate's scope when it does not cover everything: "tsc clean over `apps/web/src`; `scripts/` is
outside every gate."

### 5. A correction that landed in one place

> Corrected: `TrustStakeCapEnforcer` bounds the deposit only → it caps native `value`. Fixed in the
> code; **stale in the ADR the code points at.**
> Corrected: the deferral "changes the connector's read contract" → it does not. Fixed in the task
> file; **stale in the ADR and in the code comment, which both pointed at it.**
> Changed: six defects → eight. Fixed in the table and in `STATE.md`; **stale in the same file's
> title, prose and Gate** — where the Gate then demanded six reproductions from a table of eight.

**Check: before you commit a retraction or a changed count, grep for the old wording.**

```
grep -rn "trust panel shares" --include=*.md --include=*.ts .
grep -rn "six defects" --include=*.md .
```

Each of those takes seconds and each would have caught one of the three above. The failure is not
finding the right answer — all three were found. It is that a sentence written twice gets corrected
once, and the copy that survives is usually the one other files point at.

Two things make it worse. An **append-only** record cannot be rewritten, so a retraction there is
struck through in place and the grep is the only way to find it. And a **count** has more copies
than it looks like — a title, a gate, a status line and a table row are four sites for one number.

Added 2026-10-19 after the third instance in two review rounds. ADR `0043`.

**One grep is not the sweep.** 2026-10-27, correcting an undated "82% of declared endpoints": the
first grep found two sites, a careful second pass found four more, a reviewer found six after that
— **fifteen in all, nine needing the fix**. They differed only in wording (`82% of real endpoints`,
`82% of declared`, `Those 82%`, a mermaid edge label, and one **string written into generated data**
that ships to a third party). Grep the **number**, not the sentence, and read every hit rather than
the ones that look like the one you remember writing.

And twice that day the _correction_ introduced the defect: "89 of 89" lost the denominator the
script prints, and a dated re-measurement was presented as a time series an append-only graph
forbids. **Re-check a retraction the way you would check the claim** — a sentence written to fix a
claims error is not exempt from this rule.

### 6. A claim offered to a stranger as checkable, with no way for them to check it

> Claimed, in the document written for people deciding whether to install the node: "the node's own
> modules carry **six URL literals** and none of them is ours", with the `grep` to run.
> True — and the `grep` returned **116 lines across 31 hosts**, because its scope was a directory
> and the claim's scope was three files.

**Check: a claim offered to a stranger as checkable ships with the command that checks it, and the
command's scope is verified against the claim's scope before the claim is written down.**

The five checks above all catch a claim that is **wrong**. This one catches a claim that is **right
and unverifiable by the reader it was written for** — a different failure, and the worse one in a
document whose whole purpose is that somebody does not have to trust us.

The scope clause is the load-bearing half. The claim above was accurate about the three node
scripts. What failed was that the command swept `scripts/`, which holds measurement scripts and
demos no node ever loads, and the number a reader got back was nineteen times the number they were
told. A reader who runs your check and gets a different answer does not conclude that your scope was
wrong. They conclude the document is wrong, and they are not being unreasonable.

Added 2026-10-30, on the user's decision, after the same section of `docs/22` failed **three review
rounds running** for this one reason — a security claim offered with a check whose scope did not
match it. ADR `0081`, post-mortem `.claude/learning/20-*`. The sentence that closed it was not a
better sentence: it was `scripts/measure/node-outbound.ts`, whose output the document now quotes.

**And the evidence that this is the right lever rather than more care.** Across those rounds, every
figure re-derived from a committed measurement was exact on the first try — both times. Every
hand-maintained figure was wrong — both times. Four rounds of care were applied by an author trying
hard. The variable was never the care. It was whether a number had a script behind it.

## Three habits, and the first two prevent failures 1 to 4

**Commit the script, not the number.** Every figure in a doc, ADR, task file or report that came from
a measurement names the script that produces it. `scripts/measure-*.ts` exist for this. A number
nobody can re-run is an assertion, and this repo's whole argument is that assertions are the bottom
rung of the ladder.

**Quote the interval, not the point, when n is small.** `3/122` is "between 1% and 7%", not "2.5%".
Over 88,243 agents that is 741 to 6,160 — a range too wide to position on, which is itself the useful
finding. Wilson, not normal approximation, at these counts.

**Run the command before you write it down.** Not the claim — the **command**. Paste it, run it,
read what comes back, and only then write the sentence that cites it. Check 6 exists because this
was not done: the `grep` was composed from what it ought to match rather than from what it did.

## Scope of this rule

It governs what is written in: completion reports, commit messages, ADRs, task files, post-mortems,
`docs/`, PR descriptions, and answers to the user. Code comments too — a comment asserting a number
is subject to the same rule, and `code.md` already forbids comments that misdescribe state.

It does not slow ordinary work. Four of the six checks are a single query or a single `grep`, and a
fifth is running a command you were about to write down anyway. Only check 6's other half — writing
a script where none exists — costs real time, and it is required of one narrow class: a claim a
stranger is being asked to verify.

The cost of skipping any of them is paid by whoever reads the claim next and believes it.
