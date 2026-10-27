# 0060 — ARP records a use; it does not broker one

**Status:** Accepted
**Date:** 2026-10-27
**Triggered by:** user objection, and it is the whole of the context — _« si j'avais le runtime
address je pourrais me servir directement de l'agent car je l'aurais conçu […] là je décris une
marketplace d'agent non ? […] un agent qui voudrait employ un agent et écrire la preuve qu'il a bien
utilisé cet agent ou cet outil qui est register, c'est plus ça je pense »_

## Context

`tasks/25` is called "hire an agent, and rate it afterwards", and its four verbs are `find → hire →
pay → rate`. Taken literally, the hire half was built: `prepareHire` returned a bounded
sub-delegation, and `/hire` let a human fill in an agent's address and a budget and sign it.

**It does not connect to anything.** A delegation names its delegate by address, and an agent's
runtime address is not on the graph: its atom resolves through `same as` to an ERC-8004 token, which
names an NFT and an owner, neither of which is the key it signs with. So a buyer can only hire an
agent whose address they already have — which means they already know it, which means the discovery
page was useless to them and the hire page was useless to everyone else.

Closing that gap needs a directory of reachable agents with their endpoints and their keys. That is
an agent marketplace. `docs/01` and `docs/12` both say ARP is not one.

**And the hire was never the point.** `tasks/25`'s own framing calls it "the second half of the
loop", where the loop's product is the **edge**: `(someone, uses, something)` with money behind it.
The hire is one occasion that produces such an edge. It is not the only one and it is not the
common one.

## Decision

**ARP records that something was used. It does not arrange the using.**

1. **The buyer-to-stranger delegation is removed** — `prepareHire`, `HIRE_SELECTORS`, the caveat
   module, the hire service and the hire form. It is correct code for a question ARP does not ask.
2. **The primary actor is an agent, not a shopper.** An agent already holds whatever it composes
   with; it does not need discovery in order to use something. What it needs ARP for is to write
   down that it did, and to pay for writing it. That path exists: `prepareDeclareUsed` plus
   `prepareRate`, reachable from the skill and the MCP server.
3. **Discovery stays, downstream.** `findAgents` moves out of `hire/` to `discover.ts` and `/hire`
   becomes `/discover`. Reading the record is a real surface; it is what the record is *for*, not a
   precondition for producing it.
4. **The delegation that matters is the one that already exists**: an operator bounding what *their
   own* agent may spend writing declarations (`/agent`, `docs/12` point 5). That is a safety
   mechanism over an existing relationship, not a way to reach a stranger. The two were conflated.

## What makes a declaration credible, restated because it is the crux

Not that a salary was paid. **That writing it costs 0.1 TRUST which does not come back** — ADR
`0056`, decided 2026-10-21. A free review is worth what it cost; a claim that cost its author money,
permanently, is a different object. The hire added nothing to that and required a relationship to
exist first.

## Alternatives considered

- **Keep `prepareHire` and publish agent endpoints so hiring works** — rejected. That is the
  marketplace, and `docs/01` rejects it by name. It also makes ARP responsible for reachability,
  which is a uptime obligation ADR `0046` already removed once.
- **Keep the code, parked and unexported** — rejected per `rules/code.md`: no dead weight, and git
  remembers. The measurement it rests on — the Delegation Framework is live on both Intuition chains
  at 1.3.0 — is recorded here so it does not have to be rediscovered.
- **Rename `hire` to `commission` and keep the shape** — rejected. The problem is not the word.

## Consequences

**Positive:**

- The surfaces now point the same way: an agent writes a record, a reader reads it. Nothing in the
  product requires a relationship that the product cannot establish.
- Removes a form that asked a buyer for an address they could not obtain, which is the clearest
  possible sign a flow is upside down.
- The demo stops being "I hire an agent" — which needs a counterparty nobody has — and becomes "an
  agent runs, uses three tools, and the three declarations appear with money behind them". That has
  already happened three times on testnet 13579, on 2026-10-20.

**Negative:**

- `tasks/25`'s stated objective is not met and will not be as written. Its `hire` and `pay` verbs
  are out; `find` and `rate` survive as `findAgents` and `prepareRate`. The task file needs
  rewriting rather than closing.
- 11 tests go with the deleted code. They were good tests of a thing that should not ship.
- A measured fact is left unused: the MetaMask Delegation Framework is deployed on Intuition 1155
  and 13579 at version 1.3.0, with `DelegationManager` at
  `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3`. That matters for the operator-to-own-agent
  delegation on mainnet, which ARP's own enforcer cannot serve — so it is recorded here rather than
  lost with the code that discovered it.

**Neutral (worth knowing):**

- `prepareRate` keeps the name `rate` even though no hire precedes it. Rating is what an agent does
  about a tool or another agent it used, and the word survives the frame it arrived in.
- Nothing about the on-chain shape changed. The edge is still `(subject, uses, object)` and the
  predicate is still `uses` (ADR `0030`).

## References

- Related ADR: `0056` (what makes a declaration credible — the fee, not the salary), `0046` (ARP
  publishes no score, and the obligations it declined), `0030` (do not mint a predicate carelessly),
  `0038` (prepare, never sign — upheld by the removed code and still upheld by what remains)
- Related doc: `docs/01_PROJECT_CONTEXT.md` (not a marketplace), `docs/12_THE_IDEA.md` points 3–5
- Related task: `tasks/25` — objective superseded; `find` and `rate` survive
