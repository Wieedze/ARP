# learning/ — Task post-mortems

Append-only. Every completed task produces exactly one entry here, written by the `task-verifier` agent on a pass verdict.

## Why this exists

- To capture **what was non-obvious** about a task once it's complete. Future-Claude (or future-Maxime) reads these before starting similar tasks.
- To capture **what nearly went wrong** — surprises during implementation, dead ends pursued, refactors that didn't pay off.
- To capture **rules that should change** — if a task surfaces a missing or wrong rule, the post-mortem records it and an ADR follows.

## What goes in a post-mortem

See `TEMPLATE.md`. Five sections:

1. **What shipped** — concrete deliverables.
2. **Surprises** — what was different from expectation.
3. **Decisions made** — non-obvious choices, with reasoning. Cross-link to ADRs in `.claude/choices/`.
4. **Rules touched** — which rule files this task exercised, and whether they were sufficient.
5. **Suggestions for future tasks** — what a future-Claude should do differently.

## What does NOT go in a post-mortem

- Narrative of the work in chronological order. "First I read the spec, then I…" — useless.
- Implementation details that are in the diff. Read the diff.
- Apologies. State the fact, not the feeling.
- Marketing-tone summaries. "Successfully shipped a beautiful contract" — gross.

## Naming

`NN-task-slug.md` where `NN` is the next sequential number and `task-slug` matches the originating task file.

Example: task `tasks/02-contract-mvp.md` produces `learning/01-contract-mvp.md` (if it's the first post-mortem).

## Updating the rules

If a post-mortem identifies a missing or wrong rule:

1. The post-mortem's "Rules touched" section flags it.
2. Edit the rule in `.claude/rules/`.
3. Write an ADR in `.claude/choices/` recording the change and linking the post-mortem.

Rules do not change silently.
