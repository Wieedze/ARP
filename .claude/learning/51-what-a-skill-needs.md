# 51 — What a skill needs, shown to the agent before it picks one

**Task:** `docs/tasks/56-what-a-skill-needs.md`
**Completed:** 2026-11-03
**Commit:** `afbc0a3`, `8b1174a` (branch `feat/56-requires`)
**Verifier verdict:** PASS (second pass; first pass FAIL on claims)

## What shipped

- `scripts/helpers/skill-requires.ts` reads `cli` (`metadata.requires.bins`, `allowed-tools: Bash(<name> …)`) and the first body line mentioning a login. Tests: `scripts/test/skill-requires.test.ts`, 5 tests.
- `scripts/measure/skill-requires.ts` writes `data/measurements/skill-requires-2026-11-03.json`.
- `scripts/build/build-skill-requires.ts` writes `data/catalogue/skill-requires.json` (288 entries, rebuilt without a diff).
- `apps/mcp/src/handlers/find-tools.ts` adds `requiresFor`, spread into short and full results with no reordering. Test: `apps/mcp/test/requires.test.ts`.

## Surprises

- The 663 did not add up the first time: 522 read + 139 not located = 661. The other 2 were layout rows found at several paths with different content (caveman-stats, impeccable), which the script dropped without a word. A comment then said they were counted as `unread`, which was false.
- 156 of the 211 CLI declarations are `belt`: 26 skills, the same in six `superpowers` repos. All 156 files were checked to be identical on 2026-11-03, but no committed check exists, so the text says "same names, counted six times" instead.
- ARP's own SKILL.md is a `mentions_login` false positive ("You need no API key").

## Decisions made

- **Not re-measured after the fix**: ADR `0064` (one file per run). The 2 are documented in §5, and `counts.ambiguousDiffering` starts with the next run.
- **No YAML library**: each of the two fields comes in two shapes, and nothing else in the frontmatter is read.

## Rules touched

- `.claude/rules/claims.md`: enough. Check 2 (a denominator that must add up) and "commit the script, not the number" each caught one claim.
- `.claude/rules/code.md`: enough. The header comment that was wrong about `unread` was the same defect as the miscount.

## Suggestions for future tasks

- When a measurement filters its input, count each excluded class in `counts`, so the table adds up to the population by construction.
- A "copied byte for byte" claim needs a content hash per row in the measurement file, or it should not be made.

## Evidence ladder

It serves tier 1, asserted: it shows the author's own declaration with its source, promotes it to nothing, and does not move ARP up the ladder. It keeps task 54 from counting a skill that needs an account as a successful discovery.
