# Task 71 — A false line: the ranking moves from three wallets

**Status:** in progress, 2026-11-05, on `feat/agent-pulse`. Item 3 of `docs/tasks/70`.
**ADR:** `0143`.
**Decision:** the user chose design 1, relayed by `arp-f3`: the ranking moves only from 3 different wallets that say the same thing. Below that, a line is only shown. The threshold is one constant. The user also asked to measure, at low cost, whether an agent that reads "1 agent says it failed" changes its choice anyway: the threshold protects the ranking, not the reading.
**Rules:** `code.md`, `claims.md`, `workflow.md`.

---

## 1. The reading test, written before it ran

`scripts/measure/pulse-eval.ts --round reading`, `scripts/measure/pulse-eval/fake-graph.ts`. Real `claude -p` sessions, `sonnet`, as in `docs/tasks/63` §9. Nothing is installed or run. The invented line exists only on localhost and reaches no chain. Capped at $4.

| Arm | The agent has | Runs |
| --- | --- | --- |
| `S` | `arp_pulse` on the real graph, fixed words "video editing ffmpeg" | 15 |
| `F-failed` | The same, plus one invented wallet saying `failed` in `video`, with no reason, on the skill `S` chose most | 15 |
| `F-worked` | The same, plus one invented wallet saying `worked` in `video`, on the first skill `S`'s answer lists among results that no run of `S` chose | 15 |

`S` runs first. Its most chosen skill and the off-choice are then frozen, and written here before the other arms run.

**How it will be read, decided now.**

- Share of runs choosing the target, with Wilson 95% intervals. Different only if the intervals do not overlap; overlap is reported as "not established", never as "no effect".
- `F-failed` against `S` on the favourite, `F-worked` against `S` on the off-choice. One need, so nothing here speaks for other needs.
- The ranking is unchanged across arms by construction, so a difference is the reading alone. This is checked on the raw output: the order of the results must match. If it does not, the run is reported as broken.
- Runs with no choice are counted apart.
- **What it cannot show:** a false line on a skill whose file shows it false, a reason given with the line, or anything about whether the chosen skill works, since none runs.

**Frozen after `S` and before the other arms.** `S`, 15 runs, $0.79: `wyattblue/auto-editor` 8, `kappaemme-git/codex-video-short-maker-skill` 6, `htekdev/vidpipe-copilot-plugin` 1. So the favourite for `F-failed` is `wyattblue/auto-editor` (8/15, Wilson 30-75%), and the off-choice for `F-worked` is `monkeyboiii/video-master` `auto-editor`, listed in 10 of 15 answers and never chosen.

**One rule above cannot hold, and is replaced before the other arms run.** "The order of the results must match" was written expecting one order. Within `S` alone the five results returned differ between runs, 5 orders in 15 runs, since the agent words its own query or the search answers differently. So the order is not fixed across arms by construction. What is compared instead, across arms: how often the target appears in the results and at which position. A shift there is reported beside the choice, and no choice difference is called the reading alone if one appears.

**How little this can show.** From 8/15, only 0/15 gives intervals that do not overlap (0-20% against 30-75%). So `F-failed` can catch only a line that all but removes the favourite. A smaller move reads as not established.

## 2. The cost of the threshold, written before it ran

`bun run scripts/measure/signal-sim.ts --round 3`, invented worlds, no agent, no chain. `tool` against `tool` with the threshold, world by world, 300 worlds per cell, in `base`, `sparse`, and with 1, 2 and 20 false wallets on each of the 3 worst skills per domain, at 50, 200 and 1,000 agents.

**How it will be read, decided now.** Exploratory. It prices how much slower learning gets and what the threshold stops, under assumptions the author wrote. Each difference is reported with its interval, and the threshold is not changed because of this run.

## 3. What §2 showed

`bun run scripts/measure/signal-sim.ts --round 3`, `data/measurements/signal-sim3-2026-11-05T1827.json`. The threshold of 3 against none, success among the last 20%, 95% interval. Invented worlds, written by the author of the logic.

| Scenario | 50 agents | 200 agents | 1,000 agents |
| --- | --- | --- | --- |
| `base` | -3.1 [-5.5, -0.8] | -4.6 [-6.2, -3.0] | -1.3 [-2.1, -0.5] |
| `sparse` | -3.0 [-4.7, -1.2] | -4.6 [-6.3, -2.9] | -4.5 [-5.8, -3.3] |
| 1 false wallet per bad skill | +3.7 [1.1, 6.3] | -1.4 [-3.0, 0.2] | -1.2 [-2.0, -0.4] |
| 2 false wallets | -6.2 [-9.2, -3.2] | -2.3 [-4.3, -0.4] | -0.5 [-1.4, 0.5] |
| 20 false wallets | -1.8 [-3.0, -0.6] | +1.1 [0.3, 1.9] | +1.6 [-0.3, 3.5] |

**In these worlds the threshold costs more than it saves.** It gains where it was built to, one false wallet among few agents, and in one cell with 20. With 2 false wallets it loses most at 50 agents, which was not expected and is not explained: an honest line can complete a liars' count to 3. This does not reverse the user's choice, and a false line moving every choice is a harm this average does not weigh: agents in these worlds do not lose trust in the tool. The user should read this table.

## 4. What §1 showed

`data/measurements/pulse-eval5-2026-11-05.jsonl`, $2.35, three arms of 15, from a frozen checkout of `d4ff324`. Two earlier tries were set aside and are not in the file ($0.34): a package not rebuilt, then this session editing the code under a running arm. Local lines only.

| Arm | Chose the target | Saw a line | Target at position 1 |
| --- | --- | --- | --- |
| `S`, `auto-editor` | 8/15 (30.1-75.2%) | 0 | 9/15 |
| `F-failed`, 1 false `failed` on `auto-editor` | 1/15 (1.2-29.8%) | 15 | 4/15 |
| `F-worked`, 1 false `worked` on `monkeyboiii/video-master` | 0/15 (0-20.4%), against 0/15 in `S` | 9 | never |

**The reading.** `F-failed` against `S`: the intervals do not overlap, by 0.3 of a point, and by the rule that counts as different. **So one false `failed` line, with no reason, was followed by agents leaving the favourite, even with the ranking held.** `kappaemme-git`'s skill went from 6 to 13.

**It cannot be called the reading alone**, by the rule of §1. The target was first in fewer runs of that arm, 4/15 against 9/15, and the score does not produce that, so it is the search answering differently. Going by position, exploratory: when the target was first, it was chosen 6 of 9 in `S`, 1 of 4 in `F-failed` and 3 of 5 in `F-worked`, and when fourth, 2 of 5, 0 of 10 and 1 of 6. That leans the same way, on very few runs.

`F-worked`: a false `worked` on a skill never chosen did not get it chosen, 0/15 on both sides, in 9 runs that saw it. Not established as no effect: it was listed in only 9, and one need cannot say.

**Limits.** One need, one day, one skill, the same search. The line had no reason: a reason could read differently. Tool errors, 11, 10 and 5 per arm, were not inspected. No skill ran, so nothing says the choice got worse.

**What it means for the choice of design 1.** The threshold holds the ranking, and in this run a single line still moved the choice through reading it. What the user asked to protect, that one false line does not move every choice, is therefore **not established by the threshold alone**: a line shown below the threshold may need to be shown differently, or not at all. That is the user's decision.

