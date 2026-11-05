# Task 67 — The demonstration: three proofs, on tasks where the choice of a skill matters

**Status:** in progress. The list of §3 was validated by the user on 2026-11-05 and is frozen, before any run: `data/measurements/demonstration-candidates-2026-11-05.json`, sha256 `a1fc3cceeae496b3749ba3e2a8e079cc8bba4afab2c6214ab2eaf26d21d61493`. Not committed yet.
**Depends on:** task 63, task 64, task 66 (form B, the score), ADR `0136`.
**Rules:** `code.md`, `claims.md`, `workflow.md`.

---

## 1. Why

The user, 2026-11-05: « je veux surtout qu'on ne fasse pas des tests dans le vide, on doit réussir à démontrer notre point de vue sans forcer », and « il faut une tâche où on se démarque, car là c'est dur de mesurer sur des tâches que tous les agents font sans skill » (spelling corrected).

Task 64 scored 5/5 with and without the score on `silences` and on `markdown`, no skill was run, and every world of task 66 was written by the author of the logic.

## 2. The sentence

**What an agent lived through and declared helps the next agent succeed.**

| # | Proof | Test | What proves us wrong |
| --- | --- | --- | --- |
| 1 | The line lands in the right place | Write a line in a sub-category, search with other words, for a skill and for an agent | It does not rise to the parent, or a level more finds worse than a flat list |
| 2 | The line says something new | Run real skills and record the failures their own file did not announce | Such failures are rare, so reading the file is enough |
| 3 | The next agent does better | The same needs, with and without the lines of the wave before | No difference in success |

Proof 2 comes from the sieve of §3. If it fails, proof 3 is not run, and that is the result.

## 3. The sieve: finding where the choice matters

**The tasks are not ours.** They come from SkillsBench ([paper](https://arxiv.org/abs/2602.12670), `benchflow-ai/skillsbench`, Apache-2.0, pinned at `f860ecf`): containers, instructions and pass/fail test scripts written by its authors, who run each task with and without skills. Its no-skill baseline is not reused: its own `docs/skills-research/skill-pollution-trial-summary.md` records no-skill trials that received skills, and its per-task results are in figures that were not read.

**The 20 candidates**, chosen by `bun run scripts/measure/demonstration-candidates.ts`, every task and every reason in `data/measurements/demonstration-candidates-2026-11-05.json`. Of 87 tasks, 30 were dropped (21 with fewer than 2 skills on the market, 8 too large for the limits set, 1 with no network), and the 20 kept out of 57 are the lowest `sha256(name + salt)`. A search result is a word match and may be off-topic, and 13 of the 87 tasks hit 100 results, which looks like a cap.

| Category | Tasks |
| --- | --- |
| Finance | `shock-analysis-supply`, `invoice-fraud-detection`, `weighted-gdp-calc`, `reserves-at-risk-calc` |
| Security | `suricata-custom-exfil`, `dapt-intrusion-detection`, `software-dependency-audit` |
| Office | `jpg-ocr-stat`, `citation-check`, `court-form-filling` |
| Software | `react-performance-debugging`, `python-scala-translation`, `fix-build-agentops`, `flink-query` |
| Industrial | `ada-bathroom-plan-repair`, `energy-market-pricing`, `drone-planning-control` |
| Reasoning | `exam-block-sequencing`, `travel-planning` |
| Media | `threejs-structure-parser` |

A candidate is kept only if it passes all three, in this order, each pass or fail given by the benchmark's own test script:

| Filter | Run | Kept if |
| --- | --- | --- |
| A. The agent alone cannot do it | 10 runs, no skill | At most 3 of 10 pass |
| B. A skill makes it possible | 10 runs, the skills the benchmark supplies | At least 7 of 10 pass |
| C. Skills from the real market that read alike give different results | 10 runs each, for skills from the task's search that a blind reader cannot rank from their files | The best and another differ by at least 5 of 10 |

Filter C is where a line has something to say that a file does not, and its failures are proof 2's data. A task with too few skills on topic for filter C fails it.

**Without forcing.**

- The list above is fixed before any run. Every candidate is reported, including those dropped.
- No candidate is ARP's own, or needs anything of ARP's.
- The sieve reads no line and no score.
- **The share of candidates that survive is itself a result**, and the claim is limited to it: "on tasks where the choice of a skill matters", never "on tasks in general". No survivor means the sentence is not shown on this list, and it is written so. The list is not widened to find one.
- 10 runs only sort candidates, and some will pass by luck. Nothing from the sieve is reused as evidence in proof 3.

## 4. Proof 3

- The surviving tasks, with the benchmark's script as the check. Two arms: `arp_pulse` with the lines of wave 1, and without them. About 30 runs per arm and need, because 15/30 and 27/30 do not overlap (33-67% and 74-97%), and at n of 5 task 64's same arm went from 1/5 to 4/5.
- Wave 1 is agents running the task and declaring what happened, by form B, on testnet 13579. Nobody hand-writes a line.
- Wilson 95% intervals, needs not pooled, different only if they do not overlap (`docs/tasks/63` §9). The figure is the script's pass rate, then cost and turns.
- **A failed test is written as it is.** A later round cannot erase it.

**Conditions from task 66, to settle before wave 1** (notes from sessions `arp-5a` and `arp-f3`, 2026-11-05; `docs/28`, `docs/tasks/66` §10; not re-run here):

- **Write one line first.** `arp_declare_used` writes form B through `prepareUsageContext`, which has only run in tests. On chain, only `scripts/demo/pulse-nested-walk.ts` has written form B.
- **Distinct wallets, and the result says they are all ours.** `signalOf` counts a wallet once, so one wallet for a whole wave counts for 1. Pass `declarer`.
- **Fix what each arm passes as `constraints.can_provide` before the run**, and the same for both. Left out, a `missing-*` failure counts in full, so changing it would measure that choice.
- **Domains.** A domain must exist under `tool` on 13579 or the plan refuses, and `inferDomain` may find none. Map the surviving tasks to existing categories before wave 1, without reading any result.
- **Only a GitHub `?skill=` URL reaches `arp_pulse`.** Hosts such as `skills.volces.com` appear in the search results of §3, so a line on one of those skills would not reach wave 2. Filter C reports how many of its skills this leaves out.
- **Known read limits.** `readThingUrl` uses `ipfs.io`, which refused scripts on 2026-11-05 (task 65 §4), and an atom with no pinned document can stay `Unknown`. The index caps at 250 lines per query and 100 nested positions: a run whose reads return `truncated` says so.
- **The score reads domain and reason only.** The proof weighs 1 and no receipt is read, so proof 3 tests what `arp_pulse` computes today, and says nothing about receipts.

## 4b. The harness check, 2026-11-05

Run by the user, BenchFlow 0.7.11, Docker, `~/arp-bench/step1b.log` (not committed). The benchmark's reference solution passed its own test script on `suricata-custom-exfil` and `shock-analysis-supply`, 2/2, with no model. This shows that the harness and those two scripts work here, and nothing about any agent. The other 18 candidates are not checked yet.

**First real run.** `suricata-custom-exfil`, no skill, `claude-sonnet-5-5`, one run: the test script passed, 3 tool calls, 1.6 minutes for the job, $0.135 as the harness reports it (203,559 input tokens, 1,663 output). One run says nothing about filter A, and the harness warned that this model is not in its cost table, so the figure is to be checked against the console. On Docker Desktop under WSL the harness needs `~/arp-bench/shim/docker`, which answers its bridge query with the WSL address.

## 4c. Step 1, the ground truth: written before any skill is selected or run

**Decided by the user, 2026-11-05 (« oui allez vazy »).** It replaces the rest of the no-skill pilot, whose 19 remaining runs were not made. Filter A is not run, and the frozen list does not change. What has to be shown: agents that merely note what happened to them lead the next ones to a skill that works. That takes three links: there is something to choose (1), lines tell the truth (2), lines move choices (3, shown only on a planted line, task 68 §8). Step 1 measures links 1 and 2, on the chain of nothing: no line is written.

**The task.** The first task of the frozen list, in its order, classed `hard` by the benchmark, with at least 3 qualifying skills.

**The skills, by `scripts/measure/demonstration-skills.ts`, before any run.** The search results already recorded for that task, GitHub sources only, in search order, up to the first 20 readable. A blind reader with no tools sees the task's text, a skill's name and its description, and answers whether a reasonable agent would load it for this task, twice. A skill qualifies on two yeses. The first 5 that qualify are kept, each pinned to a commit. The same reader then reads the kept skills' full `SKILL.md` and ranks them, which records what a file predicts.

**The runs.** `claude-haiku-5-5`, chosen for cost. 5 runs for each skill and 5 with no skill, in rounds, one run of each arm per round, so a stop leaves the arms even. Only that one skill is in the container, and never the benchmark's own. After the task, a second prompt asks the agent what happened, with `worked` or `failed` and a reason from `docs/28`'s four words. Its answer sets no result. The benchmark's script runs after it and does not show its verdict to the agent. A pass is `reward` equal to 1.

**How it will be read, decided now.**

| Link | Measure | Holds if |
| --- | --- | --- |
| 1. Something to choose | Passes per skill, and the first in search order against the best | The best passes at least 2 of 5 more than the first in search order |
| 2. Lines tell the truth | The agent's word against the script, across all runs that gave a word, with the false `worked` counted apart | At least 80% agree |

- A run whose agent never invoked the skill (`n_skill_invocations` of 0) counts as "skill not used", is reported apart, and does not count for that skill.
- **n of 5 shows a lead and not a difference.** Intervals are quoted, Wilson 95%, and link 1 holding only means step 2 is worth its cost.
- If link 1 does not hold, the next task by the same rule is the next step, subject to the budget, and the share of tasks where it fails is a result. If link 2 does not hold, step 2 is not run, because lines would carry noise.
- Whether the reader's ranking predicted the result is reported and sets no verdict. It is proof 2's first data.
- Haiku's result says nothing about a stronger model, and one task says nothing general.

**The cap.** The script stops at $4.50 reported between runs, on a balance of $4.87, with automatic reload off. Step 2 needs its own approval.

**The wiring run, 2026-11-05.** `budyai/cashflow@finance-standards`, `claude-haiku-5-5`, round 1, `jobs-step1` (not committed). Script: failed, 8 of 9 tests, on the HP filter's objective cell, and `reward` is all or nothing. 93 tool calls, 29 minutes of agent time, $0.559 as the harness reports it, not yet checked against the console. The second prompt reached the agent, which answered `OUTCOME: failed REASON: not-the-right-tool`. `n_skill_invocations` is 0, so this run counts as "skill not used". No `sk-ant-` string in the run's files. At this rate the 30 runs cost about $17 and 15 hours in sequence, above the cap, so the plan of this section cannot run as written without the user's decision.

**What `c87001a` changes for step 2 (ADR `0143`, `pulse-score-3`, read 2026-11-05).** Step 1 is untouched: it reads no line. For step 2, a ranking moves only from `WALLETS_TO_MOVE`, 3 distinct wallets saying the same thing. Below that a line is shown and moves no score, yet can still move a choice (`docs/tasks/71` §4). So step 2 records whether each choice followed the rank or a shown line, reads its curve knowing the first agents cannot move the order, and pins the score's version and the commit it runs on.

## 5. What it needs

Docker, which the user starts: market skills are third-party code, and the tasks need network access. No key of the user's enters a container beyond what the agent's model needs. A cost cap per step, set before filter A, since task 64 ran no skill and its $0.04 a session does not apply. Filter A alone is 200 runs, and a task's time limit can reach an hour (`video-silence-remover`'s `task.md`; not a candidate, the others not read for this).

## 6. Output

One page: the sentence, the three proofs, a verdict for each (shown, not shown, refuted), and a link to the raw data of each.

## 7. Do not do in this task

Solving Sybil (§9 only measures what an attack costs), the market on `worked`, mainnet, changing a score weight, tuning anything between the rounds of one proof.

## 8. Evidence ladder

It serves **proven**: it tries to show from executed results what a declaration is worth, and it can come back saying that it is worth little.

## 9. The attack cost: what makes a line credible when it cost its writer nothing

**Status:** proposed by the user's decision of 2026-11-05 (« oui »), nothing run, separate from proofs 1 to 3. If ARP pays for the writing, a line no longer says « I paid to state this », so its credibility has to come from elsewhere. The question here is the price of faking it.

**The question.** How much money and how much time does it take to bring a bad skill or a bad agent above a good one in a search result?

**The readings compared**, each fixed before the first attack:

| Reading | How a line counts |
| --- | --- |
| R0. A plain count | One wallet, one vote |
| R1. Use required | A wallet with no recorded use weighs 0. A hook record weighs little, a content receipt little to medium, a paid receipt from an independent party most. The hook is the only witness for a skill installed outside ARP, and it runs on the writer's machine, so it can be forged |
| R2. R1 plus history | Age, number of distinct counterparties, a cap per wallet, and wallets that only answer each other counted as one |
| R3. R2 plus a curator | A curator attests an identity by holding a position on it, and can withdraw that position. It attests the operator rather than each wallet, the reader chooses which curators to read, and a curator's criteria are public |

**The attacks**, each run against every reading:

| # | The attacker | What it costs them |
| --- | --- | --- |
| 1 | New wallets, no use, voting `worked` | Gas and fees, if not sponsored |
| 2 | New wallets, each fetching a free content receipt first | Almost nothing: this is the expected weak point for a skill |
| 3 | A forged hook record for each wallet | The time to write a script |
| 4 | Two of their own agents paying each other for receipts | The payment fees, since the money comes back |
| 5 | Patient wallets that write honest lines first, then lie | Time |
| 6 | A false identity past a curator, or a corrupt curator | Whatever that curator's criteria demand. A reader who drops the curator ends this one |
| 7 | Wallets that hold a line already written by depositing on it, then redeem | The round-trip loss, since the deposit comes back: about 50 times less per level than writing it |

**Attack 7, added by the user's decision of 2026-11-05 (« oui à tout », relayed by `arp-f3`).** `bun run scripts/measure/line-cost.ts`, testnet 13579, re-run 2026-11-05: writing one level costs 0.001000000002 tTRUST in fees, and depositing 0.001 then redeeming gets back 0.0009801, a loss of 0.0000199, so 50 times less. Small vaults only: fractions above `feeThreshold` and mainnet were not read. A wallet that backs a domain or an outcome counts as a declarer (the user's choice A, task 66). The same run: 34 of 185 `uses` edges have a holder other than their writer, and counting holders would change the wallet count of 9 tools.

**The method.** Lines are generated and each reading is computed over them locally, with real testnet 13579 lines as the honest background, so no bulk write is needed. One walk of each attack on 13579 checks that the costs assumed are the costs paid. The attacker is written before the weights are looked at, and the script and its raw output are committed.

**The result** is a table per reading: the wallets, money and days needed to flip the order, for skills and for agents separately. Never one figure across both, and never across chains. Mainnet costs are computed from values read off the chain, not tuned on testnet values (`portability.md`).

**What proves us wrong.** Confirmed by the user on 2026-11-05 as written, relayed by `arp-f3`, and frozen before any run of this section:

- R2 costs less than 10 times what R0 costs on attack 2 or 3: the use requirement does not protect skills, and that is written as it is.
- Honest lines lose more than a fifth of their weight under R2: the defence hurts the people it is for.
- R3 only works when ARP is the single curator: it buys its resistance with the neutrality it was meant to keep, and that is a design failure rather than a success.

**What this cannot show.** That real attackers behave like these, or that anyone writes at all. It prices one attack surface, and it says nothing about whether the next agent does better, which is proof 3.
