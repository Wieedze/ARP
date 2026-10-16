# Task 16 — `@arp-protocol/agent`: the write and hire SDK

> **Status: NOT STARTED** (specified 2026-10-16).

## Objective

A package a third-party agent runtime imports to do two things:

1. **Report what it used**, and put TRUST behind it — the input ARP scores.
2. **Hire another agent** on the network under a bounded delegation, and rate it afterwards.

Both already work in this repo as scripts wired to ARP's own setup. This decouples them.

## What this is not

`docs/12` names it as a drift signal: **ARP is never in anyone's runtime.** This SDK is called _after_
work, by the agent, reporting what it did. It does not wrap execution, does not observe it, and does
not require the operator to route anything through ARP.

What can be recovered without being in the runtime is enough:

- what the agent **declares** it used — self-reported, but costly because staked
- **execution receipts** from redeemed delegations — a fact, not a report
- whether a hirer **staked after** a hire — the strongest signal, because they paid twice

If a design idea needs visibility into execution, it is the wrong design.

## Half 1 — report and stake

`scripts/agent-stake-on-use.ts` already does this. It cannot be reused as-is because it requires four
things a third party does not have:

| Coupling                              | Why it blocks                                                                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `composeDelegation` **mandatory**     | they would have to sign an ARP delegation before anything                                                                                |
| `manifestPath` — ARP's demo manifest  | their tools are not in it                                                                                                                |
| `requirePinAuth()`                    | the partner key is ARP's, not theirs                                                                                                     |
| agent atom = runtime wallet's CAIP-10 | ADR 0015 makes the canonical ERC-8004 atom the subject; declarations on any other subject are invisible to anyone querying the right one |

The last is the serious one: it would work, and nobody would see it.

**The unlock: a third party needs no API key.** A tool's atom derives from its `schemaURI` (ADR 0008),
so `ensureAtomForURI` pins nothing. The agent's canonical atom already exists for the mirrored cohort.
And the canonical `uses` predicate exists on-chain — use its constant instead of minting one. That
also closes `tasks/09` priority 2, where ARP mints a `uses` predicate its own connector cannot read.

So: a funded wallet, and that is all.

**Two signing modes, both required.** _Direct_ — the agent's wallet signs and pays; minimal friction,
the on-ramp. _Delegated_ — the operator signs once, the runtime redeems, bounded by the cap; the guard
rail. The guard rail must not be the price of entry.

**Declaring and staking are separate calls.** But be honest in the docs: on mainnet, declaring costs
0.1 TRUST per triple. It is not "free to declare, costly to stake" — which is arguably right, since a
declaration that costs is already a signal.

## Half 2 — hire, and rate

`scripts/agent-server.ts` already subcontracts: it signs a leaf delegation chained off its root
compose authority, POSTs the task, and validates the fee. `agent-server-specialist.ts` is the
receiving side. That is the hard part and it exists.

What the SDK adds is the handshake as a callable surface: find a candidate, sign the bounded
sub-delegation, pay, get a receipt.

**Rating needs no new mechanism.** An agent that hired another and was satisfied declares
`(A, uses, B)` and stakes on B — the same primitive as Half 1, with B being a tool that happens to be
an agent. The README already says atoms can be agents or tools or both. **Do not invent an
agent-rating predicate**; `tasks/09` records what happens when ARP mints its own.

The shape, roughly:

```ts
const arp = createArpAgent({agent: {chainId: 8453, tokenId: "1380"}, signer});

await arp.declareUsed([toolUri, …]);
await arp.stakeOnUsed([{tool: toolUri, amount}]);

const candidates = await arp.findAgents({domain: "solidity-audit"});
const job = await arp.hire(candidates[0], {budget, domain});   // bounded sub-delegation
await arp.rate(candidates[0], {amount, side: "support"});      // (A, uses, B) + stake
```

Names are a suggestion. Argue for better ones.

## Constraints

- Read paths come from `@arp-protocol/erc8004` and `@arp-protocol/sdk`. Do not reimplement them.
- Canonical predicate constants only. Never resolve by label, never mint a predicate.
- The canonical ERC-8004 atom is the subject for anything ERC-8004-facing (ADR 0015).
- No pinning. If a path seems to need the partner key, that is a signal it is using the wrong atom
  derivation — check before adding the dependency.
- **No agent or script may sign a mainnet transaction during development** (`security.md`). Verify
  with a mocked wallet client and `eth_call`.
- Mainnet target is 1155 for graph writes and stakes. `DomainScopeEnforcer` on 1155 is inert and there
  is no `ModuleRegistry` there (ADR 0025) — do not build against either.

## Acceptance criteria

- [ ] A runtime with only a funded wallet and an ERC-8004 identity can declare and stake — **no API key**
- [ ] Both signing modes work, tested
- [ ] Declarations land on the canonical atom; a test asserts the subject
- [ ] The canonical `uses` predicate is used, not a minted one
- [ ] `hire` produces a bounded sub-delegation that the existing specialist server accepts
- [ ] `rate` writes `(A, uses, B)` and stakes — no new predicate
- [ ] A README a third party can follow without reading this repo
- [ ] `task-verifier` pass

## Out of scope

- Anything that observes or wraps a runtime.
- A payment rail. `hire` bounds and pays with what already exists; x402 is a separate decision.
- Publishing to npm.
