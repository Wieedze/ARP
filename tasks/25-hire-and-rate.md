# Task 25 — Hire an agent, and rate it afterwards

> **Status: NOT STARTED** (split out of `tasks/16` on 2026-10-19, which said to do exactly that if
> half 1 grew. It did: the declare-and-deposit half landed as `packages/protocol/src/declare/` plus two MCP
> tools, 34 tests and three ADRs.)
>
> Task 16's acceptance list carried two criteria belonging here — `hire` and `rate`. They are not
> dropped; they moved, with the rest of its Half 2 text as the spec below.

## Objective

The second half of the loop. Half 1 answers "what did this agent use, and what is it worth" for a
tool. This answers "who should I hire, and was it any good".

```
find a candidate for a domain          ← reads the verifier's output (tasks/17) and the tool surface
sign a bounded sub-delegation          ← the buyer's own cap, so the seller needs no relationship
pay, and get a receipt                 ← an execution receipt is a fact, not a report
declare (A, uses, B) and stake on B    ← the rating, with no new mechanism
```

**The seller signs nothing.** That is the property worth protecting: a buyer can hire an agent that
has never heard of ARP, because the delegation bounds the _buyer's_ spend and nothing is asked of
the counterparty.

## What already exists

- `scripts/agent-server.ts` subcontracts today: it signs a leaf delegation chained off its root
  compose authority, POSTs the task, and validates the fee. `agent-server-specialist.ts` is the
  receiving side. **That is the hard part and it works** — but it is set-aside hackathon surface
  (ADR `0033`), so it is a reference, not a dependency.
- `packages/protocol/src/declare/` has the rating primitive already. `rate` is `prepareDeclareUsed` plus
  `prepareStakeOnUsed` where the "tool" is an agent. Atoms can be agents or tools or both.
- `toDelegatedCalls` already wraps prepared calls for redemption, one per call.

## What this adds

The handshake as a callable surface, and nothing more:

```ts
const candidates = await findAgents({ domain: 'solidity-audit' });
const job = await hire(candidates[0], { budget, domain }); // bounded sub-delegation
await rate(candidates[0], { amount, side: 'support' }); // (A, uses, B) + stake on the edge
```

Names are a suggestion from `tasks/16`. Argue for better ones.

## Hard constraints

- **Do not invent an agent-rating predicate.** `(A, uses, B)` with B an agent is the rating.
  `tasks/09` priority 2 records what happened when ARP minted its own predicate: a node its own
  connector could not read (ADR `0030`).
- **The stake goes on the edge**, per ADR `0039`. Same vault as half 1, same reason.
- **Prepare, do not sign** (ADR `0038`). `hire` returns the sub-delegation to sign and the calls to
  send; it does not hold a key. This is the constraint most likely to be eroded here, because a
  hire is a multi-step handshake and a signer parameter would make it one call.
- Mainnet target is 1155 for graph writes and stakes. `DomainScopeEnforcer` on 1155 is inert and
  there is no `ModuleRegistry` there (ADR `0025`) — the domain bound must come from somewhere else,
  and working that out is part of this task rather than an assumption to carry in.
- No agent or script signs a mainnet transaction during development (`.claude/rules/security.md`).

## Depends on

- `tasks/23` — the tool surface. Without a page showing a tool with its weight, `findAgents` returns
  a list nobody can judge.
- `tasks/17`'s gate at 100 agents, for the candidate list to be worth reading at all.

## Out of scope

- A payment rail. `hire` bounds and pays with what exists; x402 is a separate decision.
- Anything that observes or wraps a runtime (`docs/12` drift signal).
- Publishing to npm.

## Which tier of the evidence ladder does this serve?

**Proven** — the top rung. A hire that was paid for and then staked on is the strongest evidence
class ARP can produce, because the hirer paid twice: once for the work, once to say it was good.
`docs/14` names it as such.
