# 0064 — A uniform sample of the ERC-8004 cohort is a sample of one operator

**Status:** Accepted
**Date:** 2026-10-27
**Triggered by:** `docs/tasks/17` gate run — the first walk of 100 agents

## Context

`docs/tasks/17`'s gate asked for liveness and endpoint classification over 100 agents, reproducible, with
the three outcome groups visibly separated. Two walks ran on 2026-10-27 against Base 8453's
`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, both kept under `data/measurements/`:

| walk                          |   n | document read | endpoints | confirmed | not-checkable | inconclusive |
| ----------------------------- | --: | ------------: | --------: | --------: | ------------: | -----------: |
| uniform over 1,138,325 minted | 100 |            96 |       186 |       178 |             8 |            0 |
| ids 1–100 (the oldest)        | 100 |            99 |       107 |        99 |             7 |            1 |

The classification worked. The numbers it produced do not mean what their shape suggests.

**89 of the 100 uniformly sampled agents are `centralcity.ai`** (Wilson 95%: 81.4–93.7%), and
**178 of 178 probed endpoints sit on that one host.** The headline rate the walk prints — 93
endpoints named a protocol, 89 of those were probeable, and 89 of 89 probed serve what they named —
is one operator's uptime, measured 89 times.

The other end of the registry is no better and is not the same operator: **98 of ids 1–100 are
`marketplace.olas.network`** (93.0–99.4%), none of which names a protocol at all, so that stratum
reports "0 of 0 named a protocol and serve it".

ADR `0047` already fixed one sampling bias here — a constant `88_243` cohort size that sampled the
oldest third once the registry passed 300,000 — by reading `highestTokenId()`. That fix was right
and is not what this is. Uniform sampling over the true id space is the correct estimator for the
registry; the registry is simply not a population of independent agents.

## Decision

**Every rate measured over the ERC-8004 cohort is reported with the host distribution beside it,
and is never stated as a property of the cohort when one operator holds a majority of the sample.**

`scripts/measure/verifier-gate.ts` enforces this at the point of reading: it prints the top
registration-file hosts and the top probed-endpoint hosts under every rate, and when the leading
host exceeds half the sample it prints the sentence in full — _"N of M sampled agents are H. Every
rate above is that operator's, not the cohort's. Do not quote one as the other."_

A walk is kept as a file under `data/measurements/`, not re-run, because re-running it costs a hundred
third-party hosts a request each and the report must stay reproducible from a committed artefact.

## Alternatives considered

- **Stratify by host and report per-operator rates.** The right answer eventually, and it needs a
  population of operators to be worth the complexity. Today two operators hold both strata; a
  per-operator table would have two rows and the same caveat under it.
- **De-duplicate: one agent per operator, then sample.** It discards the actual finding. That 89% of
  recent mints are one deployment is the most useful thing either walk produced, and a sampler that
  hides it would let the next reader rediscover it as a surprise.
- **Say nothing and report the rates.** This is the failure `rules/claims.md` §2 is written about,
  and the reason the rule exists is that it already happened here once.
- **Walk more agents.** Costs third parties more requests and moves no interval far enough to change
  the conclusion: 81.4% at the low end of the Wilson bound is still a majority-one-operator sample.

## Consequences

**Positive:**

- The gate's output cannot be quoted as a cohort property by accident; the caveat is printed by the
  same script that prints the number.
- The concentration is itself a measured finding about ERC-8004 on Base, and it is the kind that
  bears on positioning: a registry whose mass is bulk mints by a few platforms is an argument for
  evidence that moves on its own, which is what `docs/tasks/17` builds.
- Two raw walks are committed, so a reviewer reproduces any confirmed row with one `curl` without
  touching a third-party host a second time.

**Negative:**

- `data/measurements/` is 280 KB of JSON in the repo, and it will grow with each recorded walk. The
  alternative — a number in prose with no artefact behind it — is the thing this repo is against.
- Nothing yet tells a future walk to re-measure the concentration when it changes. It is read at
  report time, every time, which is the cheapest guard available but is not a trend.

**Neutral (worth knowing):**

- The two walks disagree on which outcome codes appear at all: `templated` in the uniform walk,
  `non-http-identifier` in the old one. Both are group 1 — the agent did nothing wrong — and the
  difference is operator convention, not agent quality.
- `requestsMade` was 551 for the uniform walk and 299 for the old one, against 100 agents each. The
  gap is **not** the endpoint count. It decomposes exactly:
  `551 = 100 eth_call + 95 document GET + 89×3 A2A + 89×1 plain`, against
  `299 = 100 + 99 + 100`. The `×3` was a defect — `a2aCandidates` appended the two well-known card
  paths to a declared URL that was already a card — found by the verifier on this task and fixed
  the same day. The same walk now costs **373**. The per-id `eth_call` and document GET are ~195 of
  the 551 and ~199 of the 299 and have nothing to do with endpoints at all, which is what makes
  "5.5 requests per agent" an inviting misreading.

## References

- Related rule: `.claude/rules/claims.md` (§2 one number one context; "quote the interval, not the
  point, when n is small")
- Related rule: `.claude/rules/portability.md` (read it from the chain, not from a copy)
- Related ADR: `.claude/choices/0047-the-mirror-is-a-prerequisite-and-signing-is-a-separate-program.md`
  §"the stale constant was a sampling bias" (line 115) — the fix this extends and does not replace.
  Its title names its first topic only; the sampling half is further down
- Related task: `docs/tasks/17-the-external-verifier.md` — the gate that produced it
- Artefacts, with the invocation that produced each — the invocation is what
  `rules/claims.md`'s "commit the script, not the number" is really asking for, and the two walks
  are indistinguishable without it:
  - `data/measurements/cohort-base-uniform-100-2026-10-27.json` —
    `bun run scripts/verify/verify-cohort.ts --count 100 --out <path>`
  - `data/measurements/cohort-base-ids1-100-2026-10-27.json` —
    `bun run scripts/verify/verify-cohort.ts --from 1 --to 100 --out <path>`

  **Retention**: one file per walk, named `<target>-<shape>-<n>-<date>.json`, added and never
  regenerated. Re-running a walk to reproduce a row costs a hundred third-party hosts a request
  each, which is the thing the file exists to avoid. `data/measurements/` is in `.prettierignore` for
  the same reason `data/deployments/` is: it is machine-written.

- Reader: `scripts/measure/verifier-gate.ts`
