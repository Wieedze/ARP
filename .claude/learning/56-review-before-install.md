# 56 — Review before install: a pinned version, a page of facts, and a human who accepts

**Task:** `docs/tasks/61-review-before-install.md` (A, C, D, E; B deferred by the user)
**Completed:** 2026-11-03
**Commit:** `48ea55f`, `db432b2`, `11095c1`, `cc2c010`, `a5fe9f6`, `fdc20f6` on `feat/61-review-before-install`
**Verifier verdict:** PASS (second round; round 1 FAIL)

## What shipped

- `data/catalogue/skill-pins-13579.json` + `scripts/build/build-skill-pins.ts` — 31 of 31 repositories pinned at the catalogue's `recordedAt`.
- `packages/protocol/src/content-serve.ts`, `content-bundle.ts` — listing and bytes read at the pin; `unpinned` refusal, never `HEAD`.
- `packages/protocol/src/receipt.ts` — receipt v2 names the commit (domain version 2); v1 still verifies; a dropped or swapped commit is a mismatch.
- `packages/protocol/src/skill-review.ts` — counts and lines for a fixed pattern list, no label; `renderSkillPrompt` sized for the terminal dialog.
- `apps/mcp/src/client-session.ts` — elicitation request, 15-minute bound, `stdioRouter`; `apps/mcp/test/client-session.test.ts` (14 tests).
- `apps/mcp/src/desktop/skill-gate.ts`, `loop.ts` — writes only on an explicit accept with the box ticked.
- `scripts/measure/elicitation-probe.mjs`, `scripts/measure/skill-paths-at-pin.ts` and their outputs in `data/measurements/`.
- ADR `0127`; `docs/22`, `docs/26`, `apps/cli` help, `STATE.md` row.

## Surprises

- A model answers a `/dev/tty` prompt through `script -qec`, so a CLI confirmation is not a lock. Built and removed.
- Claude Code in VS Code declares elicitation and auto-declines (`anthropics/claude-code#98256`); `claude -p` answers `cancel`.
- A 75-line facts page did not fit the dialog; the full list went behind a link at the pinned commit.
- The pins changed none of the path counts: 521 resolved / 139 absent / 2 ambiguous at the pins, as at `HEAD` on 2026-10-29.

## Decisions made

- **Elicitation is the only gate; refusal keeps nothing; no ARP off switch.** ADR: `.claude/choices/0127-a-person-accepts-a-skill-and-the-question-has-no-off-switch.md`.
- **Pin = newest commit GitHub dates at or before `recordedAt`** (committer date, stated as a limit). ADR `0127`.
- **Pattern counts ship, raw, with their regexes**; no weighting. ADR `0127`.

## Rules touched

- `.claude/rules/claims.md` — sufficient; round 1 failed on check 5 (a stale ADR number, `0124`, in two code comments; "Eight refusals" and "at HEAD" left in `docs/22`) and on "commit the script" (the probe lived only in the scratchpad).
- `.claude/rules/code.md` — sufficient; round 1 failed on untested gate code and an export left behind by a removed consumer.

## Suggestions for future tasks

- When a feature is built then removed, grep for its consumers' leftovers (exports, task-file plan text) in the same commit.
- Pick an ADR number only after fetching origin/dev; reserve it before citing it in code comments.
- Put any interactive-client probe in `scripts/measure/` from the start; a scratchpad log is not evidence.

## Evidence ladder

**Which tier of the evidence ladder does this serve, and does it move ARP up it?**

Tier 3 (staked): the pin fixes what a position on a skill backs to one commit's bytes until it is re-listed, which makes staking on skills honest; showing the installer how much stands behind those bytes waits on B, so the move is partial.
