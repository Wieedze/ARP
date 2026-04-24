# CLAUDE.md — Operating instructions for this repository

You are working on the **ARP Module Registry MVP**. Before writing any code, read this file fully, then the docs and skills it references.

## Read order before starting any task

1. This file (you're reading it)
2. `docs/01_PROJECT_CONTEXT.md` — what ARP is, what it isn't, why this MVP exists
3. `docs/02_ARCHITECTURE.md` — locked architectural decisions you must not re-litigate
4. `docs/03_MVP_SCOPE.md` — what is in scope and what is explicitly not
5. `.claude/skills/arp/SKILL.md` — ARP-specific patterns and guardrails

Then the task-specific docs for whatever task you're currently executing.

## Operating principles

### Scope discipline is non-negotiable

The MVP scope is defined in `docs/03_MVP_SCOPE.md`. If a task seems to require something outside that scope, **stop and ask**. Do not silently expand scope. Adding "just one small feature" is the failure mode this project is designed to prevent.

### Architectural decisions are locked

`docs/02_ARCHITECTURE.md` describes decisions already made after careful reasoning. If you believe one of them is wrong, flag it explicitly — do not silently implement a different approach.

### Use existing skills rather than reinventing

The user has these skills installed. Use them for the appropriate work:

- **Ethereum smart contracts skill** → all Solidity work, Foundry setup, test patterns, deployment scripts
- **Trail of Bits audit security skill** → every contract must go through this before being considered done
- **Intuition protocol skill** → all atoms, triples, multivault interactions
- **This repo's ARP skill** (`.claude/skills/arp/SKILL.md`) → ARP-specific patterns, the protocol mental model, composition of the other skills

When multiple skills apply (e.g., writing a contract that creates an Intuition atom), use all of them. Do not pick one.

### Tasks are atomic

Each task in `tasks/` is designed to be completable in a single focused session. Complete them in order unless the user explicitly authorizes otherwise. When a task is complete, update its file with a completion note and what you produced.

### Quality bar

This MVP is a demo for the Intuition core team. The target is **prestige**, not "it works". Specifically:

- Contracts: 100% test coverage on public surface, security review pass, deploy scripts idempotent
- UI: typography-driven, dark-first, no generic templates, no emoji, no gradients, no rounded everything
- Documentation: every public API has a doc comment; every contract function has a NatSpec
- Git hygiene: conventional commits, atomic diffs, no "fix typo" after merge

If you ship something and you're not proud of it, you haven't finished.

### Communication style

When you complete a task, summarize what you did in three parts:

1. **What shipped** — one sentence, concrete
2. **What I decided** — any non-obvious choice you made, with the reasoning
3. **What's next or blocked** — what the user should know before the next task

Do not write long narrative explanations unless explicitly asked. Do not use emoji. Do not use excessive bold.

### Security posture

ARP manages real value eventually (TRUST staking). Every contract-facing change must go through the Trail of Bits skill before being considered complete, even in MVP. Specifically watch for:

- Reentrancy on any state-changing external call
- Access control on admin functions (even if only owner can call, be explicit)
- Integer overflow/underflow (Solidity 0.8+ reverts, but document the assumptions)
- Unchecked external calls
- Front-running on registration (is `msg.sender` the right creator binding?)

## What not to do

- Do not generate boilerplate UI with shadcn/ui default components untouched — design it
- Do not use `any` types in TypeScript, period
- Do not commit secrets, `.env` files, or private keys
- Do not deploy to mainnet without explicit user confirmation
- Do not add dependencies unless strictly necessary, and justify each one in the PR description
- Do not silently change the architecture documented in `docs/02_ARCHITECTURE.md`

## When to ask for clarification

Always ask, do not guess, when:

- A task file seems to contradict an architecture doc
- The user's instruction seems to expand scope beyond `docs/03_MVP_SCOPE.md`
- A dependency on Intuition infrastructure is unclear (e.g., which atom schema to use)
- The chain deployment target is ambiguous (Base Sepolia by default, ask before anything else)

When in doubt, stop and ask. Ten minutes of clarification saves a day of rework.
