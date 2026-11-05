# 0138 — A line is written in form B, has a closed reason, and money does not weigh in the score

**Status:** Accepted
**Date:** 2026-11-05
**Amends:** ADR `0135` (the shape of a line), and fills in part of ADR `0137` (what the score reads)
**Triggered by:** the user, 2026-11-05: « oui la forme B est la meilleur et il faut la documenter avec un schema, les raison dechec doivent aussi etre ceux la, et largent deposer ne devrais pas ». Point 5 and the first form of point 7 are proposals of the same day that the user validated, as relayed by the session coordinating ARP's sessions (`arp-f3`). Point 7's final form is the user's own answer, « A », after the review measured what the first form did

## Context

ADR `0135` put a domain and an outcome side by side on a `uses` edge, so with two domains and a failure nobody could say which domain failed. The score of task 64 counted wallets and read nothing else. The page « Ontologie du pouls » compared six forms and recommended the nested one, and form B was written once on 13579.

## Decision

1. **Form B.** `T1 = (agent, uses, tool)`, `T2 = (T1, in context of, domain)`, `T3 = (T2, has outcome, worked | failed)`, `T4 = (T3, because, reason)`. A declaration can stop at any level, and an outcome with no domain sits on T1. `docs/28_THE_SIGNAL.md` holds the schema.
2. **Four reasons, closed:** `missing-key`, `missing-program`, `missing-file`, `not-the-right-tool`. Only a failure takes one.
3. **A failure for lack of something the person can supply does not lower a result for them.** `not-the-right-tool` counts only in the domain it names.
4. **The amount deposited never reaches the score.** The fee is what it costs to write a line. Rank is not for sale.
5. **Weights are first guesses:** a near domain 0.5. **A proven line weighs the same as any other, 1**, until two independent parties can be told from one. Nothing real sets `proven` yet. Changing a weight is the user's decision.
6. **Form A still reads**, since 4 lines on 13579 use it and an append-only graph cannot rewrite them. A sibling outcome applies to each domain on its edge, as it did.
7. **A wallet declares a use by writing the edge, or by holding a position on it and standing behind a domain or a result on it.** A position alone stays support. Each declarer has its own lines, and a plan with a domain or an outcome and a `declarer` deposits on an edge another wallet wrote. **Not tested on chain, and it changes how lines are read:** `declarations` holds one row per wallet, not per edge.

## Alternatives considered

- **Forms A, C, D, E, F**: the page's table. A cannot tie a result to a domain, C and D lose the readers of `uses`, E cannot start from a domain, F loses the agent.
- **Every holder of T1 as a declarer**, the first form of point 7: the wallet count would have changed on 9 tools on 13579, one from 1 to 16 with no result written (`scripts/measure/line-cost.ts`). The user chose « A » over it.
- **Weighing by a deposit's size**: the user refused. Every position on the 5 outcome lines has the same size (`scripts/measure/pulse-lines.ts`), so it carries nothing today, and weighing it would sell rank.

## Consequences

**Positive:** a result belongs to its domain and a reason to its result. The score can tell "this skill failed" from "this skill failed for someone without a key".

**Negative:**
- **The simulation did not show the details useful** by the rule set before it ran (`docs/tasks/66` §4): no detail gains 2 points in `base`. The reason is a condition worth testing where the good skills are the ones that need something, +0.6 to +2.7 points, in an exploratory round chosen after seeing the first (§6).
- **The proof weight was a risk at 2**: -20 points when liars hold receipts, and `docs/tasks/65` showed that a self-hire passes every check. Hence 1. It also gives up the +4.5 of `proof` alone against liars without receipts.
- A false reason is possible: a wallet can write `missing-key` to excuse a failure of its own. -1.0 point in the simulation when half the reasons are redrawn at random, which leaves about 37% wrong.
- **Four paid levels** instead of three, about 0.1 TRUST each on mainnet at the 2026-11-04 cost. Each level must be stood behind, and reading takes one query per level.
- **A line held by deposits costs far less than a line written. Accepted on testnet and blocking for mainnet until it is answered, by the user's decision on this figure, relayed by `arp-f3`.** Writing T1 first no longer silences anyone, which closes the case where the treasury created 31 of 185 `uses` edges on 13579 (`intuition-integrator`, 2026-11-05). But where the triples exist, a wallet can hold a line on deposits alone. On 13579, in small vaults, a round trip loses 0.0000199 tTRUST per level, against 0.001 tTRUST to create one, about 50 times less, and withdrawing removes the line (`scripts/measure/line-cost.ts`). So one wallet can write a `failed` line and others can pile onto it, on the same edge and agent, cheaply. For the score nothing new can be said, since a wallet could already write its own edge and the score counts wallets: what changed there is the price. **What did change is what a wallet can attach to a use it did not write:** a second wallet's line on `(agent 6, uses, tool)` did not count before, and now any wallet that deposits on it can have `failed` counted against that agent's use, under its own wallet. Mainnet and larger vaults were not read.
- The index caps `positions` at 100 with no sign of the cut, so past 100 holders on one edge a declarer can be missed. The read says `truncated` then.

**Neutral (worth knowing):** `docs/12` point 4 says the deposit is the signal. It now carries a note: the deposit buys the right to write a line, and its size is not read. A line written pays its fees. A line held on deposits pays far less, as above.

## References

- Task: `docs/tasks/66-the-signal.md`
- Doc: `docs/28_THE_SIGNAL.md`
- Related ADR: `0135`, `0136`, `0137`, `0049`
