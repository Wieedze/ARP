# 0001 — Claude meta-architecture: rules/skills/agents/learning/choices

**Status:** Accepted
**Date:** 2026-05-19
**Triggered by:** User request for a structured operating layer that enforces code rules, OOP, layer separation, mandatory task verification, and proper use of global Trail of Bits and Ethereum skills.

## Context

The original `CLAUDE.md` mixed routing (read order, skill loading) with rules (no `any`, no emoji, conventional commits, etc.) in a single ~90-line file. As rules grew, this approach had three problems:

1. **Context pollution.** Loading `CLAUDE.md` for any task loaded every rule, even rules that didn't apply (UI rules during a contract task, Solidity rules during a UI task).
2. **No verification loop.** Rule compliance was implicit. A task could ship in violation of multiple rules with no checkpoint.
3. **No memory.** Decisions made during one task were not recorded for the next. Surprises and post-mortems lived in chat history and disappeared.

The user requested a structure with five top-level layers: rules, skills, agents, learning, choices. Each layer must exist from day one (skeleton + templates) and grow during development (entries added as work is done).

## Decision

The repo's `.claude/` directory now holds:

| Layer | Purpose | Lifecycle |
|---|---|---|
| `rules/` | Domain-split rules (code, solidity, ui, security, workflow). Loaded on demand. | Stable, edited when a feedback loop reveals a missing guardrail. |
| `skills/` | Project skills (ARP). Composes with global skills (`ethskills`, Trail of Bits suite, `intuition-protocol`). | Stable, edited when the project evolves. |
| `agents/` | Verification and review subagents (task-verifier, contract-reviewer, ui-reviewer, intuition-integrator). | Stable, edited rarely. |
| `learning/` | Append-only post-mortems, one per completed task. | Grows during development. |
| `choices/` | Append-only ADRs, one per non-obvious decision. | Grows during development. |

`CLAUDE.md` becomes a router: it maps task types to rules + skills + agents to load, and contains no rules itself.

A mandatory `task-verifier` agent runs at the end of every task. It reads the task spec, the relevant rules, the produced deliverables, and returns pass/fail. On pass, it writes a post-mortem to `learning/`. Tasks are not complete until the verifier returns pass.

## Alternatives considered

- **Keep the monolithic `CLAUDE.md`.** Rejected — does not solve the context pollution or verification problems.
- **Single `rules.md` file split by section headers.** Rejected — still loads all rules into context for any task. Splitting by file lets each task pull only what's relevant.
- **One generic reviewer agent instead of specialized ones.** Rejected — `contract-reviewer`, `ui-reviewer`, and `intuition-integrator` each need different procedural knowledge (Trail of Bits checklist for contracts, design language for UI, atom/triple semantics for Intuition). A single agent would be a watered-down version of all three.
- **Use a hook (PostToolUse / Stop) for verification instead of an agent.** Rejected — hooks are rigid and operate without LLM reasoning. A `task-verifier` agent can spot-check rule compliance with judgment, which a regex-based hook cannot.

## Consequences

**Positive:**
- Each task loads only the rules it needs. Cleaner context, faster reasoning.
- Verification is a mandatory checkpoint, not an honor system.
- Decisions and lessons accumulate in `choices/` and `learning/`, giving future-Claude (and the user) a durable record.
- Rules and ADRs are linked — no rule change happens silently.

**Negative:**
- More files to maintain. The skeleton must be kept in sync (e.g., `00-INDEX.md` updated when a new rule is added).
- The `task-verifier` adds a step at the end of every task. Worth the cost in exchange for guaranteed rule compliance, but it is a step.
- Subagents incur extra token cost vs. inline verification. Acceptable given the prestige-quality bar of the MVP.

**Neutral (worth knowing):**
- The global skills referenced (`ethskills`, the Trail of Bits suite, `intuition-protocol`) live in `~/.claude/skills/` and are managed outside this repo. Their names must be kept in sync if they're ever renamed globally.
- This ADR documents the meta-architecture itself, not any project decision. It exists so the rationale isn't lost.

## References

- Rules: `.claude/rules/00-INDEX.md`
- Agents: `.claude/agents/task-verifier.md`, `contract-reviewer.md`, `ui-reviewer.md`, `intuition-integrator.md`
- Templates: `.claude/learning/TEMPLATE.md`, `.claude/choices/TEMPLATE.md`
- Router: `CLAUDE.md` (rewritten in this same change)
