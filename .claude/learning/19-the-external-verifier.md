# 19 — The external verifier

**Task:** `docs/tasks/17-the-external-verifier.md`
**Completed:** 2026-10-27 (specified 2026-10-16, built 2026-10-16/17, gate run and closed 2026-10-27)
**Commit:** `uncommitted` at verification time — working tree on `feat/agent-panel-tabs`
**Verifier verdict:** PASS — third pass. Two FAILs first, and **both failed on claims, never on
code**: the gate itself passed on round 1 and every count in it reproduced from the committed JSON.

## What shipped

Code and tests shipped 2026-10-16/17 and are unchanged except the defect below. The 2026-10-27 work
is the gate run and its artefacts.

- `data/measurements/cohort-base-uniform-100-2026-10-27.json`, `data/measurements/cohort-base-ids1-100-2026-10-27.json`
  — two walks of 100 agents on Base 8453, 276,805 bytes, the repo's first committed measurement
  artefacts. `data/measurements/` is new, in the directory map and in `.prettierignore`.
- `scripts/measure/verifier-gate.ts` — reads a walk, prints the three groups in the spec's numbering,
  the host concentration, and one `curl` per confirmed row. Makes no network request.
- `packages/protocol/src/verify/probe.ts` — `a2aCandidates` fixed (below). `verify-probe.test.ts`
  gained the count assertion. 413 pass / 4 skip.
- `scripts/measure/predicate-edges.ts` — unbroken after 41 days (below).
- ADR `0064` (the concentration), ADR `0065` (two enforcers are on mainnet).

Gates at verification: `tsc -b` 0, `eslint .` 0, app 402+2, protocol 413+4, `check:tokens` 45,
`check:contrast` 0, `check:scripts` 0, `format:check` 141 pre-existing warnings — none of them a
file this task touched, and that gate has never been green (`docs/tasks/28`). Nothing was signed or sent;
the walks are `eth_call` and HTTP GET.

## Surprises

**The gate passed and the result was useless in the shape it was asked for.** 89 of 100 uniformly
sampled agents are one operator (`centralcity.ai`, Wilson 95% 81.4–93.7%) and 178 of 178 probed
endpoints are on that host; 98 of ids 1–100 are `marketplace.olas.network`. So "89 of 89 serve what
they declared" is one deployment's uptime measured 89 times. A uniform sample over the true id space
is the correct estimator and the registry still is not a population of independent agents. ADR `0064`.

**The verifier verified itself, and found a courtesy defect.** `a2aCandidates` appended the two
well-known card paths to the _declared_ URL even when that URL was already a card, so every A2A
endpoint cost three requests where one would do — 178 of them to a single host, against the task's
own "one request per endpoint per run". It was invisible in the output because all three outcomes
were `confirmed`; the only thing that catches it is the arithmetic
(`551 = 100 eth_call + 95 document GET + 89×3 A2A + 89×1 plain`, which balances to the unit) and,
now, a test that asserts the _number_ of requests rather than the verdict.

**A committed script that throws reads as provenance.** `scripts/measure/predicate-edges.ts` could
not run from the moment `562d0fd` moved it into `scripts/measure/` — `../packages/…` became
`scripts/packages/…`. `check:scripts` is a typecheck and cannot see a runtime path. The figures it
was cited for were right, which is why nobody noticed for 41 days.

**Two of this task's three claims defects were introduced by the correction, not by the original
work.** Round 2's fix for the stale percentages added a 194 → 158 "re-measurement" that an
append-only graph cannot produce; round 2's `package.json` edit re-encoded an em dash as `—`
and broke a file that had been prettier-clean. The lesson is in `claims.md` already (§5) and this is
its third recorded instance.

## Decisions made

- **Keep the raw walks in the repo** — 270 KiB of pretty-printed JSON, one file per run, named
  `<target>-<shape>-<n>-<date>.json`, never regenerated; re-running costs a hundred third-party
  hosts a request each. ADR `0064`, Artefacts section, which also records the **invocation** per
  file — two walks are indistinguishable without it.
- **Print the host distribution under every rate**, and the full "every rate above is that
  operator's" sentence when one host holds a majority. The script enforces it at the point of
  reading, so the caveat cannot be dropped in the quoting. ADR `0064`.
- **Three terms, not two, for the protocol rate** — 93 named a protocol, 89 of those were probeable,
  89 of 89 probed serve it. "89 of 89" without the middle term reads as "every endpoint that named
  one", which is not what was measured.
- **Group numbering follows the task spec, not the script's convenience** — 1 confirmed, 2
  unprobeable, 3 inconclusive. They were separated correctly and labelled inverted, which is worse
  than either alone because a reviewer reads the spec and the output together.
- **Correct a false hard constraint where it is written, not only in the defect table.** Two ARP
  enforcers have been on Intuition mainnet since 2026-09-16 while three files said no ARP contract
  was. One line in `STATE.md` was the proportionate fix for a note in passing; a false sentence
  inside `CLAUDE.md`'s **hard constraints** is read before the defect table by an agent deciding
  what it may deploy, so it was corrected at five sites with the retraction quoted in place and
  struck through in the append-only record. ADR `0065`.
- **The evidence-ladder answer is "hardens tier 1", not "tier 1 → 2".** `docs/09` §3 defines tier 2
  as _Rated_ — a free opinion — and the verifier produces no score. It makes a tier-1 assertion
  falsifiable, which is the precondition for tiers 3 and 4. The ladder has no rung for a checked
  assertion and that absence is the point.
- **The `claims.md` §5 sweep needed three rounds** — two sites, then four more, then six more, on one
  figure (`82%`). The rule's grep step is harder than it reads, and "I grepped" is not evidence the
  grep was exhaustive: the useful habit is to paste the grep's full output and triage every line,
  not to fix the hits that look like the ones already known.

## Rules touched

- `.claude/rules/claims.md` — **sufficient, and it earned its keep three times here** (§1
  reachability, §2 one number one context, §4 a gate's scope, §5 grep the old wording). Not changed.
- `.claude/rules/security.md` — **wrong about deployment posture**, corrected under ADR `0065`.
- `CLAUDE.md` hard constraints — same sentence, same correction.
- `.claude/rules/workflow.md`, `.claude/rules/code.md`, `.claude/rules/portability.md` — sufficient.
  `code.md`'s "no comment that misdescribes state" is what the undated `82%` sites violated.

## Suggestions for future tasks

- **When a number explains a cost, decompose it before explaining it.** `requestsMade` looked like
  endpoints per agent and was two-thirds RPC and document reads.
- **Assert counts, not just verdicts, wherever courtesy is a requirement.** Three confirmed results
  and one confirmed result look identical from the outside.
- **A figure in a doc cites a script; run the script before citing it.** One of them had been dead
  for 41 days and `tsc` cannot see it. Worth a `docs/tasks/28` item: a smoke-run of every
  `scripts/measure/*.ts` that takes no argument.
- **`docs/08`'s `use` 194 does not reproduce** — `predicate-edges.ts` gives 158/185/120 on both
  2026-10-16 and 2026-10-27, and `docs/09:35`'s trio matches on two of three. It is a different
  query, not a shrinking graph, and it is cited at six sites. `docs/tasks/28`.
- The next walk costs **373** requests instead of 551. Record it when it runs; it is the only
  evidence the fix worked in the wild.
