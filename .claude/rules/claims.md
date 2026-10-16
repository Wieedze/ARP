# Claims

Load at the **end** of every task, with `workflow.md`, before writing the completion report. Also
load it before answering a question with a number in it.

This rule exists because of a measured failure pattern, not a hypothetical one. On 2026-10-16 six
statements in one session were wrong while every underlying measurement was right — two independent
reviewers re-derived the numbers and got the same values. The break was never in the measurement. It
was always in the step from the measurement to the sentence. See ADR 0031.

## The four failures, and the check that stops each

### 1. A consequence stated without measuring what bounds it

> Claimed: "185 mainnet edges are mislabelled as protocols today."
> True: **zero**. The code path could not reach a single one of them.

**Check:** before saying a defect affects N things, measure how many of those N the code can actually
reach. A wrong branch nothing reaches is **latent**, not live. Say which.

Reachability is usually one query. `scripts/measure-predicate-reachability.ts` is the one that
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
> True for the repo, **false for the two files the commit existed to fix**. `app/tsconfig.app.json`
> includes only `src`, so `scripts/` is outside `tsc -b` and its `noUnusedLocals`; there is no eslint
> config at the repo root, so `eslint .` from `app/` never sees `scripts/`; `bun build` strips types
> without checking unused locals. A dead variable survived all three.

**Check:** before citing a green check, confirm its scope includes the files you changed. `tsc -b`
over `app/src` says nothing about `scripts/`. A passing suite over mocked transport says the variable
was passed, not that the query was valid — that one cost a live mainnet outage earlier in the same
project.

Name the gate's scope when it does not cover everything: "tsc clean over `app/src`; `scripts/` is
outside every gate."

## Two habits that prevent all four

**Commit the script, not the number.** Every figure in a doc, ADR, task file or report that came from
a measurement names the script that produces it. `scripts/measure-*.ts` exist for this. A number
nobody can re-run is an assertion, and this repo's whole argument is that assertions are the bottom
rung of the ladder.

**Quote the interval, not the point, when n is small.** `3/122` is "between 1% and 7%", not "2.5%".
Over 88,243 agents that is 741 to 6,160 — a range too wide to position on, which is itself the useful
finding. Wilson, not normal approximation, at these counts.

## Scope of this rule

It governs what is written in: completion reports, commit messages, ADRs, task files, post-mortems,
`docs/`, PR descriptions, and answers to the user. Code comments too — a comment asserting a number
is subject to the same rule, and `code.md` already forbids comments that misdescribe state.

It does not slow ordinary work. Three of the four checks are a single query or a single `grep`. The
cost of skipping them is paid by whoever reads the claim next and believes it.
