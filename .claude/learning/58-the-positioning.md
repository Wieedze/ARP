# 58 — The positioning, part 1: what ARP says in public

**Task:** `docs/tasks/69-the-positioning.md`
**Completed:** 2026-11-05 (part 1 only)
**Commit:** `uncommitted` (branch `feat/pulse`, the user's instruction: nothing is committed before their reading)
**Verifier verdict:** PASS on the fourth pass, which checked only the two edits the third pass asked for. The other items are carried from earlier passes and were not re-audited.

## What shipped

- `docs/30_THE_POSITIONING.md`, `.claude/choices/0142-the-message-is-not-the-argument.md` — the public message and signature, and what may be claimed today.
- `README.md`, `skills/arp/SKILL.md`, `apps/mcp/README.md`, `apps/cli/scripts/packages.ts` and what it generates — the new wording.
- `scripts/measure/line-writers.ts`, `data/measurements/line-writers-2026-11-05T1734.json` — the check for the claim that will expire. On 13579, at that run: 5 of 5 result lines from our two wallets, 146 of 185 `uses` edges from other wallets.

## Surprises

The last two defects were both in sentences about what a figure is. `skills/arp/SKILL.md:439` had to cover a fact read from elsewhere (skills.sh installs) as well as what somebody declared or deposited, and the header of `line-writers.ts` had to say where "our two wallets" come from.

## Decisions made

- **The public message is kept apart from the argument for partners.** The argument stays out of this repository and `ARP-business-dev`, as both are public. ADR: `.claude/choices/0142-the-message-is-not-the-argument.md`.
- **"A bigger deposit buys no rank", not "rank is not for sale".** Several wallets can still buy several lines. Same ADR; the user can change it on reading.

## Rules touched

- `.claude/rules/claims.md` — sufficient. Check 6 applies to `line-writers.ts`: the claim in `docs/30` ships with its command.
- `.claude/rules/workflow.md` — sufficient.

## Suggestions for future tasks

- A list of wallets called "ours" in a script names the record it comes from. Here that is the `signer` field of `data/measurements/pulse-walk-2026-11-05.jsonl`, which holds both.
- Rerun `line-writers.ts` before repeating "no third party has reported a result": the claim expires with the first such line.
- Open for later parts of task 69: the sites `docs/30` lists as still to do keep the old wording. `packaging/claude/arp/bin/hook.js` moved in this regeneration and is committed with task 68.

## Evidence ladder

**Which tier of the evidence ladder does this serve, and does it move ARP up it?**

Tier 3, staked: the public text stops implying that third parties have staked on results, and it does not move ARP up.
