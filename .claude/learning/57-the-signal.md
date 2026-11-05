# 57 — The signal: what a line on chain is worth to the next search

**Task:** `docs/tasks/66-the-signal.md`
**Completed:** 2026-11-05
**Commit:** `uncommitted` (branch `feat/pulse`, the user has not asked for a commit)
**Verifier verdict:** PASS (third pass; the second and third checked only the changed sites). §10, added after that: FAIL on four record fixes, then PASS on the fifth pass, which checked only those sites

## What shipped

- `packages/protocol/src/declare/usage-context.ts`, `apps/mcp/src/handlers/declare.ts`, `apps/mcp/src/tools.ts` — form B writing, a closed reason, and a warning when another wallet wrote the edge.
- `packages/protocol/src/pulse-usage.ts`, `packages/graphql/src/queries/pulse-usage.ts` — the reader: form B, the reason, and the 4 form A lines on 13579.
- `packages/protocol/src/pulse-score.ts`, `apps/mcp/src/handlers/pulse.ts` — `pulse-score-2`: a line's weight from domain, reason and proof, and the amount never read. `constraints.can_provide`.
- `docs/28_THE_SIGNAL.md` — the schemas and what each part is worth in simulation.
- `scripts/measure/signal-sim.ts`, `scripts/measure/pulse-lines.ts` — with raw outputs in `data/measurements/`.

## Surprises

- **By the rule set in advance, no detail is shown useful.** No detail gains 2 points in `base`. The reason is only a condition worth testing, +0.6 to +2.7 in an exploratory world built after `base` came back flat.
- **The proof weight pays whoever fakes a receipt**: `score-2` -20.0 [-22.3, -17.7] under `liars-proven`. Latent, since nothing sets `proven`.
- **The raw files were never the problem.** A re-run was byte-identical and every table cell matched. All the errors were in sentences written from the tables: a range that stopped at 25 with 31.2 printed in the table, 7 for 8, and "half wrong" for about 37%.
- **The `reason` control could only catch a wiring fault.** With no needs, that arm is `score-1` by construction, so its exact zero says little.
- **Two defects came from corrections.** Fixing §3's domain count added an unmarked post-run sentence to a section headed "written before it ran". Adding conditions to `docs/28` produced "14 to 22 with honest wallets", false for `control-flat-domains` (+11.2). `claims.md` already warns of this.

## Decisions made

- **Form B, four closed reasons, money does not weigh, weights as first guesses** — the user's decisions. ADR: `.claude/choices/0138-a-line-is-form-b-and-money-does-not-weigh.md`.
- **Warn, do not solve, when a wallet that did not write T1 pays for lines that will not count** — reachable today (31 of 185 `uses` edges on 13579 are the treasury's). Whether a position on T1 makes a second declarer is left to the user.
- **"ARP rates nobody" stays in `server.ts` and `tools.ts`** — the coordinator's decision, disclosed in §9, for the task that ships the score beyond this branch. Not an ADR.

Open for the user at the third pass: the proof weight, and a position on T1. Both were answered in §10, below.

## After the verification: §10

**How the decisions reached the verifier.** All of them were relayed by the coordinating session; the verifier saw none from the user directly. By the coordinator's account and `docs/tasks/66` §10, `arp-f3` relayed the proof's weight and the first form of the position rule, and « A » came from the user directly.

- **A proof weighs 1** — `SIGNAL_WEIGHTS.proven` is 1. `signal-sim.ts` keeps `TESTED` at 2, so §4 and §6 stay what they were run on. Round 1 re-ran byte-identical. Round 2 was not re-run.
- **A wallet declares by writing T1, or by holding a position on it and standing behind a domain or a result on it** — a position alone stays support. The first form, every holder, was rejected on a measurement: the wallet count would change on 9 tools on 13579, one from 1 to 16 (`scripts/measure/line-cost.ts`). ADR: `.claude/choices/0138-a-line-is-form-b-and-money-does-not-weigh.md`.
- **Not tested on chain, and the simulation does not model it.** Mocked transport only.
- **Not decided: the cost of a line held on deposits.** On 13579, in small vaults, a round trip loses 0.0000199 tTRUST per level against 0.001 tTRUST to create one, about 50 times less. It was proposed as acceptable on testnet and blocking for mainnet, and « A » did not address it. `docs/28` holds a mainnet port until it is answered. Mainnet and larger vaults were not read.
- **What a deposit now allows.** Any wallet that deposits on another's use can have `failed` counted against that agent's use, under its own wallet (ADR `0138`).
- **Live read, 13579, 2026-11-05:** 0 of 81 tools change wallet count against distinct edge creators. Both sessions read this with ad hoc scripts, none committed, so re-derive it before citing it.

**The fourth pass failed on the record, not the code.** A cost was written as "accepted" with no source, because a proposal was read as approved when the answer given was about something else. The blocker also missed the mainnet checklist.

**Commit scope.** `docs/27` is untracked and holds other sessions' work, so it stays out of this task's commit, along with `packaging/claude/arp/bin/hook.js` and the other sessions' `apps/hook` and `apps/cli` work. Their `skill-failure.ts` imports `type UsageReason` from task 66's export, so task 66 lands first. Whether task 66 alone leaves `packaging/` current was inferred from the bundle diff, and the coordinator runs the check on a clean checkout after the commit.

## Rules touched

- `.claude/rules/claims.md` — sufficient. Check 5 caught "ARP composes no score" still shipping in `serialise.ts`, and the warning about corrections applied twice.
- `.claude/rules/workflow.md` — sufficient.
- `.claude/rules/code.md` — sufficient. A handler branch was first called untestable while `server.test.ts` already reached that handler.
- `.claude/rules/portability.md` — sufficient. Qualifiers stay refused off 13579, and the test server runs on 1155, so the plan's path on 13579 is not exercised.

## Suggestions for future tasks

- Commit reading rules before running, as `d3fdbfa` did. Here "written before it ran" rests on the author's word (§7.6).
- Mark any later edit to a pre-registered section where the edit sits.
- Run `tool`, what `arp_pulse` computes, under `liars` before citing what liars do to the live tool. It has never been run there.
- When a range is written from a table, compute it from the raw file over all cells, not from the rows shown.
- Record a decision with who gave it and what question it answered. An answer does not cover the other proposals sent with it.
- When a decision blocks mainnet, add it to `docs/27` §2 in the same pass.
- Measure whether real skills look like `good-need`. `data/measurements/skill-requires-2026-11-04T1046.json` holds what they ask for, not how good they are.

## Evidence ladder

**Which tier of the evidence ladder does this serve, and does it move ARP up it?**

It serves the staked and proven tiers only indirectly, by deciding what a paid line does to a search, and it does not move ARP up, since nobody outside ARP writes lines yet and no proof is read.
