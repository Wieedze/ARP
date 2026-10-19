# Task 16 — The connector an agent declares through

> **Status: HALF 1 DONE, HALF 2 SPLIT OUT** 2026-10-19. Specified 2026-10-16, re-anchored on ADR
> `0035`. **This is the whole gap** `docs/12` names: _"Adoption of an existing ERC-8004 agent —
> missing."_
>
> Half 1 — declare and deposit — shipped as `packages/protocol/src/declare/`, two MCP tools, a
> runnable example and 44 tests. Half 2 — hire and rate — moved to **`tasks/25`**, which this file
> told us to do if half 1 grew.
>
> **The design decision, and it is the load-bearing one: the connector prepares calls and never
> signs or sends one** (ADR `0038`). ARP holds no key, so it cannot spend an operator's TRUST even
> by mistake — ADR `0035` made structural instead of promised.
>
> **And the deposit goes on the edge, not the tool's atom** (ADR `0039`). ARP's reader
> (`getToolUsage`) priced the triple while ARP's writer (`scripts/agent-stake-on-use.ts`) deposited
> on the atom, so the writer put TRUST where the reader could not see it. Latent, not live — the
> script's only callers are set-aside hackathon surface. Measured on mainnet before deciding
> (`scripts/measure-stake-vault-placement.ts`): of 185 `uses` edges, 110 carry stake on the edge and
> 74 carry it **only** on the atom.
>
> Verified against live mainnet 1155 on 2026-10-19, read-only, nothing signed and nothing sent:
>
> ```
> bun run scripts/agent-declare-used.ts --agent 8453/1380 --tool ipfs://bafkreiarpslitherschema \
>     --tool https://mcp.gmchain.xyz/mcp
>
> subject atom  0x45078ae569def2264355f77e592028dd6f1f5d6373c204fe82bf3141ab1861fb
> declare: 4 call(s), 0.400000000006 TRUST     # two tools: 2 atoms + 2 triples
>   create-atom    0.100000000001 TRUST  create the atom for ipfs://bafkreiarpslitherschema
>   create-triple  0.100000000002 TRUST  declare that this agent uses ipfs://…
>   …
> ```
>
> **No live write has happened.** Sending any of it needs the user's explicit go-ahead per ADR
> `0037`, and on mainnet it is `security.md` row 1 territory for ARP's own funds.
>
> **One thing this task found that it did not set out to find** (ADR `0040`): the repo asserted in
> five places — including `portability.md`, a rule — that the triple fee "sits outside
> `TrustStakeCapEnforcer`, which bounds the deposit only". False. The enforcer decodes `value` out
> of the execution and nothing else, so a fee counts against the cap like any other spend. All five
> are corrected, and a test now asserts the delegated path puts the amount where the enforcer reads
> it, so the outer `value: 0n` cannot slip past the cap.

## Objective

Close the loop `docs/12` describes, for agents that already exist:

```
an agent's operator signs one delegation          ← not ARP, not ARP's author
the agent runs and uses tools
the agent deposits on those tools                 ← its own TRUST, under the signed cap
the tool gains reputation, and so does the agent  ← docs/12 point 4
```

**ARP is not a party to any of it** (ADR `0035`). It supplies three things and nothing else:

1. **The connector** the agent declares what it used through.
2. **The delegation** its operator signed, with `DomainScopeEnforcer` and `TrustStakeCapEnforcer` as
   the guard rail. Both are on mainnet 1155 (`deployments/1155.json`), so `docs/12`'s second gap —
   "the guard rail on the chain where the agents are" — is already closed.
3. **The deposit** on the tools.

The author of ARP appears nowhere in the live loop. Any design where they sign, hold funds, or are
needed for a stake to happen has reproduced the mistake ADR `0035` records.

**MCP first, not an npm package.** An MCP server is universal — any MCP client connects with no
integration work — and the agent _chooses to call it_, so ARP is still not in anyone's runtime. A
package is a second surface for runtimes that do not speak MCP, and it comes after.

## What this is not

Beyond `docs/12`'s own drift list, two mistakes made in this project and worth naming here:

- **Not liveness scoring.** Probing whether an endpoint answers and staking on the result is ARP
  producing one more score, which `docs/01` rejects. The verifier (`tasks/17`) is for **discovery** —
  knowing who can be hired — never for the stake.
- **Not an attestation scheme to design first.** ADR `0034`'s deposit-as-attestation is real and only
  matters once edges are being written. It is not a prerequisite.

## What this is not

`docs/12` names it as a drift signal: **ARP is never in anyone's runtime.** This SDK is called _after_
work, by the agent, reporting what it did. It does not wrap execution, does not observe it, and does
not require the operator to route anything through ARP.

What can be recovered without being in the runtime is enough:

- what the agent **declares** it used — self-reported, but costly because staked
- **execution receipts** from redeemed delegations — a fact, not a report
- whether a hirer **staked after** a hire — the strongest signal, because they paid twice

If a design idea needs visibility into execution, it is the wrong design.

## Half 1 — declare and deposit (**this is the task**)

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

## Half 2 — hire, and rate (**defer; split it out if half 1 grows**)

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

- Read paths come from `@arp-protocol/core` and `@arp-protocol/core`. Do not reimplement them.
- Canonical predicate constants only. Never resolve by label, never mint a predicate.
- The canonical ERC-8004 atom is the subject for anything ERC-8004-facing (ADR 0015).
- No pinning. If a path seems to need the partner key, that is a signal it is using the wrong atom
  derivation — check before adding the dependency.
- **No agent or script may sign a mainnet transaction during development** (`security.md`). Verify
  with a mocked wallet client and `eth_call`.
- Mainnet target is 1155 for graph writes and stakes. `DomainScopeEnforcer` on 1155 is inert and there
  is no `ModuleRegistry` there (ADR 0025) — do not build against either.

## Acceptance criteria

- [x] A runtime with only a funded wallet and an ERC-8004 identity can declare and stake — **no API
      key**. `resolveDeclarationSubject` is a graph read; a tool's atom derives from its URI (ADR
      `0008`). Nothing in the path pins, so `requirePinAuth` never appears.
- [x] Both signing modes work, tested. Direct is `plan.calls` as they come; delegated is
      `toDelegatedCalls`, one redemption per call because `TrustStakeCapEnforcer` guards `beforeHook`
      with `onlySingleCallTypeMode` (`contracts/src/enforcers/TrustStakeCapEnforcer.sol:95-96`).
      7 tests, including one that decodes the permission context to check the chain order, and one
      that asserts the amount lands where the cap enforcer reads it.
- [x] Declarations land on the canonical atom; a test asserts the subject. It decodes the
      `createTriples` calldata and asserts `subjects == [SUBJECT]` rather than reading the plan's own
      field back (ADR `0032`).
- [x] The canonical `uses` predicate is used, not a minted one. Asserted against the frozen constant,
      and asserted **not** to be `USE` — the pair ADR `0030` had to disentangle.
- [→] `hire` produces a bounded sub-delegation that the existing specialist server accepts — **moved
  to `tasks/25`**, with half 2.
- [→] `rate` writes `(A, uses, B)` and stakes — no new predicate — **moved to `tasks/25`**.
- [x] A README a third party can follow without reading this repo. `packages/protocol/README.md` §"Declaring
      what your agent used": what you need, the plan, the ordering constraint, both costs read from
      the chain, and both signing modes.
- [ ] `task-verifier` pass

## Which tier of the evidence ladder does this serve?

**Tier 3, Staked** — `docs/09_POSITIONING_AND_PLAN.md:53`, whose "who supplies it today" column
reads **"nobody, at any real size"**. This is the first thing in the repo that lets a party ARP is
not, holding no relationship with ARP and no key of ARP's, produce a tier-3 edge: a `uses` claim with
its own operator's capital at risk behind it.

It does **not** reach tier 4, Proven — "this action executed under enforced caveats"
(`docs/09:54`). The delegated path is built and the caveats are deployed on both chains, but
**nothing has been signed or sent on any chain**, so no action has executed under them yet. Crossing
that line needs an operator who decides to spend, which is `docs/15`'s Phase 4 and is adoption
rather than engineering.

## Out of scope

- Anything that observes or wraps a runtime.
- A payment rail. `hire` bounds and pays with what already exists; x402 is a separate decision.
- Publishing to npm.
