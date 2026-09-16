# 08 — The ERC-8004 agent layer on Intuition: measured state, gap map, and where ARP fits

**Date of measurement**: 2026-09-16
**Endpoint**: `https://mainnet.intuition.sh/v1/graphql` (Intuition mainnet, no auth required for reads)
**Status**: analysis + option set. Nothing here is a commitment. Each option that gets picked needs its own ADR.

This document does not supersede `docs/00_HACKATHON_PIVOT.md` — it succeeds it. The Cook-Off deadline
(2026-06-15) is three months past; `00` remains the historical record of why the MetaMask/Intuition
stack was chosen, but it is no longer a live strategic commitment. See §9.

Every number below is reproducible with the queries in Appendix A.

---

## 1. What actually landed on Intuition mainnet

Between 2026-09-05 and 2026-09-12, the Base ERC-8004 Identity Registry
(`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`) was mirrored wholesale into the Intuition knowledge
graph. This is the cohort behind the "29,000 agents" figure.

| Measurement                             | Value      |
| --------------------------------------- | ---------- |
| Atoms on Intuition mainnet (total)      | 268,501    |
| Triples on Intuition mainnet (total)    | 284,187    |
| Agents asserting `implement → ERC-8004` | **28,648** |
| Agents typed `has type → AIAgent`       | 28,648     |
| `has trust provider` triples            | 28,683     |
| `has trust assessment` triples          | 28,758     |
| `provided by` triples                   | 28,752     |

The cohort is uniform. Every agent atom carries **exactly five** outbound triples:

```
(agent, same as,              eip155:8453/erc721:0x8004A169…A432/{tokenId})   ← ERC-8004 identity anchor
(agent, has type,             AIAgent)
(agent, implement,            ERC-8004)
(agent, has trust provider,   Deep3 Labs)
(agent, has trust assessment, "Deep3 Labs — {name} assessment")
```

Verified on `Agent 8453:6649` (`0x0ea137…765e`) and consistent across every sample taken.

### The trust providers present today

| Provider       | Agents covered      | Signal type                                                                                             | Resolver                                                                                                       |
| -------------- | ------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Deep3 Labs** | **28,644** (99.99%) | Rank-aggregated ERC-8004 Reputation Registry feedback                                                   | `api.deep3.ai/.well-known/intuition/erc8004/agents/{chainId}/{tokenId}/erc8004-feedback-trust-assessment.json` |
| AsterPay KYA   | 54                  | Deterministic rule-based KYA: wallet analysis, sanctions screening, operator KYB, EUR exposure guidance | `asterpay.io`                                                                                                  |
| Helixa Cred    | single digits       | Unstated                                                                                                | `api.helixa.xyz/.well-known/…`                                                                                 |

Deep3 Labs is the incumbent. Their scorer is open source
(`github.com/deep3labs/deep3-agent-8004-feedback`, package `repscore`) and genuinely well built: a
deterministic, prior-free, rank-based aggregation that corrects for reviewers using incompatible
scales, with a `tagmap_hash` stamp for reproducibility and an EIP-712 signature over each published
document. It is not a weak competitor and should not be treated as one.

A worked example of the shell in the wild — `🦞 Clawnch 🦞`
(`0x20dd3a…9028`), 21 outbound triples, richer than the cohort norm:

```
use               → A2A, MCP, OASF
compatible with   → x402
has type          → AIAgent, OASF Agent, A2A Agent, MCP Server
implement         → ERC-8004
available on      → Base
has tag           → x402, tee-attestation, crypto-economic, reputation
created by        → 0x729a121c…de1d
same as           → did:web:clawn.ch
same as           → eip155:8453/erc721:0x8004…A432/2340
has trust provider   → AsterPay KYA, Deep3 Labs
has trust assessment → (one source atom per provider)
```

Clawnch is the exception, hand-curated. It is also the shape of what _every_ agent should look like,
and the gap between it and the other 28,647 is the whole opportunity.

---

## 2. Four findings, in order of strategic weight

### F1 — Identity is solved. Do not rebuild it.

28,648 canonical, content-addressed agent atoms exist, each anchored to its ERC-8004 NFT by the
canonical `same as` predicate (`0xbeebfb7d…f5f0`). ARP's `IdentityRegistry` on testnet was the right
call for the Cook-Off demo; on mainnet it would be a competing registry, which the partner guide
explicitly warns against ("Intuition is not a competing registry"). **ARP should consume this cohort,
not duplicate it.**

### F2 — The reputation layer is occupied, but the signal is thin and free to produce.

Sampling twelve Deep3 assessment documents at random:

| tokenId        | score | reviewers | dimensions                                     |
| -------------- | ----- | --------- | ---------------------------------------------- |
| 6649           | 59.95 | 2         | availability, trust                            |
| 6656           | 47.59 | 1         | general_rating, longevity, trust               |
| 6663           | 67.25 | **1**     | trust                                          |
| 4400           | 67.25 | **1**     | trust                                          |
| 10204          | 67.25 | **1**     | trust                                          |
| 7080           | 63.94 | 2         | trust                                          |
| 12000          | 63.94 | 2         | trust                                          |
| 13854          | 72.05 | 2         | general_rating, longevity, trust               |
| 500            | 38.63 | 3         | availability, general_rating, longevity, trust |
| 2340 (Clawnch) | 55.35 | 26        | availability, general_rating, quality, trust   |

Three different agents scoring an identical `67.25` is not coincidence — it is the same single review
propagated through a deterministic curve. The median agent in this cohort is scored on **one
reviewer**.

This is not a flaw in Deep3's algorithm; it is a property of their input. ERC-8004's Reputation
Registry costs nothing to write, enforces only "an agent cannot rate itself", and the spec itself
says: _"Sybil attacks are possible, inflating the reputation of fake agents… We expect many players
to build reputation systems."_

So the competitive question is not "can we out-aggregate Deep3". It is **"what signal exists that
costs something to produce?"** — and that is the question Intuition's bonding curve was built to
answer, and that ARP already has working machinery for.

### F3 — The capability layer is empty. This is the largest unclaimed surface.

Across the _entire_ Intuition mainnet graph (284,187 triples):

| Predicate / object | Triples |
| ------------------ | ------- |
| `use`              | 194     |
| `uses`             | 184     |
| `has category`     | 120     |
| → `x402`           | 108     |
| → `MCP`            | 78      |
| → `A2A`            | 69      |
| → `OASF`           | 16      |

Set against 28,648 agents. **Nobody can answer "which of these agents can do X."** There is a
reputation score attached to every agent and no statement whatsoever about what any of them is for.
A trust score without a capability claim is not actionable: a 67.25 at _what_?

ARP's two-layer model (ADR 0010) — immutable composition triples plus mutable stake — was designed
for exactly this layer, and the layer is vacant.

### F4 — The economic layer is bootstrap-only.

Every `has trust provider` triple carries a vault. Sampling the top 250 by market cap:
`position_count` is **1 or 2** on every single one, and the assets are the minimum deposits placed by
the writing wallet at creation. The largest genuine market on the whole agent cohort is
~85 TRUST (`8453:18531 → Helixa Cred`, 2 positions); `nekto-ramar05 by Olas → Deep3 Labs` sits at
~59 TRUST on 2 positions. Captain Dackie and Clawnch, the two flagship agents, have **zero** positions
on their own identity atoms.

The partner guide's whole thesis — _"the stake behind each `has trust provider` triple is the
ecosystem's running answer to which opinions deserve weight"_ — is currently a thesis with no market
behind it. Nobody has built the surface where a person would actually place that stake.

### F5 — Half the cohort has no metadata at all.

15,513 of the 28,648 agent atoms (54%) carry the fallback label `Agent {chainId}:{tokenId}`,
description `ERC-8004 agent {chainId}:{tokenId}`, empty image, and `url` pointing at the
`8004scan.io` fallback. Their registration files were empty or unresolvable at mirror time. They are
scored, but they are anonymous.

---

## 3. The layer map — where ARP actually fits

| Layer                        | Question it answers                                | Owner today                         | ARP's move                                                       |
| ---------------------------- | -------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------- |
| Identity                     | _Who is this agent?_                               | ERC-8004 + Intuition (28,648 atoms) | **Consume.** Drop the mainnet ambitions for `IdentityRegistry`.  |
| Retrospective reputation     | _How was it rated?_                                | Deep3 Labs (99.99% coverage)        | **Consume and compose.** Do not compete on feedback aggregation. |
| Compliance / KYA             | _Is it sanctioned, who operates it?_               | AsterPay KYA (54 agents)            | Out of scope. Different business.                                |
| **Capability / composition** | _What can it do, with what tools, in what domain?_ | **Nobody** (194 triples)            | **Claim it.**                                                    |
| **Economic conviction**      | _Who is willing to lose money on this claim?_      | **Nobody** (1–2 positions/vault)    | **Claim it.**                                                    |
| **Bounded execution**        | _Can I safely hand it a budget?_                   | **Nobody**                          | **Already shipped** (ERC-7710 + two custom enforcers).           |
| **Proof of usage**           | _Did it actually do what it claims?_               | **Nobody**                          | **The unique asset** — see O4.                                   |

The positioning shift this implies is precise, and it is a narrowing, not a widening:

> ARP stops trying to be _a trust provider among trust providers_ and becomes **the layer that makes
> the existing trust data actionable** — capability-indexed, economically weighted, and safe to
> delegate against.

Deep3 tells you an agent scored 67.25. ARP tells you _which agent to hire for a Solidity audit, what
its track record is composed of, who has money on that claim, and how to cap its budget before you
hand it one._ Those are complements, not competitors — which is also what makes ARP a plausible
partner rather than a threat, to both Intuition and Deep3.

---

## 4. The connector

This is the foundation every option below depends on. Ship it first; it is read-only, unblocked, and
useful on its own.

**Package**: `@arp-protocol/erc8004` (new workspace package, or a subpath of the existing `sdk/`).

**Read path**, in order:

1. **Preflight resolve** — `(chainId, tokenId)` → canonical agent atom, via the canonical `same as`
   predicate `0xbeebfb7d…f5f0` matched against the exact CAIP string
   `eip155:{chainId}/erc721:{registry}/{tokenId}`. Never resolve by label: on mainnet `use`,
   `implement`, `has tag` and `Base` all resolve to multiple atoms, and on testnet every trust-pattern
   term does. Term IDs are constants (ADR 0015, rule already in force).
2. **Trust surface** — all `has trust provider` + `has trust assessment` triples on that subject,
   with `term`/`counter_term` market data selected explicitly.
3. **Resolver fetch** — follow `object.value.thing.url` (_not_ `object.data`, which is the pinned
   `ipfs://` URI of the atom, not the live document). Fetch each provider's JSON.
4. **Signature verification** — recover the EIP-712 signer over the RFC-8785-canonicalized document
   with `assessment.signature` excluded, keccak256'd. Deep3 signs with
   `0x27A6265e6daf8d9935A3031f2E7cDC4bDFbe2Ebe`. Report `verified | unverified | mismatch` per
   provider. _Nobody currently checks this._ It is cheap and it is a real differentiator.
5. **Freshness** — surface `freshness.validUntil` and mark a document stale rather than silently
   serving it. Providers declare an SLA; hold them to it.
6. **ARP layers** — merge in composition triples, staked positions, and (once O4 lands) execution
   receipts.

**Output** — one merged, honest type:

```ts
type AgentProfile = {
  identity: { chainId: number; tokenId: string; caip: string; atomId: Hex; registry: Address };
  metadata: { name: string; description: string; image: string; url: string; isFallback: boolean };
  assessments: ProviderAssessment[]; // per provider: score, dimensions, evidence,
  // signatureStatus, freshness, reviewerCount
  capabilities: {
    protocols: string[];
    tools: ToolRef[];
    domains: string[];
    source: 'graph' | 'registration-file' | 'inferred';
  };
  conviction: {
    providerVaults: VaultSnapshot[];
    identityVault: VaultSnapshot;
    distinctStakers: number;
  };
  execution?: { receipts: ExecutionReceipt[] }; // O4
};
```

Two design rules carried over from the existing SDK: read-only (the connector never signs), and every
field carries its provenance so a consumer can tell a claim from an inference.

---

## 5. Development opportunities

Seven options. Effort is rough engineering days. Each is independently shippable; the dependency
column is the only ordering constraint.

---

### O1 — The connector + a public read API

**Thesis**: ARP cannot be infrastructure for 28,648 agents while its SDK only reads its own testnet
registry. The connector is the price of entry.

**Ships**: `@arp-protocol/erc8004`, plus `GET /agents/{chainId}/{tokenId}` returning `AgentProfile`
as a public unauthenticated endpoint, plus an embeddable trust panel.

**Why it matters beyond ARP**: it is the first client that verifies provider signatures and enforces
freshness windows. That makes ARP the honest broker in a space where everyone else publishes and
nobody audits.

**Effort**: 3–5 d · **Depends on**: nothing · **Risk**: low. Schema drift on the Intuition GraphQL
endpoint — pin queries in tests against live mainnet.

---

### O2 — The capability layer (the moat)

**Thesis**: F3. 28,648 agents, 194 capability triples. The cohort has reputation without semantics.
ARP has a working `ModuleRegistry`, a `uses`-triple writer, and a domain model — pointed at a
14-module testnet demo manifest instead of at 28,648 real agents.

**Ships**: an indexer that, for each agent in the cohort, reads its ERC-8004 registration file
(A2A agent card / MCP manifest / OASF descriptor) from the Base registry, extracts declared skills,
tools and endpoints, and writes the canonical classification triples on Intuition:
`has category` (OASF), `has tag`, `use → {MCP, A2A, x402, OASF}`, `available on`, and
`(agent, uses, tool)` against ARP's tool atoms.

Start with the ~13,000 agents that have real metadata; the 15,513 fallback-labelled ones (F5) are a
second pass and a data-quality contribution in their own right.

**Why it matters**: this is the only query nobody in the ecosystem can serve today — _"which agents
can do X."_ It is also the input every downstream option needs, and it converts ARP's existing
`ModuleRegistry` from demo furniture into an ecosystem asset.

**Effort**: 8–12 d (indexer, registration-file parsers, write path, rate/gas budgeting)
**Depends on**: O1 · **Risk**: medium. Registration-file formats are heterogeneous; parse
conservatively and mark `source: "inferred"` when guessing. Writing 28k× triples costs gas and
requires the sequential-write discipline from the partner guide (never `Promise.all` from one
wallet). Needs an ADR: writing third-party classification claims is ARP asserting things about
agents it does not own.

---

### O3 — ARP as a trust provider, with a signal that costs something

**Thesis**: F2. Deep3's input is free feedback. ARP's input is staked capital and verified execution.
Two providers on the same agent, with visibly different methodologies, is exactly what the canonical
pattern is designed to display — and the guide's own framing ("a thousand free ratings from throwaway
accounts count for little against a few positions backed by capital") describes ARP's signal, not
Deep3's.

**Ships**: the four-triple shell under an ARP provider atom, plus the resolver at
`https://{arp-domain}/.well-known/intuition/erc8004/agents/{chainId}/{tokenId}/trust-assessment.json`,
EIP-712 signed (ADR 0015 §3 already specifies this).

**Dimensions** — deliberately orthogonal to Deep3's `availability / quality / trust / longevity`:

| Dimension             | Derived from                                         | Cost to fake                 |
| --------------------- | ---------------------------------------------------- | ---------------------------- |
| `composition_depth`   | count + diversity of `uses` triples                  | gas + atom creation          |
| `economic_conviction` | TRUST staked on the agent by distinct wallets        | capital at risk              |
| `execution_verified`  | redeemed delegations with matching declarations (O4) | an actual on-chain execution |
| `domain_calibration`  | per-domain track record                              | time                         |

Publish `null` with an explicit `insufficient-evidence` band rather than a number, wherever the
evidence is thin. Half of Deep3's cohort is scored on one reviewer; refusing to score is a
differentiator.

**Cost, measured on mainnet 2026-09-16**: `atomCreationProtocolFee` and `tripleCreationProtocolFee`
are both 0.1 TRUST and neither is recoverable — they are fees, not deposits that become a position.
The shell is one Atom plus four Triples, so **0.5 TRUST per agent**; the ARP provider Atom is paid
once. Across the cohort that is ~14,300 TRUST, and most of it would buy the right to publish
`insufficient-evidence`.

So coverage follows evidence rather than the registry (ADR 0020). ARP's read API answers for every
agent at no on-chain cost; the shell is written only where ARP holds a distinct staker, an execution
receipt, or capability data the graph lacks. Sponsored writes — an operator paying their own
0.5 TRUST, marked as sponsored — are a separate opt-in path and the layer's first natural revenue.

**Effort**: 5–7 d · **Depends on**: O1, and O2 for anything but a trivial score
**Risk**: medium. Requires operating a resolver with real uptime and freshness obligations
(ADR 0015 flags this). Mainnet _writes_ need a Partner API key for `pinThing`
— **open question**: whether self-pinning the identical canonical JSON to IPFS yields the same CID and
therefore the same atom ID, which would unblock the write path. Must be verified empirically on
testnet before this option is costed. Reads never need a key.

---

### O4 — Proof-of-usage receipts (the signal nobody else can produce)

**Thesis**: ARP's README states plainly: _"No verification of declarations — when an agent declares
'I use tool X', the only economic check is its own stake."_ That is the same weakness ERC-8004
feedback has. But ARP is the only project in this stack that already runs **bounded execution**: when
an agent acts under an ERC-7710 delegation, the redemption is an on-chain fact, the caveat enforcers
ran, and `DomainScopeEnforcer` _already proves the action fell inside a declared domain_.

Turn that byproduct into the product.

**Ships**: an execution receipt — `(delegationHash, redeemer, target, domain, blockNumber)` — emitted
by the enforcers (they already emit `DomainScopeChecked` and `StakeCapChecked`), indexed, and folded
into the resolver document as `evidence[]` entries of type `execution-receipt`. A declaration backed
by a redeemed delegation is _verified_; one backed only by self-stake is _declared_. The distinction
is legible in the JSON and in the UI.

**Why it matters**: every other signal in this ecosystem is an opinion. This one is a transaction. It
is also the honest answer to the README's own "what's not in this MVP" list, and it is the single
hardest thing for a competitor to copy — it requires having built the delegation layer, which
everyone else skipped.

**Effort**: 6–10 d (enforcer event surface is mostly there; needs an indexer + receipt schema +
resolver integration) · **Depends on**: O1, O3 · **Risk**: medium-high. Only covers agents that
actually execute through ARP delegations — starts at near-zero coverage and grows with adoption.
That is a cold-start problem, not a design flaw, and it argues for pairing it with O5.

---

### O5 — Bounded hiring: turn the cohort into a marketplace

**Thesis**: 28,648 agents you can score and cannot safely pay. ARP's `/hire` flow already does
discover → pay → execute → receipt on testnet with a 14-tool manifest. Point it at the real cohort.

**Ships**: `/hire` backed by the ERC-8004 cohort — filter by capability (O2), rank by merged trust
(O1) — with the consumer signing one ERC-7710 delegation bounded by `DomainScopeEnforcer` +
`TrustStakeCapEnforcer`, and x402 as the payment rail for agents that declare it (108 already do).

**Why it matters**: it closes the loop. Hiring generates execution receipts (O4), which feed ARP's
assessment (O3), which improves ranking, which drives hiring. It is also the only user-facing reason
a non-crypto-native would touch any of this: _"hire an agent, cap its budget, get a receipt."_

**Effort**: 6–8 d · **Depends on**: O1, O2 · **Risk**: medium. Most of the cohort has no live
endpoint to hire against — scope the launch to agents with a resolvable A2A/x402 endpoint, which is a
small, honest subset. Say so in the UI rather than papering over it.

---

### O6 — The curation market for providers

**Thesis**: F4. Every `has trust provider` triple is a stakeable vault with support and opposition
sides, and it has 1–2 positions. The market Intuition designed exists on-chain and has no front end.

**Ships**: a per-agent trust panel showing each provider's claim with its live support/opposition
market, and support/oppose actions on the `has trust provider` vault. ARP already has
`use-vault-metrics`, `atom-stake`, and a stake form — the components exist.

**Why it matters**: it is the cheapest option here and the most directly aligned with Intuition's own
thesis. It also gives ARP a reason to be in the conversation with the Intuition core team that costs
almost nothing to build. And ARP staking its own TRUST on its own assessments is the credible
commitment its competitors have not made.

**Effort**: 3–4 d · **Depends on**: O1 · **Risk**: low. The honest caveat: a market this thin is
easily moved by a single participant. Display position counts and distinct stakers, never a bare
market cap.

---

### O7 — Cross-chain coverage (a partnership offer, not a product)

**Thesis**: 8004scan reports roughly 107k indexed agents — Base ~34k, BSC ~44k, Ethereum ~29k.
Intuition mirrors Base only. Two thirds of the ERC-8004 population is invisible to the graph.

**Ships**: an ingestion path for the BSC and Ethereum registries following the canonical recipe
verbatim (same `pinThing` normalization, same `same as` anchor, same fallbacks).

**Why it matters**: it is a concrete, measurable contribution to Intuition and Deep3 rather than a
competing product — the strongest possible opening for the partner conversation. It is also the
fastest route to ARP being the _default_ connector, because it would be the only one covering the
whole population.

**Effort**: 5–8 d · **Depends on**: O1 · **Risk**: high, and mostly non-technical. This is
plausibly Intuition's or Deep3's roadmap; doing it unilaterally risks duplicating the canonical atoms
and fragmenting staking surfaces — the exact failure the frozen recipe exists to prevent. **Ask
before building.** Propose it; do not ship it uninvited.

---

## 6. Recommended sequencing

**Phase 1 — become a credible reader (≈1.5 weeks).** O1 + O6.
Both are read-side, unblocked, low-risk, and immediately demonstrable. At the end of Phase 1 ARP can
show a merged, signature-verified, market-weighted trust panel for any of the 28,648 agents — which
is more than any current participant ships. This is also the artifact to put in front of Intuition
and Deep3 before asking for anything.

**Phase 2 — claim the empty layer (≈2–3 weeks).** O2.
The capability index is the moat and the input to everything after it. Start with the ~13k agents
that have real metadata.

**Phase 3 — publish a signal that costs something (≈2 weeks).** O3 + O4.
Only worth doing once O2 gives the dimensions something to measure. O4 is the piece nobody can copy.

**Phase 4 — close the loop (≈1.5 weeks).** O5.

**O7 is a conversation, not a phase.** Raise it in Phase 1; build it only if invited.

The through-line: **read before you write, verify before you score, and only publish a number when
the evidence cost something to produce.**

---

## 7. Open questions to settle before committing

1. **Partner API key — obtained and verified working** (2026-09-16). `bun run verify:pin` returns
   401 unauthenticated, 200 with the key. No longer the blocker ADR 0015 assumed. See §8 for the
   wiring decision it forces.
2. **Canonical recipe determinism — RESOLVED, MATCH** (2026-09-16). Re-pinning the exact canonical
   Thing for agent `8453:6649` through the partner API returns
   `ipfs://bafkreif6xwptjdsux2iwnhdbxyjom23bzzimhk62y574rreexdghi6hlbq`, byte-for-byte identical to
   that atom's on-chain `data`. So ARP can derive any agent's canonical atom locally, preflight
   against the indexed `subject.term_id`, and write without risking the duplicate-atom fragmentation
   the frozen recipe exists to prevent. This is the prerequisite O2 and O3 depend on, and it now
   holds. Reproduce with `bun run verify:pin`.
3. **Self-pinning independence — still open**, and distinct from the question above. The resolved
   test used the partner API; it says nothing about whether pinning the same JSON-LD to IPFS through
   any other pinning service yields the same CID. Only matters as resilience against the partner API
   going away. Low priority while the key works.
4. **Mainnet or testnet for ARP's own contracts.** The cohort is on mainnet; ARP is entirely on
   testnet 13579. Deploying `ModuleRegistry` + enforcers to Intuition mainnet is a real-money
   decision, currently prohibited by `CLAUDE.md` without explicit per-session confirmation. Needs a
   deliberate call, not a drift.
5. **Does `IdentityRegistry` survive?** F1 says ARP should consume ERC-8004 identity, not mint it.
   The testnet `IdentityRegistry` was correct for the Cook-Off. Keeping it on mainnet would put ARP
   in the position the partner guide warns against. Recommend: retire it from the mainnet plan,
   keep it as the testnet demo fixture. This supersedes part of ADR 0014's framing and needs its own ADR.
6. **Resolver hosting** — O3 and O4 make ARP responsible for a public endpoint with uptime and
   freshness obligations. Where does it live, who is on call, what happens when `validUntil` lapses?
7. **Relationship posture with Deep3.** Complement or compete? This document argues complement, and
   the dimension design in O3 is deliberately orthogonal. That should be a stated decision, not an
   emergent one — it changes how O2 and O3 are written and announced.

---

## 8. Regression found while measuring: ARP's write path is dead

Discovered 2026-09-16 while probing the pinning endpoints. Unrelated to the cohort analysis above,
but it blocks every option in §5 that writes.

`pinThing` has been **removed from the indexer GraphQL endpoints**. Both return the same error:

```
POST https://testnet.intuition.sh/v1/graphql   -> {"errors":[{"message":"no mutations exist"}]}
POST https://mainnet.intuition.sh/v1/graphql   -> {"errors":[{"message":"no mutations exist"}]}
POST https://pin.intuition.systems/v1/graphql  -> 401 {"message":"No API key found in request"}
```

Pinning moved to the gated `pin.intuition.systems`, exactly as `docs/07` describes. ARP never
followed the move: `app/src/services/intuition-pin.ts` still posts to `deployments.chain.graphqlUrl`,
which is now read-only.

Broken call sites — checked one by one, not assumed:

| Call site                                                        | Invoked from | Effect                            |
| ---------------------------------------------------------------- | ------------ | --------------------------------- |
| `scripts/seed.ts` (own local `pinThing`)                         | node         | seeding dead                      |
| `scripts/agent-loop.ts:142` → `redeemEnsureAtomForThing`         | node runtime | compose path dead                 |
| `scripts/agent-stake-on-use.ts:173` → `redeemEnsureAtomForThing` | node runtime | stake-on-use path dead            |
| `intuition-graph.ts` → `getOrCreateUsesPredicateAtomId`          | node runtime | "uses" predicate cannot be minted |

No browser flow pins. `RegisterModule.tsx` takes the `schemaURI` as typed user input;
`ToolDetail.tsx` uses `ensureAtomForURI`, the explicitly non-pinning variant (ADR 0008);
`AgentRegister.tsx` never touches a pin path. The damage is confined to the runtimes and the seed
script — which is also where the demo lives.

Also stale: the vendored `intuition` skill still states that the indexer endpoint "supports pin
mutations — `pinThing`, `pinPerson`, `pinOrganization`"
(`.claude/skills/intuition/reference/graphql-queries.md:35`, and the recipe in `reference/schemas.md`).
Per ADR 0005 the skill is a vendored snapshot; it needs a re-sync.

### Resolved

Recorded in **ADR 0016** — Intuition writes move server-side. `pinThing` targets
`pin.intuition.systems` and takes its credential as an explicit parameter rather than an ambient
`process.env` read, so only Node entry points can supply one and browser code loses the call by
construction. `INTUITION_PIN_API_KEY` is documented in `.env.example` with an explicit prohibition on
the `VITE_` prefix, and `bun run verify:pin` validates the key while also proving the canonical
agent-atom recipe reproduces byte-for-byte.

Execution plan: `tasks/06-pin-writes-server-side.md`. Phase 1 (O1 + O6) is read-side and does not
wait on it.

---

## 9. Governance note

`CLAUDE.md` names `docs/00_HACKATHON_PIVOT.md` as the top source of authority. Its deadline passed on
2026-06-15. Continuing to treat it as the live commitment means the repo's stated strategy is a
hackathon that is over, and the narrative-preservation check on tasks 02b/03b/04b/05b is now
enforcing a submission that has already shipped.

Recommended once a direction is picked from §5: add a successor commitment doc, re-point the
`CLAUDE.md` authority list at it, demote `00` to historical record, and replace the
narrative-preservation check with whatever the new commitment's equivalent is. That is itself an ADR.

No rule files or router entries were changed by this document.

---

## Appendix A — reproducing the measurements

All queries run unauthenticated against `https://mainnet.intuition.sh/v1/graphql`.

```bash
gq() { curl -s -X POST https://mainnet.intuition.sh/v1/graphql \
  -H 'Content-Type: application/json' -d "$1"; }
```

**Cohort size**

```graphql
{
  triples_aggregate(
    where: {
      predicate_id: { _eq: "0xfa02609bfde5a9a7ba18fa8afc1c42bc643edfaf7d44e3ce9e50835290d03324" }
      object_id: { _eq: "0x595ba5059b23a9aa4d64deff324ff3d957866715d5b7b8015eebc9009bab78b2" }
    }
  ) {
    aggregate {
      count
    }
  }
}
```

**Provider coverage** (swap `object_id` for another provider atom)

```graphql
{
  triples_aggregate(
    where: {
      predicate_id: { _eq: "0xdc3c5639b39f9b6553b75b37c47fa4810961392b28956234ba9f401a98f43888" }
      object_id: { _eq: "0xdaf11206a8c7093860b53fa376178a46c8c802663fb2485f051b2d65c627c23f" }
    }
  ) {
    aggregate {
      count
    }
  }
}
```

**Capability-layer density**

```graphql
{
  use: triples_aggregate(where: { predicate: { label: { _eq: "use" } } }) {
    aggregate {
      count
    }
  }
  uses: triples_aggregate(where: { predicate: { label: { _eq: "uses" } } }) {
    aggregate {
      count
    }
  }
  hascat: triples_aggregate(where: { predicate: { label: { _eq: "has category" } } }) {
    aggregate {
      count
    }
  }
}
```

**Fallback-metadata count**

```graphql
{
  atoms_aggregate(where: { label: { _similar: "Agent [0-9]+:[0-9]+" } }) {
    aggregate {
      count
    }
  }
}
```

**Market depth on a provider claim** — select `term`, `counter_term` and
`vaults(where: {curve_id: {_eq: "1"}})` explicitly; market data is never returned by default.

## Appendix B — constants used above

Cross-checked against Appendix B of `docs/07_INTUITION_ERC8004_PARTNER_GUIDE.md`; every ID below was
independently confirmed against live mainnet data on 2026-09-16.

| Term                               | ID                                                                   |
| ---------------------------------- | -------------------------------------------------------------------- |
| `same as` (predicate)              | `0xbeebfb7d177cbd96ffc239d2196c72ec346efe81f39dc595773f13d83506f5f0` |
| `has type` (predicate)             | `0xa632a94306ab1d56911cff8c06473659a7caa2dfec6de3921bc23ec8ebf96ced` |
| `implement` (predicate)            | `0xfa02609bfde5a9a7ba18fa8afc1c42bc643edfaf7d44e3ce9e50835290d03324` |
| `has trust provider` (predicate)   | `0xdc3c5639b39f9b6553b75b37c47fa4810961392b28956234ba9f401a98f43888` |
| `Trust Assessment Source` (object) | `0xf8a0ea34c8e7195b63d1641141166cc56e9128e25cf8c9f68ac6b81527b78f07` |
| `ERC-8004` (object)                | `0x595ba5059b23a9aa4d64deff324ff3d957866715d5b7b8015eebc9009bab78b2` |
| `AIAgent` (object)                 | `0x800342c0ded1c288e69f39a2dc96d8cff9b242e9f573193e6e0a849e5315d3e9` |
| `Deep3 Labs` (provider)            | `0xdaf11206a8c7093860b53fa376178a46c8c802663fb2485f051b2d65c627c23f` |
| `AsterPay KYA` (provider)          | `0x6d7cd747553fc564c5aa716f6c983b0540461b0839fa6e5fca0608244f22743d` |
| `🦞 Clawnch 🦞` (agent)            | `0x20dd3a62fee16233e1747a597291dd8faa10a1eb6783afe2bc52eab62df89028` |
| Base ERC-8004 registry             | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`                         |
| MultiVault (mainnet / testnet)     | `0x6E35cF57…` / `0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91`         |

Label-based resolution is forbidden (ADR 0015): on mainnet `use`, `implement`, `has tag` and `Base`
each resolve to multiple atoms, and `has trust provider` resolves to two.
