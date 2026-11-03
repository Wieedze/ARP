# 0122 — `docs/02` is authoritative on the storage principle only

**Status:** Accepted
**Date:** 2026-11-03
**Triggered by:** `docs/tasks/27` post-mortem (`.claude/learning/53-*`); the user's go-ahead
2026-11-03 on the open point "what `CLAUDE.md` does with `docs/02`".

## Context

`CLAUDE.md` ranked `docs/02_ARCHITECTURE.md` second among the sources of authority, as "locked
architectural decisions". Task 27 found it the stalest file in the list: its four components, SDK
shape and integration sections describe `ModuleRegistry` (deleted in `59ac83a`, ADR `0055`), a
`postFeedback` path ADR `0048` rejected, and `getScore` (ADR `0046`). Its header now says so. Only
the storage principle — one canonical source per datum, no dual-write — still holds.

## Decision

`docs/02` stays in the authority list, narrowed to the storage principle. `CLAUDE.md`, the
`arp-contributing` skill and the `intuition-integrator` agent say so where they cite it.

## Alternatives considered

- **Drop it from the list** — not chosen: the storage principle is still a constraint nobody else
  states, and dropping the file would drop it.
- **Rewrite `docs/02` to current architecture** — not chosen: `docs/12` and the ADRs already state
  it, and a third copy is the redundancy task 27 exists to remove.

## Consequences

**Positive:**

- An agent reading the router second no longer meets "locked decisions" on a deleted contract.

**Neutral:**

- ADR `0022` and `docs/09` still call `docs/02` "locked decisions, unchanged". Both are dated
  records; `docs/09`'s header already marks it as analysis.

## References

- Related doc: `docs/02_ARCHITECTURE.md`, `CLAUDE.md`
- Related ADR: `0022`, `0046`, `0048`, `0055`
- Post-mortem: `.claude/learning/53-the-prose-pass-against-the-positioning.md`
