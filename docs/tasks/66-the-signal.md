# Task 66 — The signal: what a line on chain is worth to the next search

**Status:** 2026-11-05 on `feat/pulse`. `task-verifier` PASS on the fifth pass, `intuition-integrator` on the fourth, post-mortem `.claude/learning/57-the-signal.md`. The cost of a line held on deposits is decided (§10).
**ADR:** `0138` (form B, the closed reasons, weights, and money does not count). Amends `0135` and fills in part of `0137`.
**Depends on:** task 63, task 64.
**Rules:** `code.md`, `portability.md`, `claims.md`, `workflow.md`.
**Reviewers:** `intuition-integrator`, `task-verifier`.

---

## 1. The user's decisions (2026-11-05)

| Question | Decision |
| --- | --- |
| How a line is written | « oui la forme B est la meilleur et il faut la documenter avec un schema » |
| The reasons for a failure | `missing-key`, `missing-program`, `missing-file`, `not-the-right-tool`: « les raison dechec doivent aussi etre ceux la » |
| Whether money deposited counts in the score | « largent deposer ne devrais pas » |
| What can be tested | « tant que nous somme en vase clos on ne peut que faire des test de simulation » : the goal is to show the logic is useful, not that it is used |
| The proof's weight, and a position on T1 | Both proposals validated, relayed by the session coordinating ARP's sessions (`arp-f3`). §10 |

## 2. Deliverables

1. `prepareUsageContext` writes form B, with a reason. `arp_declare_used` takes `reason`.
2. `getPulseUsage` reads form B and the reason, and still reads the 4 lines of form A on 13579.
3. `pulse-score-2`: a weight per line from its domain, its reason and its proof. The amount is never read.
4. `arp_pulse` takes `constraints.can_provide`, shows the parts of the score.
5. `docs/28_THE_SIGNAL.md`, with the schema.
6. `scripts/measure/signal-sim.ts`, read by §3.

Not in this task: reading a receipt from the chain (the scripts that do it are on `feat/agent-pulse`, not committed), so nothing real sets a line's `proven` yet. The page `/pulse`. Mainnet.

## 3. The simulation, written before it ran

`bun run scripts/measure/signal-sim.ts`, raw output `data/measurements/signal-sim-2026-11-05.json`. No agent, no network, no chain. It calls the same `lineWeight` the tool calls, so it tests that logic and not a copy.

**The world, all of it invented.** 30 skills. Three domains an agent can need and write: `video`, `audio`, `video-editing` under `video`. `media` above them is defined and nobody searches or writes it, so **proximity is tested on one pair**, `video` and `video-editing`. Each skill has a true success rate per domain, and `video-editing`'s stays close to `video`'s. 40% of skills need one thing (a key, a program or a file). An agent needs one domain and can provide each thing with probability 1/2. Without the thing the skill fails, and the agent says why; with it, it works at its true rate. A failure at a true rate below 0.3 is reported `not-the-right-tool`, and otherwise no reason. The search orders by mean quality plus noise, knows nothing of domains or needs. A local filter, standing for what `arp_pulse` reads in a skill's files, sets aside 70% of the skills an agent cannot satisfy. The agent takes the first result.

**The arms.**

| Arm | Reads |
| --- | --- |
| `search` | The search's order |
| `score-1` | Task 64's score: distinct wallets, same domain or below, every failure counted |
| `domain` | `score-1` plus proximity (same domain 1, parent or child 0.5) |
| `reason` | `score-1` plus the reason |
| `proof` | `score-1` plus the proof (proven 2, else 1) |
| `score-2` | All three |

**The scenarios.** `base` (1 agent in 5 declares, 30% of lines proven). `all` and `sparse` (everyone, 1 in 20). `control-no-needs` (no skill needs anything, so the reason should do nothing). `control-flat-domains` (a skill's rate is the same in every domain, so domain should gain little). `liars` (20 false wallets, unproven, say `worked` on each of the 3 worst skills in each domain). `liars-proven` (the same, with receipts: self-hiring, which `docs/tasks/65` showed passes every check). `wrong-reasons` (half the reasons given are drawn at random). `strong-filter` (the local filter sees 95%). 300 worlds per cell, 1,000 agents, the same worlds for every arm.

**Corrected after the runs:** the paragraph on the world said four domains, which did not match the script, and now says three, with what that means for proximity. Nothing else in this section changed, and the reading rules below did not.

**How it will be read, decided now.**

- The figure is success among the last 20% of agents. Each arm is compared to `score-1` world by world, with a 95% interval on the mean difference.
- **A detail counts as useful only if, alone against `score-1` in `base`, it gains at least 2 points and its interval excludes zero.** Otherwise: not shown useful, and it is said.
- **The controls can fail the simulation.** If `reason` moves more than 1 point in `control-no-needs`, the simulation is broken, and nothing from it is reported as a result.
- Any scenario where `score-2` is below `score-1` with an interval excluding zero is reported as a cost, in the same table.
- Weights are checked and not tuned: `proven` at 1.5, 2, 3 and `near` at 0.25, 0.5, 0.75 are run on `base`, `liars` and `liars-proven`. No weight changes because of this run. Changing one needs the user.

**What it cannot show, whatever it shows.** That real skills or agents behave this way, that anybody writes a line, that a reason is honest. Every world was written by the author of the logic, so a gain shows that the logic does what it was meant to under these assumptions: the logic is coherent and each detail carries information a count loses. The controls and the attack scenarios are there to catch a rigged result, and they do not make it evidence about the world.

## 4. What round 1 showed

`bun run scripts/measure/signal-sim.ts`, 300 worlds, 1,000 agents, `data/measurements/signal-sim-2026-11-05.json`. A run of 10 worlds came first, to check the wiring, and nothing was changed after it but a test and the order of two refusals. Success among the last 20%, against `score-1`, 95% interval.

| Scenario | `score-1` | `domain` | `reason` | `proof` | `score-2` |
| --- | --- | --- | --- | --- | --- |
| `base` | 77.8% | +0.7 [-0.1, 1.4] | +0.1 [-0.5, 0.7] | -0.3 [-1.0, 0.4] | +0.3 [-0.4, 1.1] |
| `all` | 80.0% | -0.5 [-1.1, 0.1] | +0.2 [-0.3, 0.8] | +0.0 [-0.5, 0.6] | +0.4 [-0.2, 1.0] |
| `sparse` | 72.7% | +0.3 [-0.7, 1.4] | -0.0 [-0.8, 0.8] | -1.4 [-2.2, -0.6] | -0.9 [-1.9, 0.2] |
| `control-no-needs` | 81.5% | -0.1 [-0.6, 0.5] | +0.0 [0.0, 0.0] | +0.1 [-0.4, 0.6] | -0.1 [-0.7, 0.5] |
| `control-flat-domains` | 79.0% | +0.8 [0.2, 1.5] | +0.4 [-0.3, 1.0] | +0.5 [-0.1, 1.1] | +0.3 [-0.5, 1.0] |
| `liars` | 65.7% | +0.3 [-1.5, 2.0] | +1.4 [-0.2, 3.1] | **+4.5 [2.8, 6.2]** | -0.4 [-2.2, 1.5] |
| `liars-proven` | 65.7% | +0.3 [-1.5, 2.0] | +1.4 [-0.2, 3.1] | **-12.1 [-14.1, -10.1]** | **-20.0 [-22.3, -17.7]** |
| `wrong-reasons` | 78.2% | -0.3 [-1.1, 0.5] | -1.0 [-1.7, -0.3] | -0.5 [-1.1, 0.2] | -0.6 [-1.4, 0.2] |
| `strong-filter` | 79.5% | +0.2 [-0.4, 0.8] | -0.3 [-0.7, 0.0] | +0.0 [-0.4, 0.5] | -0.1 [-0.8, 0.6] |

**By the rule set in advance, no detail is shown useful**: in `base` none gains 2 points. The control on reasons holds at exactly zero, so the simulation is not rejected. That control catches a wiring fault and little more: with no needs, the only reason left is `not-the-right-tool`, which that arm always counts, so the arm is `score-1` by construction. The `reason` arm tests the three `missing-*` reasons and never `not-the-right-tool`.

**Costs, as the rule requires.** `score-2` loses 20 points when liars hold receipts, and more as `proven` rises (-15.5 at 1.5, -28.1 at 3). `proof` alone loses 1.4 in `sparse`. `reason` loses 1.0 when half the reasons are redrawn at random, from all four, which leaves about 37% wrong. In the weight checks `score-2` also falls below `score-1` under `liars` at `near` 0.75 (-5.4 [-7.4, -3.4]) and at `proven` 1.5 (-3.4 [-5.3, -1.5]), so its -0.4 at the chosen weights looks neutral only at those exact weights. `control-flat-domains` moves `domain` by +0.8 where little was expected, which is below the threshold and unexplained.

**Proof is the one detail that moves anything, and it cuts both ways**: +4.5 against liars without receipts, -12.1 against liars with them. `docs/tasks/65` showed that a self-hire passes every check, so as written this weight pays whoever fakes a receipt.

## 5. Round 2, written after round 1 and before it ran

`bun run scripts/measure/signal-sim.ts --round 2`, raw output `data/measurements/signal-sim2-2026-11-05.json`. **This round is exploratory, because its conditions were chosen after seeing round 1, and it cannot overturn §4.** It asks why round 1 was flat. Two explanations, written now: with 30 skills and 1,000 agents, a plain count has enough lines and enough alternatives that a detail has nothing left to add; or the details carry little in this model at all.

- Arms: `score-1`, `domain`, `reason`, and `tool` (domain and reason, no proof), which is what `arp_pulse` computes today, since nothing sets `proven`. Round 1 did not run it.
- Worlds: skills 5, 10, 30, by agents 50, 200, 1,000, `base` otherwise. Then the same with `good-need`, where the skills that need something are the better ones: 80% of skills in the top half of quality need something, none below. 300 worlds per cell.
- Also the ceiling, the best rate an agent could reach with perfect knowledge, so a flat result can be read as saturated or not, and success for agents who can supply what they are told failed for.
- **Reading.** 18 cells per arm: a gain of at least 2 points with an interval excluding zero is reported as "a condition worth testing", never as shown useful. With this many cells, about one in twenty intervals excludes zero by chance.
- No weight is changed, whatever comes out.

## 6. What round 2 showed

`bun run scripts/measure/signal-sim.ts --round 2`, 300 worlds per cell, `data/measurements/signal-sim2-2026-11-05.json`. Exploratory, so it does not change §4. `tool` is what `arp_pulse` computes: domain and reason, no proof.

| World | Skills, agents | Ceiling | `score-1` | `domain` | `reason` | `tool` |
| --- | --- | --- | --- | --- | --- | --- |
| `base` | 30, 1,000 | 87.8% | 77.8% | +0.7 [-0.1, 1.4] | +0.1 [-0.5, 0.7] | +0.4 [-0.4, 1.1] |
| `base` | 5, 1,000 | 72.2% | 63.9% | +0.7 [0.0, 1.3] | +1.0 [0.5, 1.4] | +1.0 [0.4, 1.7] |
| `good-need` | 10, 50 | 78.8% | 54.4% | -0.4 [-2.0, 1.3] | +1.6 [0.7, 2.6] | +2.1 [0.5, 3.7] |
| `good-need` | 30, 50 | 86.5% | 55.3% | +2.1 [0.4, 3.9] | +1.8 [0.5, 3.0] | +2.1 [0.3, 3.9] |
| `good-need` | 30, 200 | 86.6% | 62.6% | +1.2 [-0.1, 2.5] | +2.7 [1.6, 3.9] | +3.0 [1.8, 4.3] |
| `good-need` | 30, 1,000 | 86.5% | 71.7% | +0.8 [0.0, 1.7] | +1.1 [0.2, 2.0] | +1.5 [0.6, 2.3] |

The other 12 cells are in the raw output.

- **Saturation is not the explanation.** `score-1` stays 8 to 31 points under the ceiling in every cell, so there was room to gain, and the details did not take it in `base`.
- **A condition worth testing: the good skills are the ones that need something.** `reason` is above `score-1` in all 9 `good-need` cells, and its interval excludes zero in 8. It reaches the 2-point bar in one (`tool` in three, `domain` in one). In `base` the 9 cells show no such pattern, `reason` going from -0.5 to +1.0, with its interval excluding zero in the two cells of 5 skills and 200 or 1,000 agents (+0.8, +1.0).
- **What §5 called success for agents who can supply what they are told failed for** is measured more broadly by the script: agents holding anything some skill in the world needs (`canSupply` in the raw output). `reason` there goes from +1.3 to +3.6 in `good-need`, its interval excluding zero in all 9 cells, and from -0.2 to +1.8 in `base`.
- **Why that condition makes sense:** a plain count sinks a good skill for everyone because some agents lacked a key. If alternatives without needs are as good, nothing is lost, and only when they are worse does the reason pay. Whether real skills look like that was not measured. A lead can start from `data/measurements/skill-requires-2026-11-04T1046.json`, which holds what real skills ask for, and not how good they are.

## 7. The reading

1. **What the logic clearly gains is reading declarations at all:** `score-1` is 14 to 22 points above `search` in `base`, `all` and `sparse`, 7 under `liars` and 11 in `control-flat-domains`. It depends on the search's noise, set at 0.3 and never varied. That is task 64's result again, in another invented world.
2. **The reason is not shown useful. Where the good skills need something it is a condition worth testing**, in §5's words: +0.6 to +2.7 across the 9 cells, 2 points in one. Elsewhere it does little, and it costs 1.0 when half the reasons are redrawn at random, which leaves about 37% of them wrong.
3. **Domain proximity is not shown useful**, on the one pair the world holds. It stays on form B's merit, that a result belongs to its domain, which the simulation does not test: a sibling line would read the same here.
4. **A proof weight of 2 is a risk.** Real lines could not reach it, since nothing sets `proven`: latent. By the user's decision it is 1 (§10).
5. **The worlds were written by the author of the logic.** `good-need` is a world built after seeing that `base` was flat. `tool`, what `arp_pulse` computes, was not run under `liars`, so nothing here says what liars do to the live tool.
6. **"Written before it ran" rests on the author's word.** §3 and §5 were not committed before the runs, since nobody had asked for a commit. File times fit the order and prove nothing.

## 8. Checks on real data

`bun run scripts/measure/pulse-lines.ts`, raw output `data/measurements/pulse-lines-*.json`, on 13579, holding no key. The reader returns `cut-silences` as one nested line, `video`, `failed`, `missing-key`, although that use is written in both forms, and both `video-editing` lines as form A in `video`. 5 outcome lines: 1 in form B, 4 in form A, and one position size across all of them. Writing form B through `prepareUsageContext` has not been run on chain, only planned in tests: the walk that wrote form B used `scripts/demo/pulse-nested-walk.ts`.

## 9. What the review changed

`intuition-integrator`, 2026-11-05, first pass FAIL. Call order and the isolation of the score from others' lines passed, the second by reading and by `eth_call`: nobody can deposit into a position for somebody else unless that account approved them.

- **A wallet that did not write T1 pays for lines that do not count. Reachable today.** The treasury wrote 31 of 185 `uses` edges on 13579. **Warned, not solved:** `arp_declare_used` now returns `lines_count_only_for_their_writer`, compared with `declarer` when given and for the signer to compare otherwise. Counting a position on T1 as a second declarer is the user's decision. `edgeWriterWarning` and `readEdgeWriters` are tested, and so are the handler's refusals of a reason. The plan's path on 13579 is not, since the test server runs on 1155, where a qualifier is refused.
- **The index caps a nested `positions` at 100 without saying so**, so a declarer's deposit could be missed on a line with over 100 holders. Latent. Fixed for any real case: the query asks only for the declarers. The cap still applies among them, so 100 wallets that each wrote a `uses` edge in the same read and each hold the same line could cut one, with no flag. Checked live on 13579: a holder outside the first 100 of 14,503 is found.
- **A larger `limit` could never report a cut.** Latent, no caller passes one. Clamped to the cap.
- **`arp_pulse` dropped `truncated` on a tool with no line left.** Latent. Fixed.
- **`failures_that_do_not_apply` counted lines, not wallets.** Fixed. The score was not affected.

**Still open, all latent:** the cap of 250 is one budget per query, shared by a whole search, so about 250 junk triples can cut other tools' real lines: the flag says so, and the score still computes on what is left. The closed words are checked on labels, so a wallet could use another atom labelled `failed`, on its own lines only. `findDeclaredTools` has no standing check, so a stranger's context can pull a tool into the candidates, at the floor prior with no line counted. The caps, and the checksummed addresses the query's filter relies on, were seen on the testnet index only. An edge not yet indexed gets no warning, and `readEdgeWriters` is capped at 250 tools in one call. Second pass PASS, then two gaps in the warning fixed (no warning without `declarer`, and wording).

**`task-verifier`, first pass FAIL**, on the wording above and these: figures were corrected, §4 now carries the weight checks, and §5's `canSupply` is reported with its real definition. `signal-sim.ts` no longer overwrites its raw output: each run writes a file named to the minute. "ARP composes no score" is scoped to the surface that says it, in `serialise.ts`, `server.ts`'s comment and four code comments, since `arp_pulse` orders on one. "ARP rates nobody", in `tools.ts` and `server.ts`, stays: a score ranks a search and says nothing of an agent. Whether those words still hold is for the task that ships the score beyond this branch (ADR `0137`).

## 10. The two decisions after the verification

The proof's weight and the first form of the position rule were validated by the user, relayed by `arp-f3`. The final form of the position rule, « A », came from the user directly.

**A proof weighs 1.** `SIGNAL_WEIGHTS.proven` is 1. `signal-sim.ts` keeps its own `TESTED` at 2, so §4 and §6 stay what they were run on, and a re-run of round 1 is byte-identical to its raw file. `tool` never used this weight. It gives up the +4.5 of `proof` alone against liars without receipts.

**A position on T1, with a detail, declares.** A first form counted every holder. `intuition-integrator` measured what that did (`bun run scripts/measure/line-cost.ts`, 13579, small vaults): the wallet count would change on 9 tools, one from 1 to 16 with no result written, and "Support is a different act from a declaration", sent to every agent, would become false. The user answered « A »: a wallet declares by writing T1, or by holding a position on it and standing behind a domain or a result on it. A position alone stays support.

`getPulseUsage` reads T1's holders, and `declarations` has one row per declaring wallet and edge, each with its own lines and reasons. With a domain or an outcome, a plan given a `declarer` who did not write the edge, or whose edge the index does not yet show, deposits on it first. Without `declarer` it returns `lines_count_for_their_declarers`, replacing the warning of §9. A plain declaration on an existing edge plans nothing, as before, so it declares nothing for a second wallet. **Not tested on chain, and the simulation does not model it**, since each of its wallets writes one line.

**The cost, accepted on testnet and blocking for mainnet.** The user accepted that proposal, made with this figure, relayed by `arp-f3` on 2026-11-05. `docs/27` §2 lists it, with `0135`'s proof that a writer controls the agent, as things a mainnet launch has to answer; that file is untracked and holds other sessions' work, so it is not in this task's commit. A line held on deposits loses 0.0000199 tTRUST per level on a round trip, against 0.001 tTRUST to create that level, about 50 times less. One wallet can write `failed` and others can pile on, with `wallets` rising and `agents` not. Mainnet and larger vaults were not read. A qualifier row reaching 100 positions through other edges' holders now sets `truncated`.
