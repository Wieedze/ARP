# ADR 0030 — The `use` edge is chosen on meaning, not on publication

**Date**: 2026-10-16
**Status**: Accepted
**Supersedes**: the choice recorded in commit `5e1d5d2`, which this ADR reverses.

## Context

ARP writes `(agent, uses, tool)` to record composition. Until `5e1d5d2` it minted its **own**
predicate atom by pinning a Thing named `"uses"` with an ARP-specific description. Atom ids are
content-deterministic over the pinned URI, so this produced a node that is in neither of the ids the
connector filters on in `CAPABILITY_PREDICATE_IDS` — ARP wrote edges its own reader could not see,
and nobody else could either. `docs/07`: "do not mint your own copies — a differently-pinned
duplicate is a different node and fragments the staking surface."

That much was never in doubt. The question was which shared node to join.

### What `5e1d5d2` decided, and why it was wrong

It chose `use` `0x9ddda4ac…` because that is the id published in Appendix B, reasoning that ADR 0015
makes publication the rule and that the 27-edge difference against `uses` `0x5c0bde1c…` was noise.

**Both of those statements are true and the conclusion was still wrong, because the decision was made
on the wrong axis.** Publication and volume only decide between nodes that _mean the same thing_.
These two do not. Reviewed and then verified directly — every edge on each predicate, by object:

| predicate            | objects that are a protocol or standard      |
| -------------------- | -------------------------------------------- |
| `use` `0x9ddda4ac…`  | mainnet **153 / 158**, testnet **166 / 166** |
| `uses` `0x5c0bde1c…` | mainnet **0 / 185**, testnet **0 / 143**     |

`use` means **"supports this protocol"**. Its objects are A2A (69), MCP (68) and OASF (16); the five
remaining mainnet edges are one person listing ReactJS, Figma, TradingView, Grok and Photoroom. And
`docs/07` Appendix B's object table for `use` is five rows — ERC-8004, x402, MCP, A2A, OASF. The
domain is **enumerated and closed**.

`uses` means **"this entity uses this tool"**. Its objects are Intuition (24), Base (14), Ethereum
(7), IPFS (7), Claude (6), GitHub (6), Bitcoin (5), Obsidian (5), Cursor, VS Code, ChatGPT. Subjects
are ENS names, raw addresses, people and Things. That is an organically grown predicate carrying the
exact semantics ARP needs.

Two further facts settled it:

- `bucketFor` in `erc8004/src/sources/intuition/index.ts` files relation `uses` under
  `capabilities.protocols`, which is correct for `use`'s 153/158 and 166/166. Writing a tool edge on
  `use` would make ARP's own connector render **a tool as a protocol** — precisely the tier
  flattening `tasks/19` step 5 exists to prevent.
- For ARP's **reads** the choice is a no-op: `terms.ts` puts _both_ ids in
  `CAPABILITY_PREDICATE_IDS` and `map.ts` maps both to relation `uses`. So nothing is stranded from
  ARP's own queries either way, and the whole weight of the publication argument was
  third-party discoverability.

## Decision

**Write on `uses` `0x5c0bde1cc696456c0268248c4656acdf9621fdb39e605bc99b0a83dc8ff6e800`.**

Choose the predicate whose established meaning matches the claim. Where meaning and publication
disagree, meaning wins: **wrong data is not repaired by being discoverable.**

ADR 0015 is unchanged and still binding — ids stay frozen, never resolved by label at runtime. Five
atoms share the label `use`/`uses` on testnet and four on mainnet, so a label lookup is a coin flip
between fragmented nodes. ADR 0015 simply does not adjudicate _which_ frozen id; this ADR does.

Also decided:

- **`declareUsesTriple` takes no `PinAuth`.** A predicate is not ours to create, so nothing is pinned
  and declaring a triple is credential-free.
- **A preflight on the predicate.** `isTermCreated(predicate)` before `createTriples`, throwing
  `PredicateNotOnChainError`. Without it a chain missing the predicate meant an on-chain revert
  _after_ the user had approved and paid gas. ADR 0015 item 5 requires a preflight on every write
  path; this one guarded the triple but not the predicate.
- **The orphaned triples are not migrated.** They cannot be: Intuition has no deletion.

## Consequences

**Positive**

- ARP joins a surface that already carries ~328 tool-usage edges across both chains instead of
  starting one, and stops contradicting the published canon for `use`.
- A tool no longer renders as a protocol by construction.
- Declaring a triple needs no partner credential.
- Two guard tests: the write predicate must be inside `CAPABILITY_PREDICATE_IDS`, and the frozen id
  is asserted literally so the semantic choice cannot be edited away silently.

**Negative**

- **`uses` is not in Appendix B.** A third party following the partner guide will filter on `use` and
  will not see ARP's edges. This is the accepted cost, and it is the one thing publication bought.
  The remedy is to have `uses` canonised rather than to write wrong data: Appendix B documents an
  extension path, and Intuition publicly invited a connector proposal. The measurements in this ADR
  are the proposal's evidence — a vocabulary slot with 328 genuine edges, fragmented across four to
  five atoms, with no published owner.
- `uses` keeps looser company than `use`: `(I, uses, love)` and similar sit alongside the tool edges.
  Semantics wins anyway; a noisy neighbourhood is survivable, a wrong predicate is permanent.
- **The read side still cannot distinguish the two.** Both map to relation `uses` and bucket to
  `protocols`, so `uses`'s 185 mainnet edges are _already_ mislabelled as protocols today,
  independent of this change. Splitting the relation changes the connector's public `Capabilities`
  type and is recorded as `tasks/20` rather than smuggled into this fix.

**Neutral**

- Both ids exist on both chains under the same id, verified on-chain via `isTermCreated` and
  `isAtom`, so one constant serves mainnet and testnet. `docs/07` already stated this and ADR 0015
  notes `has tag` as the exception — the measurement confirmed rather than discovered it.
- The orphan node is `0x3707e587ade3f003f79bfdfa820a7d51900ab9e2b7226800ac4f4e09865e60e5`, label
  `uses`, whose pinned description is byte-for-byte the string from the deleted helper. **21 edges,
  testnet only, 21,000,000 wei ≈ 2.1 × 10⁻¹¹ tTRUST stranded; absent from mainnet entirely.** So the
  bug cost nothing material and never touched real TRUST. Subjects were `ARP Agent #1` and the two
  runtime accounts.
- The commit that this ADR reverses is left in history rather than rebased away. The wrong decision
  and its correction are both part of the record, which is the point of this directory.
