# 0044 — "Tool" is the one word on screen; two rule lines corrected

**Status:** Accepted
**Date:** 2026-10-20
**Triggered by:** user request — a coherence audit (`tasks/28`), then _"tool comme mot unique"_.

## Context

The same thing had four names, one screen apart: the nav and the list said "Modules", the call to
action said "Register a tool", the success line said "Module registered" with a "View tool →" link,
the detail page lived at `/tool/:id` under a "Module ID" label, and `docs/12` says "module" and
"methodology". In ERC-8004 plus MCP the tool is what an agent uses (`docs/14`), and the `uses` edge
names it that way (ADR `0030`).

The same audit found two rule lines that contradicted the rest of the repo:

- `workflow.md` gave "default Base Sepolia" as the deployment target, while `CLAUDE.md` and
  `security.md` say Intuition Testnet (ADR `0002`).
- `security.md` said "The MVP does **not** use signatures", while `IdentityRegistry.sol` verifies
  EIP-712 signatures, the app signs delegations, and import asks the operator for an EIP-712
  statement.

## Decision

**User-facing copy says "tool".** Identifiers are not renamed: the contract stays `ModuleRegistry`,
the route stays `/modules/new`, and types and hooks stay `Module`/`useModule`. Renaming those is a
code change with no effect on the reader, and the contract name is on chain.

The two rule lines are corrected in place: `workflow.md` now names Intuition Testnet 13579, and
`security.md`'s signature-replay section lists the three sites where signatures are used.

## Alternatives considered

- **"module" everywhere** — matches the contract, but not the `uses` edge or the tool page
  (`/tool/atom/:atomId`), which is the forward surface.
- **Rename identifiers too** — churn across app and protocol for no reader-visible gain; the
  contract name cannot change.

## Consequences

**Positive:**

- One word per concept across the nav, the list, registration and the detail page.

**Negative:**

- Code says `Module`, screens say "tool". Anyone reading both has to hold the mapping. This ADR
  records it.

**Neutral (worth knowing):**

- ~~`/hire` was left untouched: it is unfinished (user, 2026-10-20), so its copy will be written when
  `tasks/25` builds it.~~ — **deleted instead**, 2026-10-20: the user chose removal over finishing it.
- `docs/12` still says "module". It is canonical and was not reworded.

## References

- Related rule: `.claude/rules/workflow.md`, `.claude/rules/security.md`
- Related doc: `docs/12_THE_IDEA.md`, `docs/14_THE_WITNESS_PROBLEM.md`
- Related ADR: `0002`, `0030`
- Task: `tasks/28-coherence-audit.md`
