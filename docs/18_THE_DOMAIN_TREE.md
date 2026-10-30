# 18 — The domain tree

A theory, not a plan. No code follows from this document until the three open decisions at the end
are made.

Every figure here is from `scripts/measure/classification-vocabulary.ts` and
`scripts/measure/tag-object-discipline.ts`, run 2026-10-28, recorded in
`data/measurements/classification-vocabulary-2026-10-28.json`. Two chains, two populations, never summed.

## 1. The job

ARP has three questions and no vocabulary to answer any of them.

| Question                                | Asked by                   | Today                                                  |
| --------------------------------------- | -------------------------- | ------------------------------------------------------ |
| What is this tool **about**?             | the registry               | nothing. 53 tool atoms carry a URL, 46 a quoted description |
| What may this agent **spend on**?        | `DomainScopeEnforcer`      | a flat `bytes32[]`, and it gates `registerModule` only |
| What is this agent **looking for**?      | `arp_find_tools`           | nothing. It returns all 53 rows                        |

One list would serve all three. That is the whole reason to care about a domain tree: not
classification for its own sake, but the fact that the thing an agent searches by and the thing its
delegation is scoped by must be the **same** thing, or the guard rail does not guard the search.

## 2. What already exists on the chain

### The predicate exists, and there is only one

Mainnet 1155, 2026-10-28:

| predicate                        | term id      | edges      |
| -------------------------------- | ------------ | ---------- |
| `has tag` (`Keywords`)           | `0x7ec36d20…` | **58,064** |
| `has type` (`Thing`)             | `0xa632a943…` | 57,574     |
| `has tag` (`TextObject`)         | `0x6de69cc0…` | 1,285      |
| `in context of` (`Thing`)        | `0x892054b0…` | 1,227      |
| `has category` (`Thing`)         | `0x96c20ddd…` | 120        |
| `is a` — **three distinct atoms** | —            | 53 / 3 / 1 |
| `belongs to` — two atoms         | —            | 12 / 1     |

So ARP does not mint a classification predicate. Excluding the two `has type` atoms — which answer
*what kind of thing is this*, a different question, and are already written by ARP's identity plan —
the remaining edges total 60,767 and `0x7ec36d20…` carries **58,064 of them, 95.5%**. ARP already holds
its term id (`INTUITION_HAS_TAG_MAINNET`), and minting a new one would put ARP's tags where nothing
else reads them.

The table also shows the failure this whole repo is organised against: `is a` is **three** atoms,
`has tag` is **two**, `belongs to` is **two**. A label is free text inside a hashed document, so the
same word minted twice is two nodes with two separate markets. ADR `0054` says this about tool URLs;
it is true of vocabulary too, and more damaging, because a vocabulary term is supposed to be shared.

### No hierarchy predicate exists on mainnet

`is a sub-domain of`, `subConceptOf`, `sub concept of`, `part of`, `partOf`: **zero edges**, all
five, mainnet. Nothing on Intuition mainnet expresses a parent today.

### The object side is not a vocabulary

Of the 58,064 mainnet `has tag` edges: **1,666 distinct objects**. Of the 1,656 that carry a label —
93 read as prose rather than as terms (over four words, or containing `? ! ,`), and 31 groups differ
only in case or trailing whitespace: `overrated` / `Overrated`, `Football` / `FOOTBALL`, `Anoma` /
`"ANOMA "`, `Trustworthy` / `trustworthy`. The sampled labels include `muscian`, `funny`,
`the real vibe here, friends` and `Welcome to`.

This is the finding that decides ARP's contribution. The **predicate** is settled and should be
reused. The **objects** are a free-text field with 31 measured collisions and no discipline, and
reusing them wholesale would import the mess. ARP's work is on the object side.

Two qualifications, both of which cut against a clean sweep:

- **Some of those objects are exactly right.** `Developer tools`, `Indexing`, `Crypto Exchange`,
  `Infra`, `Web3 Project`, `Base Ecosystem` are terms a tool registry wants. Minting ARP copies of
  them would fragment the one thing that is already working.
- **They are already staked.** Of 249 sampled mainnet tag atoms, **157 carry more than one
  position** (ADR `0042`: every term is born with `minShare`, so `positionCount > 1` is the evidence,
  not assets). The market on classification is not hypothetical and not ARP's to start. It exists,
  with real TRUST in it, and ARP would be joining it.

### The type system is not what the spec says

The indexer stores **14** `atom_type` values on mainnet (16 on testnet, adding `Book` and `Caip22`).
`DefinedTerm` — the type `intuition-data-structures` uses for a concept, and the type the ontology
app models against — **is not one of them**. A query filtering on it fails outright:
`invalid input value for enum atom_type`. And `Keywords`, the type that does exist, is carried by
exactly **one** atom on each chain: the `has tag` predicate itself.

Of 250 distinct mainnet tag objects sampled, 212 are typed `Thing`, 20 `TextObject`, 12 `Account`
and 4 `Organization`. None of the 14 available types means "concept", so whatever marks an ARP domain
has to be an edge, not a type.

## 3. What exists in the ontology app

`/home/max/Project/ontotology` is the most developed vocabulary work in any of these repos and it is
all off-chain. `src/data/`:

- `atom-types.ts` — **38 types** with per-type on-chain and enrichment field schemas, sourced from
  `0xIntuition/intuition-data-structures/classifications`. Including `AIAgent`, and a deictic `Self`
  whose docstring makes the pooling argument ARP needs: a shared subject means "the system pools
  signal on one canonical claim instead of fragmenting across duplicates".
- `predicates.ts` — **68 predicates** in 12 semantic groups, each with a subject-type and
  object-type compatibility matrix. The relevant four already exist there by name:
  `has_tag` (label `has tag`), `subConceptOf` ("Term is a sub-concept of another"), `isA`,
  `taggedWith`.
- `hierarchy.ts` — a 36-node Schema.org inheritance tree for the D3 radial view.

What it gives ARP: a predicate inventory, the compatibility-matrix idea, and the pooling argument.

What it cannot give ARP, and this is the important half:

1. **Its hierarchy is a type tree, not a subject tree.** `Thing → CreativeWork → Book` answers
   "what kind of thing is this", which is `has type`'s job and is already done. `payments → stripe`
   answers "what is this about". A tool registry needs the second and the file has only the first.
2. **Its taxonomy is a TypeScript file.** Nobody can disagree with it, stake against it, or extend
   it without a pull request. That is the asserted rung of the ladder — `docs/09` §3 — and ARP's
   position is the top two.
3. **`subConceptOf` has never been written.** Zero edges, both chains. It is a definition in a file,
   not a predicate in use.

## 4. What exists in the liquid-democracy repo, including its counter-example

`/home/max/Project/Liquid-Demo` is the only place where a subject hierarchy is actually on a chain.
`manifest/13579.json`: predicate `is a sub-domain of` = `0x9c2e2f20…`, 17 domain atoms, 16 edges,
root `governance`.

Its mechanism is the part worth taking:

- An edge is a triple spelled out in full — `grants — is a sub-domain of — treasury` — so the
  manifest reads as what is on the chain rather than as an abbreviation of it.
- `readEdgeStates` reads each edge's live `getVaultType` and the attestor's shares. An edge
  **authorizes** only when it is a positive triple *and* the attestor holds a position. A
  counter-triple, or an unstaked edge, is drawn but does not carry a path.
- `pathTo` is a BFS over authorizing edges only, so every path the UI produces is one the contract
  will accept. Cycles are cut by an ancestry set; a path over the governor's `MAX_DOMAIN_PATH` is
  refused client-side.
- The contract cannot discover the tree. The MultiVault has no reverse index, so the redeemer
  **supplies the path as a witness** and the contract verifies it. Discovery off-chain, verification
  on-chain.

And then the thing that makes this document necessary. Those 16 manifest edges are not what is on
testnet 13579. **42** edges carry that predicate. The 26 published after the manifest was written
include:

- **9** nodes labelled `rehearsal 2026-08-29T06:46` and similar — timestamped test runs, permanent;
- **5** edges giving `motion design` five different parents — `UX`, `design`, `protocol`,
  `governance`, `treasury`. One node, five parents. That is not a tree;
- `Design` and `design` as **two different atoms**, with the typo `motion-desing` attached to one of
  them;
- `macro-grant — is a sub-domain of — micro-grants`, which inverts the hierarchy;
- one node with an **empty** label and one whose label is **270 `x` characters**, both attached
  directly to the root.

Those 26 edges fall into eight classes: the seven failures above plus the legitimate design/legal
subtree, which is 19 junk edges and 7 real ones. `checkDomainLabel` in that repo now refuses **three**
of the seven junk classes — the empty label, the 270-character one (`MAX_DOMAIN_LABEL` is 48), and a
second parent for a label that already exists —
with a docstring explaining what each cost. It does **not** catch the other three, and cannot: `Design`
beside `design` passes an exact-match duplicate check, `motion-desing` is a well-formed new label, and
nothing in a label tells you that `macro-grant` does not belong under `micro-grants`. And it refuses
what it refuses **in that app's form**. The chain has no check at all and never will.

## 5. The theory

> **A tree is a reading of the graph, not a property of it.**

The graph is append-only and permissionless. Anybody can publish `X is a sub-domain of Y` for any X
and Y, and nothing can be removed. So "the domain tree" is never a thing you have; it is the output
of a rule applied to every edge that exists. The 42 edges above are the proof: the same predicate,
the same chain, one honest manifest and one unusable graph, differing only in which rule you read
them with.

Three rules are available, and the choice is the whole design.

| Rule                 | Who decides a node's parent        | Fails when                                          |
| -------------------- | ---------------------------------- | --------------------------------------------------- |
| **a manifest**       | whoever commits the file           | the file and the chain disagree — measured, 16 vs 42 |
| **an owner**         | whoever holds a key                | the owner stops, or is us                           |
| **stake**            | whoever paid the most for the edge | nobody has paid yet                                 |

Liquid-Demo uses (a) plus a weak form of (c): a committed manifest, filtered by one designated
attestor's position. That is right for a demo with a known governance root and a known operator.

ARP cannot use (a) or (b). `portability.md` rule 4 is explicit — a step that works because ARP
controls something is a rehearsal prop, not a step — and a tool taxonomy that only works while we
maintain the file is the asserted rung ARP exists to climb off.

So ARP's rule is stake, and it reads like this:

> A domain's parent is the parent edge with the most TRUST behind it. Where two parent edges are
> within noise of each other, the node has no settled parent and the UI says so rather than picking.

What that buys, and it is more than tidiness:

1. **The 42-edge mess resolves itself without a delete.** `motion design`'s five parents become one
   answer and four dissents, ranked. `macro-grant` under `micro-grants` is refuted by depositing on
   its counter-triple — which every triple is born with — rather than by an admin removing a row.
   The junk edges stay on the chain, carry nothing, and cost their publisher.
2. **The taxonomy is the product, not scaffolding for it.** "Is Stripe a payments tool" becomes a
   priced claim with two sides. That is the same mechanism as "is this tool any good", on the same
   contract, which means one market design covers both and ARP has no second thing to explain.
3. **It is the only rule that is still true on mainnet.** ARP owns the ERC-8004 registry on testnet
   13579 and owns nothing on 1155. A stake-read tree does not care.

What it costs, stated plainly because it is the real objection:

- **An empty market has no answer.** On day one no domain edge has a position, so the rule returns
  nothing and the tree is unreadable. It needs a bootstrap — the first publisher's own deposit is
  the seed, and `docs/12` point 3 is already that shape. But the first reading of the tree is a
  reading of whatever ARP paid for, and that must be said out loud rather than presented as consensus.
- **Stake is not correctness.** Money says what people will defend, not what is true. The honest
  claim is the ladder's own: staked is a rung above rated, and below proven. A domain edge is
  staked, never proven.
- **Reading it costs a query per edge.** Liquid-Demo reads `getVaultType` and `sharesOf` per edge
  over 16 edges. Over a few hundred domains that is an indexer query, not an RPC loop, and the
  indexer's `position_count` is already the figure ADR `0042` says to use.

## 6. The shape that follows

Not a plan — the consequence of the above, so the open decisions have something to attach to.

- **One predicate for "about"**: the existing `has tag` `0x7ec36d20…`. A tool's domain is
  `(tool atom, has tag, domain atom)`, which every Intuition reader already understands.
- **One predicate for "under"**: a hierarchy edge is `(child, is a sub-domain of, parent)`. Nothing
  on mainnet uses it; `0x9c2e2f20…` is the atom testnet already has.
- **Domains are atoms, so they are markets.** No new contract, no registry, no table.
- **The path is a witness.** Whatever enforcer eventually gates spending takes the path from the
  agent and verifies it, exactly as `OZGovernor.MAX_DOMAIN_PATH` does. Discovery off-chain,
  verification on-chain.
- **`DomainScopeEnforcer` as deployed does none of this.** It scans a flat `bytes32[]` and gates
  `registerModule` only; its source and tests were deleted on 2026-10-21 in `59ac83a` while the
  bytecode stays deployed on both chains. Any spending guard rail is new work, not a wiring job.

## 7. Open decisions

Three, and the first is the only one that blocks everything else.

1. **Who the vocabulary belongs to.** One tree shared with the liquid-democracy repo under the
   existing `is a sub-domain of` atom, so a domain minted in either project is the same node and
   pools signal — at the cost of inheriting its 26 junk edges on testnet. Or ARP's own hierarchy
   predicate, clean, and two vocabularies that never meet.
2. **Reuse or mint the objects.** `Developer tools` and `Infra` exist and are staked; reusing them
   pools signal, and accepts their neighbours. Minting ARP copies gives a clean tree that starts
   with no market and competes with the one that has 157 staked terms in it.
3. **Depth and breadth.** 53 tools need something like 8–15 top-level domains. Liquid-Demo's tree
   runs five levels at its deepest — `micro-grants → builder-grants → grants → treasury →
   governance`. A deeper tree scopes a delegation more precisely and makes every path longer, and
   the path is what the agent has to present on every redemption.

## Evidence ladder

This document serves the **staked** tier and is the first thing in the repo that could move the
classification layer onto it: a tool's domain is asserted today in a quoted sentence nobody can
contradict, and the proposal makes it a claim with a price and a counter-side.
