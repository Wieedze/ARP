# Task 19 — The `use` edge, and its witness

> **Status: STEP 1 DONE, STEPS 2–5 OPEN** (specified 2026-10-16). Implements `docs/14_THE_WITNESS_PROBLEM.md`.
> **Step 1 is a prerequisite for every other step and for tasks 16 and 17.**

## Objective

Make `(agent, use, tool)` an edge that exists on the canonical predicate, carries weight, can be
confirmed or contested by the counterparty, and is readable by ARP's own connector.

## Step 1 — Stop minting a private `use` predicate. Blocking.

> **DONE** 2026-10-16. Two commits: `5e1d5d2` removed the minted predicate, and the follow-up
> **reversed its choice of replacement** after the `intuition-integrator` review — see **ADR 0030**.
> The predicate is `uses` `0x5c0bde1c…`, chosen on **meaning**: `use` `0x9ddda4ac…` is the published
> one but its objects are 153/158 protocols on mainnet and 166/166 on testnet, so it means "supports
> this protocol", and Appendix B's object table for it is five standards, closed.
>
> `5e1d5d2` also fixed a function with no production callers. The paths that actually write are
> `scripts/agent-stake-on-use.ts` and `scripts/agent-loop.ts`, both now corrected.
>
> Added: an `isTermCreated` preflight on the predicate with `PredicateNotOnChainError`, replacing an
> on-chain revert that fired after the user had approved and paid gas.
>
> Orphan census, as item 4 below requires: `0x3707e587ade3f003f79bfdfa820a7d51900ab9e2b7226800ac4f4e09865e60e5`,
> **21 edges, testnet only, 21,000,000 wei ≈ 2.1 × 10⁻¹¹ tTRUST, absent from mainnet.** Not migrated —
> Intuition has no deletion. The bug cost nothing material and never touched real TRUST.
>
> `pinAuth` is gone from both scripts: nothing in them pins any more, yet both hard-threw without a
> partner key that no longer did anything, so the fixed path was unrunnable.
>
> **Why the gates missed that**: `app/tsconfig.app.json` includes only `src`, so `scripts/` sits
> outside `tsc -b` and its `noUnusedLocals`; there is no eslint config at the repo root, so
> `eslint .` from `app/` never sees `scripts/`; and `bun build` strips types without checking unused
> locals. **The two files that carry this task's fix are outside every gate it reports.** Worth its
> own change — related to `tasks/18`, wider than it.
>
> Steps 2–5 remain. **The gate below is not yet demonstrated** — see the note at its end.
> Deferred to `tasks/20`: both predicates still map to one relation and bucket as `protocols`, so a
> tool renders as a protocol.

`app/src/services/intuition-graph.ts:157-180` pins a Thing named `"uses"` with an ARP-specific
description and caches the resulting atom id. Atom ids are content-deterministic over the pinned URI,
so that id is neither `USE` nor `USES` in `packages/protocol/src/sources/intuition/terms.ts`.

**Consequence today: every `(agent, uses, tool)` triple ARP has written sits on a node its own
connector never queries, and no third party queries either.** `docs/07` warns about exactly this —
"do not mint your own copies — a differently-pinned duplicate is a different node and fragments the
staking surface" — and ADR `0015` forbids label resolution and fixes the canonical ids. The graph
already shows the damage pattern: two distinct `supports` atoms with different ids.

Measured on mainnet 2026-10-16:

| predicate        | id                | edges   | published in Appendix B         |
| ---------------- | ----------------- | ------- | ------------------------------- |
| `use`            | `0x9ddda4ac…`     | 158     | **yes**, and marked unambiguous |
| `uses`           | `0x5c0bde1c…`     | 185     | no — derived empirically        |
| ARP's own `uses` | minted at runtime | unknown | no                              |

**Use `USE`.** Twenty-seven edges of difference is noise, so volume does not decide; publication does,
and ADR `0015` already made that the rule. Reproduce the counts with
`scripts/measure-cohort-endpoints.ts`'s sibling query before changing this.

Do:

1. Delete `getOrCreateUsesPredicateAtomId`. Import `USE` from the connector's `terms.ts` instead — one
   source for the id, as with `ABSENT_SIGNATURE_REASON`.
2. Add `USE` to whatever the write path reads so a reviewer can see the write and read sides agree.
3. A test that fails if the write path's predicate id is not in `CAPABILITY_PREDICATE_IDS`. This bug
   class must not be able to return.
4. **Do not migrate the existing triples.** They are permanent and cannot be deleted. Record in the
   post-mortem how many were written to the orphan node and what that cost, so the number is on file.

**Gate:** a triple written by the write path is returned by `getAgentProfile` for the same agent.

**Not demonstrated yet, and the predicate is only half of it.** `getCapabilities` keys on
`resolveSubject`, which resolves through `same as` to the **ERC-8004 registration-derived** atom,
while both write paths pass a **CAIP-10** atom as the subject. So fixing the predicate does not by
itself make these triples readable — the subject is the other half, and ADR 0015 §2 says the two
identities are joined only by a `same as` triple. Check that edge exists for ARP's agents before
claiming this gate.

## Step 1b — The join does not exist. **Decide this before step 2.** Blocking.

Measured 2026-10-16, both chains, read-only:

|                                                         | mainnet | testnet                    |
| ------------------------------------------------------- | ------- | -------------------------- |
| `same as` edges whose object is a `caip10:` atom        | **0**   | **0**                      |
| edges of **any** predicate pointing at a `caip10:` atom | —       | **0** (over 20 such atoms) |

So the three facts are:

1. ARP writes `(caip10 atom, uses, tool)` — the 21 stranded triples all have a `caip10:` subject.
2. `getCapabilities` keys on `resolveSubject`, which returns the atom X satisfying
   `(X, same as, <CAIP-19 of the ERC-8004 token>)` — the registration-derived atom.
3. **Nothing links the two.** ADR `0026` specifies
   `(canonical agent atom, same as, CAIP-10 of the operating account)` and
   `app/src/services/agent-import.ts:397` implements it, but **no such edge exists on either chain**.
   The import path passes its tests and has never written a real edge.

Fixing the predicate was necessary and is not sufficient. The subject is the other half, and the
bridge the subject mismatch would have been crossed by was never built.

### Decided: option A. **ADR `0032`.**

Write on the registration-derived agent atom. A `uses` edge is a claim about the agent's identity,
not a record of an account's action — and since anyone can write `(X, uses, Y)` about any `X`, the
subject is a question of who can **read** the edge, not who may assert it.

**The cost this accepted is withdrawn** (ADR `0033`, 2026-10-17). It rested on ARP's demo agents
needing an identity; those are set aside, and an agent arriving through the connector brings or mints
its own. So every agent that can write an edge already has the identity by construction, and steps
2–5 are no longer blocked on minting anything. The two options as weighed:

### The two options as they were weighed

**A — write the edge on the registration-derived agent atom.** A consumer looks up an ERC-8004
agent, not a CAIP-10 account, so the agent's published identity is where a claim about the agent
belongs; the operating account is how it _acts_, not what it _is_. The edge then needs no join at
all and `getCapabilities` reads it unchanged.

_Cost:_ ARP's own agents have **no ERC-8004 identity** — `ARP Agent #1` and the two runtime accounts
exist only as `caip10:` atoms. Under A they cannot carry a `uses` edge until they are minted into the
canonical registry, which is ADR `0027`'s path and a real cost per agent.

**B — write on the operating account, and teach the reader to follow `same as`.** Matches where the
evidence actually comes from: the stake and the transaction are the operating account's. Needs the
import's `same as` edge to be written for real, plus a connector change so `getCapabilities` unions
the subject's own triples with those of any atom it is `same as` to.

_Cost:_ two writes instead of one, a public connector change, and every reader that does not follow
`same as` still cannot see the edges — including third parties, which is the same discoverability
problem ADR `0030` accepted for the predicate.

**Do not pick by taste.** Settle it on whether a `uses` edge is a claim about the identity or a record
of the account's action, and write the ADR before step 2. Measure first whether any cohort agent has
an operating-account link at all — the answer today is no, for anyone.

## Step 2 — Tools are agents, so most edges need no new atom

In ERC-8004 plus MCP the tool layer and the agent layer are the same layer. `8453:2340` declares six
MCP tools and holds an ERC-8004 identity, so `(A, use, B)` joins two atoms that already exist.

- Where the tool is a registered agent: the edge is one triple fee, no atom creation.
- Where it is not (a REST API, a library, a dataset): one atom, then the triple. `ensureAtomForThing`
  already does this.
- Resolve the tool's atom through the existing identity path. **Never mint a second atom for an
  identity that already has one** — the same fragmentation as step 1, one level down.

**Gate:** an edge written against a cohort agent as the object, created with no atom-creation fee.

## Step 3 — The witness: a tool attests who used it

A tool publishes a signed usage attestation at a resolver URL. The shape is deliberately the one
`packages/protocol/src/signature.ts` already verifies — EIP-712 over RFC-8785 of the document minus its
signature, recovering to a signer the document names.

The attestation says: this agent called me, in this period, this many times. Nothing about quality.

- The agent declares `(A, use, B)` and deposits on the triple.
- B confirms by depositing on the **same** triple, or disputes by depositing on the **counter**-triple.
- Agreement between two parties with opposing interests is a distinct tier on the ladder. Render it as
  one.

No new mechanism is needed for disagreement: Intuition gives every triple a counter-triple.

**Do not** build arbitration, a dispute window, or a resolution authority. The market is the
resolution, and adding an authority is the single biggest scope risk in this task.

**Gate:** one edge confirmed by both parties, and one edge where the counter-triple carries the larger
position, both rendered distinguishably.

## Step 4 — ARP seeds by being the counterparty

ARP's own hires (flow C, task 16) make ARP the third party. Its attestations are the honest kind, and
they are the first edges on the graph that are not self-reports.

**Gate:** one `(ARP, use, cohort agent)` edge backed by a payment or a delegation redemption.

## Step 5 — The interface shows which tier each edge is on

The panel currently shows trust assessments. It must show usage edges with their provenance, and the
five tiers of `docs/14` must be visually distinct:

fact (payment / on-chain call / redemption) · confirmed by both parties · the tool's word · a priced
assertion · **a free self-report, which is nothing**

The bottom tier is the one that gets mistaken for data. If it renders like the others, this task has
made things worse than before it started.

## Out of scope

- Any attempt to observe an agent's runtime. `docs/14` is the argument; a connector in the runtime is
  under the agent's control and authenticates nothing.
- Arbitration or dispute resolution (step 3).
- `ModuleRegistry` on mainnet. ADR `0025` stands, and `docs/14` §"the collapse" is the reason it was
  right.
- Migrating the orphaned triples (step 1).

## Do not do in this task

- Do not resolve any predicate or term by label at runtime. ADR `0015`.
- Do not let a self-report inherit a verified rendering because it arrived through ARP's own SDK. The
  transport does not authenticate the content.
- Do not spend mainnet TRUST to test. `.claude/rules/security.md`: no agent, script or automated
  process may sign a mainnet transaction. Unit tests over a mocked wallet client, `previewDeposit`
  reads, and `eth_call` simulation.

## Which tier of the evidence ladder does this serve?

**Tier 3 → 4 (staked → proven).** Steps 1–2 make staked usage edges exist and be readable at all.
Step 3 adds the first thing in this ecosystem that is not an assertion: two parties with opposing
interests agreeing. Step 4 anchors the first edges in a payment. Step 5 is what stops the ladder from
being flattened at the point a reader looks at it.
