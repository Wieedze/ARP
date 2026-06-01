# .claude/ — Claude operating layer for ARP

This directory configures how Claude works on this repository. It is **not** project specification (that lives in `docs/`). It is the meta-architecture: rules, skills, agents, learnings, and recorded choices.

## Structure

```
.claude/
├── rules/        Domain-split rules (code, solidity, ui, security, workflow)
├── skills/       Project skills (currently: arp/)
├── agents/       Verification and review subagents
├── learning/     Post-mortems written after each completed task
└── choices/      Architecture Decision Records (ADRs)
```

## How the layers interact

1. **`CLAUDE.md`** (repo root) is a router. It maps task types → rules + skills + agents to load. It contains no rules itself.
2. **`rules/`** holds the actual rules, split by domain so each task loads only what is relevant.
3. **`skills/`** holds procedural knowledge: `arp/` (ARP-specific), `intuition/` (Intuition protocol — vendored), `mms-*` (MetaMask Smart Accounts Kit + gator CLI — vendored). Composes with global skills (`ethskills`, Trail of Bits suite).
4. **`agents/`** are subagents invoked via the `Agent` tool. The `task-verifier` agent is mandatory at the end of every task.
5. **`learning/`** is append-only. Every completed task produces one post-mortem.
6. **`choices/`** holds ADRs. Every non-obvious decision is recorded.

## Implementation discipline

- The skeleton (rules, agents, README, templates) is in place from day one.
- `learning/` and `choices/` grow during development — one entry per task / decision.
- Rules are updated when a feedback loop reveals a missing guardrail. Update the rule file, log the change as an ADR.

## Reading order for a new task

```
CLAUDE.md
└── tasks/NN-*.md
    ├── docs referenced
    ├── .claude/rules/* (only those that match the task type)
    ├── global skills listed in the task
    ├── .claude/skills/arp/SKILL.md
    ├── .claude/choices/* (search for relevant ADRs)
    └── .claude/learning/* (search for prior post-mortems on similar work)
```

Loading the wrong layer (e.g., all rules instead of just the relevant ones) wastes context and dilutes focus. Match the layer to the task.
