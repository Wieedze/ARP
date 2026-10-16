# Task 13 — `code.md` requires a test tool the repo does not have

> **Status: NOT STARTED** (specified 2026-09-17). Found by `task-verifier` closing Task 12.

## The finding

`.claude/rules/code.md:86` says:

> Hooks and components: tested behaviorally, not by checking implementation details. **React Testing
> Library or equivalent**, not enzyme-style snapshots.

`app/vitest.config.ts` sets `environment: "node"`. There is no testing-library anywhere in the tree.

So the rule is **unsatisfiable as written**, and has been silently not applied for the life of the
project. Nobody broke it; it was never applicable. That is worse than a violation, because a rule
nobody can follow stops being read.

It surfaced because Task 12 shipped a keyboard handler — `handleKeyDown`, index arithmetic with
wraparound on two axes plus Home/End — covered by inspection only. The tab _model_ is tested at the
service layer, which is what the spec asked for and the right place for it. The ARIA wiring and the
key handling are covered by nothing.

## The decision to make

Either:

- **Make the rule true.** Add jsdom + a testing library, and accept that component tests become
  expected from here on. Cost: a dependency, a second vitest environment, and the discipline to keep
  them.
- **Make the rule honest.** Narrow it to what the repo actually does — logic in services, tested
  there; components reviewed rather than unit-tested — and say so, so nobody reads a promise the repo
  does not keep. ADR `0011` already narrowed app test scope to services once; this may be finishing
  that thought rather than reversing it.

Neither is obviously right. It depends on whether component behaviour is going to keep carrying
weight, and after Task 12 it does: a tab strip whose keyboard navigation is wrong is broken for
everyone using a keyboard, and nothing in the suite would say so.

## Required

Per `CLAUDE.md`: a rule does not change silently. Whichever way this goes, it is an edit to
`.claude/rules/code.md` **and** an ADR recording why, cross-linked from
`.claude/learning/13-agent-panel-tabs.md` where it was found.

## Out of scope

Retrofitting tests to every existing component. If the rule becomes true, it binds new work; deciding
what to backfill is a separate call.
