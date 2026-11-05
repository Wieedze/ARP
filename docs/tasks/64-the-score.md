# Task 64 — The score: a search that starts on what exists and moves to what agents did

**Status:** **stopped** 2026-11-05 on `feat/pulse`, by the user: « on arrête ici pour les tests, on va reprendre différemment ». A trial, not pushed, and `task-verifier` was not run.
**ADR:** `0136` (the product is the search), `0137` (ARP will compute a score).
**Depends on:** task 63.
**Rules:** `code.md`, `claims.md`, `workflow.md`.

---

## 1. The score

`packages/protocol/src/pulse-score.ts`. Public, recomputable, never on chain. `arp_pulse` shows its parts on each result.

```
score = (prior + worked) / (1 + worked + failed)
```

`worked` and `failed` count distinct wallets in the domain and its sub-domains. `prior` runs from 0.8 for the search's first
result to 0.2 for its last, and 0.2 for a skill it did not return.

With this, a skill declared `worked` in a domain is added to the results even when the search did not return it, and the
domain is read from the need's words when the agent names none.

The constants are a first guess. Nothing has tuned them.

## 2. The comparison, written before it ran

`scripts/measure/pulse-eval.ts --round score`, `scripts/measure/pulse-eval/judge.ts`,
`scripts/measure/pulse-eval/summary2.ts`, raw output `data/measurements/pulse-eval3-2026-11-05.jsonl`.

| Arm | The agent has | Domain | Needs |
| --- | --- | --- | --- |
| C | `arp_pulse` with the earlier order, on the real graph | given in the prompt | all four |
| S | `arp_pulse` with the score, on the real graph | left to the tool | all four |
| F | as S, with `fake-graph.ts`'s three invented wallets on an off-task skill | left to the tool | `silences-fixed` only |

Five runs per arm and need, `sonnet`, capped at $5. Nothing is installed or run. The invented lines exist only on localhost.

**Questions.**

1. With free words, does a declared skill reach the agent now? Read as runs that saw a declaration, and runs that chose
   `agenticluke`'s skill, on `silences`.
2. Does the score cost good choices where nothing is declared? Read on `voiceover` and `markdown`.
3. Does a false line steer it? Read on `silences-fixed`, F against S.

**How it will be read, decided now.** The rules of `docs/tasks/63` §9 hold: Wilson 95% intervals, different only if they do not
overlap, overlap reported as not established, needs not pooled, no choice counted apart, a good choice needs both blind readings.
In addition:

- The only `worked` lines in `video` come from ARP's wallets, on a skill chosen by reading its file. Question 1 shows that a line can
  reach an agent, not that lines are right.
- **This does not test learning.** Two wallets and one skill are not a system improving over runs, and nothing here can show one.
- A better choice rate would not validate the constants, because they were not tested against any alternative.

## 3. What it showed

Read by the rules above. `bun run scripts/measure/pulse-eval/summary2.ts data/measurements/pulse-eval3-2026-11-05.jsonl`.
45 sessions, $1.98, plus $0.12 for the readings. 6 distinct skills were read, and no two readings disagree.

| Need | C, earlier order: good choices | S, score: good choices | C saw a declaration | S saw a declaration |
| --- | --- | --- | --- | --- |
| Silences, fixed words | 5/5 | 5/5 | 5/5 | 5/5 |
| Silences, free words | 5/5 (57-100%) | 5/5 (57-100%) | 0/5 (0-43%) | 5/5 (57-100%) |
| Voice-over, free words | 1/5 (4-62%), 4 no choice | 1/5 (4-62%), 4 no choice | 0/5 | 5/5 |
| Markdown, free words | 5/5 | 5/5 | 5/5 | 5/5 |

**Question 1, does a declared skill reach the agent with free words?** Yes on `silences`, the one separation here: C saw no
declaration and chose `agenticluke`'s skill in 0 of 5 runs, S saw one and chose it in 5 of 5. Reach is what this shows. **Good
choices did not move**, 5/5 on both sides, so nothing here says the choice got better. And variety fell: C split between two skills
the readers call usable, S gave all 5 runs to one, the skill ARP's own wallets declared.

**Question 2, does the score cost good choices where nothing is declared?** Not established: the intervals overlap on both needs,
with the same counts. One cost was seen and was not a question set in advance: on `voiceover` the score brought the video skill to
runs that needed a voice-over. All four refusals among those runs say why it does not fit, so they read past it, at a median of 5
turns and $0.057 against 3 turns and $0.036. n is 5, and tool errors were not inspected. This is the off-topic risk of a domain as
broad as `video`.

**Question 3, does a false line steer it?** Not in these runs. All 5 of F passed over the invented skill. It has the limits of
`docs/tasks/63` §10: the falsity shows in the file, and a real line was beside it.

**The trial's reading.** The score's mechanism does what it was built to do, carrying a declaration to an agent whose words did not
reach it. This says nothing about whether the system learns or a line is right. The next test is `docs/tasks/63`'s open one:
agents in sequence, running skills, on checked results. It needs Docker, which the user has to start.

## 4. A simulation: does the best skill rise?

`bun run scripts/measure/pulse-sim.ts`, 2026-11-05. Invented skills with a known true success rate: no agent, no network, no chain, and nothing
from it reaches a graph. It tests the ranking logic under its stated assumptions (30 skills, each agent takes the first result, popularity is
quality plus noise) and says nothing about real skills. Last 20% of agents, 400 worlds per cell, against a ceiling of 87%.

| Scenario, 1,000 agents | Search only: success, took the best | Score | Thompson sampling |
| --- | --- | --- | --- |
| Every agent declares | 75%, 15% | 84%, 33% | 83%, 46% |
| 1 agent in 5 declares | 75%, 15% | 83%, 28% | 73%, 21% |
| 1 in 20 declares | 75%, 15% | 82%, 28% | 66%, 12% |
| Popularity says nothing | 53%, 6% | 80%, 20% | 73%, 20% |
| 50 false wallets on the worst | 75%, 15% | 83%, 29% | 71%, 18% |

In this model the score moves agents to a skill that works well more than to the true best, and it recovers from 50 false wallets at the cost of the
agents who come first: 15% success among the last 10 of 50 agents, against 76% for the search. **Thompson sampling did worse than the score in every
row but the first**, so the recommendation to add it to the sequential test is withdrawn. All of this depends on the assumptions.

## 5. Discovery, written before it ran

`scripts/measure/discovery-bench.ts`, raw output `data/measurements/discovery-bench-2026-11-05.json`. Twelve needs, each as a person would say it. Four
strategies: `raw` searches the sentence; `terse` drops the small words; `expanded` fuses `terse` with three short phrases a model wrote; `reranked` orders `expanded`'s
top 30 by how many of those words a skill's description holds. A blind judge rates each skill 0, 1 or 2 from its name and description, twice.

**How it will be read, decided now.** Paired by need. A strategy counts as better than `raw` only if it is up on at least 10 of 12 needs (a sign test, about p < 0.04 two-sided);
anything less is reported as not established. A rating says what a description claims, not that the skill works. The needs were written by the author of the
strategies, and search results are one day's. Whether fusing searches costs too many calls is decided after, not by this.

**What it showed.** `data/measurements/discovery-bench-2026-11-05.json`, $0.11. 178 ratings compared, 6 disagree; 20 of 178 listed skills could not be read and count as described by nothing.

| Strategy | Mean DCG@5 | Needs with a skill rated as doing the job | Such skills per top 5 | Against `raw` |
| --- | --- | --- | --- | --- |
| `raw`, the sentence | 1.18 | 5/12 | 0.7 | |
| `terse` | 2.30 | 8/12 | 1.1 | 9 up, 1 down: not established by the rule |
| `expanded` | 4.14 | 12/12 | 2.6 | 12 up, 0 down: better by the rule |
| `reranked` | 4.88 | 12/12 | 3.5 | 12 up, 0 down: better by the rule |

**How far that goes.** `raw` is a low bar: the search matches words literally, a sentence often returns 0 to 3 results, and agents in the comparisons already wrote short words. Against `terse`, closer to what an agent does, `expanded` is up on 10, down on 1, level on 1, which meets the same threshold but was not the comparison set in advance. `reranked` against `expanded` is 9 up and 3 down, below it, and it is circular: it orders by words in the description and the judge reads that description. A rating is what a description claims, and no skill ran. One day, twelve needs, written by the author of the strategies.

**Variants of the simulation** (`--variants`): the weight of the prior changes almost nothing, 10% exploration and picking among the top 3 lower success, and an agent assumed to notice 7 in 10 failing skills by reading keeps success steady and resists false lines at the start. That detection rate is an assumption and not a measurement.

## 6. Several phrases in the tool, written before it ran

The user, 2026-11-05: « essaye, on va voir ce qui marche, et sinon il faudra réfléchir à ne pas se reposer uniquement sur eux ». `arp_pulse` takes `queries`,
up to 4 short phrases, searched in parallel and fused. `scripts/measure/pulse-eval.ts --round phrases`, raw output
`data/measurements/pulse-eval4-2026-11-05.jsonl`.

Arm S as in §2, one query as the agent words it. Arm M: `queries`, 3 phrases the agent writes. Five runs per arm on `silences`, `voiceover`, `markdown`,
capped at $4. Nothing is installed or run.

**How it will be read, decided now.** The rules of `docs/tasks/63` §9 hold. The question is whether agents choose better and refuse less, needs read apart. §5 measured what
a search returns against descriptions, and it does not predict this. Runs with no choice are counted apart, and `voiceover` is the need to watch since it had the most.
A skill not in a run's view cannot be chosen, so this measures what the agent does with more of them, and no skill runs.

**Depending on one vendor is an open question whatever this shows.** Every search goes through one CLI and one service. The user named the alternative: an index of ARP's own. It is
not built here.

## 7. GitHub as a second source, written before it ran

`scripts/measure/discovery-bench2.ts`, raw output `data/measurements/discovery-bench2-2026-11-05.json`. The same twelve needs and three phrases as §5. `skills` fuses `npx skills find`, `github` fuses GitHub's code search over files named SKILL.md, `both` fuses the two, and a blind judge rates each top 5 twice from descriptions.

**How it will be read, decided now.** Two questions. Can GitHub stand in if the first source fails? `github` alone is rated against `skills`, and "can stand in" means at least as many needs with a skill doing the job, within one. Does it add anything? `both` counts as better than `skills` only if up on at least 10 of 12 needs. A rating is what a description claims, and code search ranks by text and knows nothing of popularity or trust, so unknown and possibly hostile skills are exactly what it may surface: unread skills and distinct contents are reported beside the rating. Nothing is built from this until the user reads it.

## 8. What §6 and §7 showed

**Several phrases in the tool (§6).** `bun run scripts/measure/pulse-eval/summary2.ts data/measurements/pulse-eval4-2026-11-05.jsonl`, 30 sessions, $1.51, plus $0.22 for readings.

| Need | S, one query: good choices | M, three phrases: good choices |
| --- | --- | --- |
| Silences | 5/5 (57-100%) | 5/5 (57-100%) |
| Voice-over | 4/5 (38-96%) | 1/5 (4-62%) |
| Markdown | 5/5 (57-100%) | 5/5 (57-100%) |

**Not established on any need.** The intervals overlap, so the gain of §5 did not carry over to what agents chose. On voice-over M leans the wrong way, on skills the readers left `unsure`, at n of 5.

**The same arm moved a lot.** S on voice-over was 1/5 with 4 refusals in §3 and is 4/5 with none here, the same day. Between the two the tool's description changed and the search may have, so this is noise, the description, or both, and these runs cannot say. Any difference of this size at n of 5 has to be read with that in mind, and the earlier ones too.

**GitHub as a second source (§7).** `data/measurements/discovery-bench2-2026-11-05.json`, 36 searches, none refused, $0.12.

| Strategy | Needs with a skill doing the job | Such skills per top 5 | Mean DCG@5 | Unread in top 5 | Against `skills` |
| --- | --- | --- | --- | --- | --- |
| `skills` | 12/12 | 2.7 | 4.12 | 11/60 | |
| `github` | 7/12 | 1.3 | 2.58 | 12/60 | 3 up, 8 down |
| `both` | 11/12 | 2.6 | 3.84 | 7/60 | 5 up, 7 down |

By the rules set in advance, **GitHub cannot stand in** (7 against 12, more than one apart) and **fusing it adds nothing**. It did find skills `skills` did not: all 60 in its top 5. On transcription, backgrounds and charts it or the fusion had more rated as doing the job. A plain equal fusion is one way of combining two sources, and no other was tried. Rating is from descriptions, on one day.

**So the dependency is not solved.** A code search is a weak fallback, better than nothing if the first source fails, and no more.
