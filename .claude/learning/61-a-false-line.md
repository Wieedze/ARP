# 61 — A false line, and a line the plugin can write

**Task:** `docs/tasks/71-a-false-line.md`, and `docs/tasks/70-the-local-package.md` items 1 and 3
**Completed:** 2026-11-05
**Commit:** `1ca3c27` (branch `feat/agent-pulse`, not pushed). The work is `d4ff324`, `ba66d0d`, `d590849`, `781f9e7`, `ced1b29`, `1ca3c27`
**Verifier verdict:** PASS (second pass; the first failed on six blocking and five minor items, all closed). Item 1's done-when stays open: `marketplace add` and `install` have not run, and task 70 says so

## What shipped

- `apps/sponsor/src/routes/line.ts`, `packages/protocol/src/sponsor/line.ts` — `POST /line`: one form B line on testnet 13579, no proof of use, under daily caps and the shared budget.
- `apps/sponsor/src/categories.ts` — `lineSubjectCheck`: a sponsored line is about a GitHub URL only.
- `apps/mcp/src/line.ts`, `apps/cli/src/cli.ts` — `arp line` holds the agent key for one call, so the plugin's server stays read-only.
- `packages/protocol/src/pulse-usage.ts` — `payers`, required: the service's wallet says nothing by paying.
- `packages/protocol/src/pulse-score.ts` — `WALLETS_TO_MOVE`, 3, and `pulse-score-3`.
- `data/measurements/signal-sim3-2026-11-05T1827.json`, `pulse-eval5-2026-11-05.jsonl` — the threshold's cost in invented worlds, and the reading test, $2.35.

## Surprises

- **The threshold costs more than it saves in the simulation.** 10 of 15 cells lose with an interval below zero, and 2 of 9 false-wallet cells gain. The user's choice stands; this harm is not one those worlds weigh.
- **Whether one false line still moves choices is open.** 8/15 to 1/15 clears the rule by 0.3 of a point, but the search order shifted (first in 9/15 against 4/15) and an arm with no line on the favourite chose it 5/15, which overlaps.
- **The power statement written before the runs was wrong.** It said only 0/15 could separate from 8/15, and 1/15 does. It stays, with a dated correction beside it.
- **A rule written in advance could not hold:** the order is not fixed across runs, 5 orders in 15 runs of `S`. It was replaced 5 seconds before the treatment arms launched (session log: freeze 18:44:03 UTC, launch 18:44:08 UTC), and that is not visible in git.
- **The first check on a line's subject passed every agent.** 36 of 36 `Agent 13579:*` atoms have a URL, on `8004scan.io`, so "has a URL" was no gate.
- **A correction landed in one place again.** §3 had two false-wallet gains right while ADR `0143` said one, and `docs/28` kept a sentence round 3 had made false.

## Decisions made

- **The ranking moves from three wallets** — design 1, the user's choice, relayed by `arp-f3`. ADR: `.claude/choices/0143-the-ranking-moves-from-three-wallets.md`.
- **A sponsored line asks no proof of use, and its key stays out of the plugin's server** — "oui aux 3", relayed by `arp-f3`. ADR: `.claude/choices/0144-a-sponsored-line-asks-no-proof.md`.
- **Three questions stay with the user:** whether adding a skill to the candidates needs the threshold, the treasury cost of a line, and how a line below the threshold is shown.

## Rules touched

- `.claude/rules/security.md` — one new row and a tenth signature site, both accurate.
- `.claude/rules/claims.md` — sufficient. Checks 1, 4 and 5 are what the first pass found broken.
- `.claude/rules/code.md` — sufficient. It caught the untested `lineSubjectCheck`.

## Suggestions for future tasks

- Commit a freeze before launching the next arm, so the order can be read from git.
- When arms share a skill, report its share in every arm: the second baseline here changed the reading.
- Compute what a sample can separate rather than estimating it. Here that was one line of Wilson arithmetic.
- Put a measurement's chain facts in a script: T1 to T4's creator and positions are read by hand, and `pulse-lines-*.json` does not hold them.

## Evidence ladder

**Which tier of the evidence ladder does this serve, and does it move ARP up it?**

Tier 3, staked: it makes a line reachable from one install, and it moves ARP up only when somebody else writes one, which nobody has.
