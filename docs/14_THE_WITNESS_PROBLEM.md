# 14 — The witness problem

**Date**: 2026-10-16
**Serves**: `docs/12_THE_IDEA.md` and `docs/13_THE_THREE_FLOWS.md`. This answers the one question
both of them leave open: _how do we know what an agent actually used?_

---

## The question, and the answer that is not a workaround

**You cannot know. A runtime is unobservable from outside, and no protocol changes that.**

The tempting answer is "ship a connector the agent installs in its runtime". It does not work, and the
reason matters more than the conclusion:

> A connector inside the agent's process is **under the agent's control**. It sees only what the agent
> passes it. An agent can call `declare_used(["tool A"])` having used tool B. The connector does not
> observe the runtime — it transcribes a claim the runtime chose to make.

So an SDK or a runtime flag **moves the lie one layer in**. It does not reduce it. Proving what a
program did internally needs a hardware root of trust with remote attestation, or a zk proof of
execution. It does not need an npm package, and no npm package substitutes.

**Stop selling the connector as verification.** It is a convenience for honest agents and a cheap way
to produce edges. Those are real goods. Verification is not among them.

## What is a fact

Only what touched a **third party**. An agent cannot fabricate an event whose source is somebody else.

| Trace                        | Why it is a fact                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A payment to the tool        | The payee is a third party. You cannot have paid someone who received nothing.                                                                                                                          |
| An on-chain call to the tool | The chain recorded it, not the agent.                                                                                                                                                                   |
| A delegation redemption      | `TrustStakeCapEnforcer` (`0x99921C234d4Ca518DC58ba63ff9bfD2Cc9435f34`, chain 1155) emits `StakeCapChecked(delegationHash, newCumulative, cap)` on every pass. Unreachable without an actual redemption. |
| **The agent's own calldata** | A transaction is a fact the chain recorded, not the agent. Needs no hook and no adoption, and works **retroactively** on history that already exists. `tasks/22`.                                       |

The last row was a user proposal, and it came with a correction worth keeping: the instinct is to
reach for a hook that fires when a skill is called, but **a hook has to be installed, which is
adoption** — the cost flow A exists to avoid. Reading transactions needs nobody's permission. A hook
only adds what a raw transaction cannot carry, a semantic payload the tool chooses to emit, and that
is an opt-in refinement rather than the foundation.

Measured 2026-10-16, 120 random Base token ids: **100% resolve an owner, 81% of those owners have
transacted** (55% with ten or more), 68% hold a balance. So the accounts are active and the surface
is not empty.

**Two things that table does not establish**, stated because reach is the easy thing to overstate:
`ownerOf` returns the token holder rather than the agent — one address in that sample has 37,928
transactions and holds three agents, which is a minting platform, not an agent at work — and a nonce
counts every transaction including the mint. Whether what these accounts _call_ is a tool is
unmeasured, and settling it needs an indexer.
`scripts/measure-cohort-onchain-activity.ts` reproduces the table.

**And the limit that bounds the whole row: most tools are not contracts.** An MCP server, a REST API,
an LLM call — none leave calldata. On the subset that does, this is unbeatable; off it, it says
nothing. So it is a fourth source for the same edge, never a replacement for the three flows.

Note the limit, stated plainly because it is easy to overclaim: **the redemption receipt proves real
money moved under a bounded authority. It does not prove the tool was used.** The link between "I used
X" and the receipt is still a claim. What the receipt establishes is that the claim cost something.

## The reversal

Do not ask the agent what it used. **Ask the tool who used it.**

This is the move the rest of this document rests on. Its properties:

- **Tools are far fewer than agents**, so the witness set is small and tractable.
- **Tools already run servers**, so they can sign. No new infrastructure is asked of them.
- **A tool has no incentive to inflate one specific agent's usage**, and if it does, that agent's
  competitors have both the knowledge and the motive to dispute it.
- **Two parties with opposing interests agreeing** is a different class of evidence from one party
  asserting. That is the whole of it.

And a tool wants _credible_ usage attributed to it. A tool carrying a thousand edges from spam agents
reads worse than one carrying ten confirmed ones, which means the witness has a reason to be accurate
in both directions.

## The collapse that makes this cheap

In ERC-8004 plus MCP, **the tool layer and the agent layer are the same layer.**

Agent `8453:2340` declares six MCP tools _and_ holds an ERC-8004 identity. So `(A, use, B)` is an edge
between two atoms that **already exist**. No tool namespace has to be invented, no `ModuleRegistry`
has to be deployed (ADR `0025` was right for a reason it did not know), and the edge costs one triple
fee rather than an atom plus a triple.

This is also `docs/12`'s original shape arriving from the other direction: agents are composed of
modules, and a module can itself be an agent.

## The gap, measured

n = 250 uniformly random Base token ids, 2026-10-16, 122 registration documents parsed. Wilson 95%
intervals, because the callable count is small and a point estimate would mislead.

|                                                        | of 122 parsed  | 95% CI     | extrapolated over 88,243 |
| ------------------------------------------------------ | -------------- | ---------- | ------------------------ |
| declares a protocol endpoint (`mcp`, `a2a`, `rest`, …) | 63 — **51.6%** | 42.9–60.3% | 37,819 – 53,229          |
| **answers one**                                        | 3 — **2.5%**   | 0.8–7.0%   | **741 – 6,160**          |

**About half the cohort says it is callable. Somewhere between 1% and 7% is.**

The gap survives the error bars: compare the _bottom_ of the claiming range with the _top_ of the
answering range and it is still roughly sixfold. At the point estimates it is twentyfold.

Of 5 endpoints named `mcp`, 2 speak MCP. The three that answered:

```
MCP  8453:51097   https://mcp.surfliquid.com/mcp
MCP  8453:26183   https://nebula-scan-ten.vercel.app/mcp
A2A  8453:26183   .../.well-known/agent-card.json
```

`26183` serves both protocols and both work. That is what a real tool looks like, and there are on the
order of a thousand of them, not ninety thousand.

**This gap is the product.** It costs one HTTP request per agent to establish, needs nobody's
permission, and nothing in this ecosystem currently reports it.

## Provenance: the deposit is the attestation

A triple's subject carries no authorisation — writing `(NetGuardian, uses, Slither)` requires
controlling neither party (ADR `0032`). So an edge has **no provenance**, and a readable edge of
unknown origin is still unusable.

The answer is not a signature scheme, an `attested by` predicate or a writer allow-list. **It is the
deposit** (ADR `0034`): a position is recorded on-chain against the depositor's address, so depositing
on an edge is simultaneously a statement of provenance and of belief.

Verified 2026-10-19 — the filter is one query, because `positions` carries `account_id` beside
`term_id`:

```graphql
positions(where: {account_id: {_eq: $attestor},
                  term: {triple: {predicate_id: {_eq: $uses}}}})
```

Three things make this better than it first looks:

- **It is the ecosystem's existing convention, not a proposal.** `wieedze.eth` holds positions on its
  own `(wieedze.eth, uses, Hardhat)` edge; `w00ds.eth` on MetaMask, Claude, Obsidian and Cursor.
- **It doubles as the economic position** ARP wanted anyway. The attestation is not overhead on the
  stake; it _is_ the stake.
- **It is revocable.** A position can be redeemed, so a vouching can be withdrawn when an edge turns
  out wrong — strictly better than an immutable signature.

And the limit, which must never be rendered away: **it is a filter, not an exclusion.** Anyone may
deposit on the same edge, and anyone may write a competing edge nobody attested. Every attestation
also costs at least `minDeposit`, so the bound on how many edges a party can stand behind is money.

`scripts/measure-attestor-filter.ts` reproduces it.

## The ladder of knowledge

What the interface must never do is render these at the same weight. This is `docs/09` §3's evidence
ladder applied to usage rather than to trust.

| What we have                                     | What we know                                         |
| ------------------------------------------------ | ---------------------------------------------------- |
| payment, on-chain call, or delegation redemption | **fact**                                             |
| tool and agent both declare the same edge        | **confirmed by two parties with opposing interests** |
| only the tool declares                           | the word of a third party — strong                   |
| only the agent declares, with stake behind it    | a priced assertion                                   |
| only the agent declares, free                    | **nothing**                                          |

The bottom row is the one that gets mistaken for data. Its only weight is the TRUST staked behind it,
which is a market pricing an opinion — not evidence that anything happened.

## Disagreement is already free

Intuition gives every triple a counter-triple. So:

- the agent claims `(A, use, B)` and deposits on the triple
- B disagrees and deposits on the **counter**-triple

No new mechanism, no arbitration, no authority. The disagreement is on-chain, priced, and visible —
and a contested edge is more informative than an uncontested one, because somebody paid to contest it.

That is the speculative layer: support is "this happened and mattered", oppose is a bet against it.

## What this means for the build

1. **Use the published predicate.** `use` (`0x9ddda4ac…`, Appendix B, "unambiguous") carries 158 edges;
   `uses` (`0x5c0bde1c…`, never published, derived empirically) carries 185. Twenty-seven edges is
   noise, so volume does not decide — publication does, and ADR `0015` already settled that. ARP
   currently mints a _third_ `uses` atom of its own, which its own connector cannot read: every
   stake-on-use written today is TRUST spent into a node nobody queries. Fix this first; nothing else
   counts until it is fixed.
2. **The witness surface is the callable set**, on the order of a thousand agents. Identifying it is
   flow A, needs no consent, and is a dataset nobody else holds.
3. **ARP seeds the graph by being a counterparty**, not by asserting. When ARP hires an agent (flow C)
   it is the third party, and its attestation is the honest kind.
4. **A tool attestation is shaped exactly like a trust assessment** — a signed document at a resolver
   URL. `erc8004/src/signature.ts` already verifies that shape against a declared signer, which is the
   one piece of this that is built and proven.

## Drift signals

Carrying `docs/12`'s list forward, with two additions earned here:

- Anything that needs visibility into execution is the wrong design.
- **Anything that treats an agent's self-report as verified because it arrived through our SDK.** The
  transport does not authenticate the content.
- **Anything that renders a free self-report beside a receipt without marking which is which.**
