# 58 — The positioning, parts 1 and 2: what ARP says in public

**Task:** `docs/tasks/69-the-positioning.md`
**Completed:** 2026-11-05 (parts 1 and 2)
**Commit:** `uncommitted` (branch `feat/pulse`, the user's instruction: nothing is committed before their reading)
**Verifier verdict:** part 1, PASS on the fourth pass, which checked only the two edits the third pass asked for. Part 2, PASS on the re-check of the six fixes the previous pass listed; its other items are carried from that pass and were not re-audited.

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
- Open for later parts of task 69: the deposit scenes `docs/30` lists as not changed keep their wording until the user decides on a redesign. `packaging/claude/arp/bin/hook.js` moved in this regeneration and is committed with task 68.

## Part 2

The user's « fais tout ça »: the server's instructions, the sponsored tool's text, the landing page's headline, label and five scene sentences, `docs/01`, `docs/12`.

- **The user corrected the direction during the part: add and refine, do not replace.** `README.md` got back Find, Use and Vouch, with the 40 of 42 figure and its 26 of 42, and `docs/01` its one-liner.
- **Re-derived on the re-check.** `discovery-eval.ts --summarise` on `data/measurements/discovery-eval-install-2026-11-02-recheck.jsonl`: 14 needs, 40 of 42 with ARP, 6 of 42 without, 0 of 42 invented in each arm, 26 of 42 pairs for the answer without ARP. 521 of 662 is in `docs/tasks/31`. The three pages `docs/01` cites for Tessl, Anthropic's directory and Bhived were fetched on 2026-11-05 and say what it says.
- **Suggestion:** when a positioning rewrites a page, carry over its figures and its caveats first. Dropping them is what the user had to correct here.

## Evidence ladder

**Which tier of the evidence ladder does this serve, and does it move ARP up it?**

Tier 3, staked: the public text stops implying that third parties have staked on results, and it does not move ARP up.
