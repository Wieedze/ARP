# Task 20 — A tool renders as a protocol

> **Status: IMPLEMENTED, AWAITING VERIFICATION** 2026-10-16. Recorded from the
> `intuition-integrator` review of ADR 0030. **This was a live defect, not a refactor** — it
> mislabelled 185 mainnet edges. The appendix defect (unvalidated CIDs) is **not** fixed here.

## The finding

`erc8004/src/sources/intuition/map.ts` maps both predicates to one relation:

```ts
[USE]: "uses",
[USES]: "uses",
```

and `erc8004/src/sources/intuition/index.ts`'s `bucketFor` files relation `uses` under
`capabilities.protocols`.

That is right for `use` and wrong for `uses`. Measured 2026-10-16, every edge on each:

| predicate            | objects that are a protocol                                                          |
| -------------------- | ------------------------------------------------------------------------------------ |
| `use` `0x9ddda4ac…`  | mainnet 153/158, testnet 166/166 — A2A, MCP, OASF                                    |
| `uses` `0x5c0bde1c…` | **mainnet 0/185, testnet 0/143** — Intuition, Base, Claude, GitHub, Obsidian, Cursor |

So **`getCapabilities` reports Obsidian and GitHub as protocols** for every agent carrying a `uses`
edge. This predates ADR 0030 and is independent of it; ARP writing on `uses` makes ARP's own tool
edges land in the same wrong bucket.

`tasks/19` step 5 says the tiers of evidence must render distinguishably. A tool filed as a protocol
is the same class of error one level down: two different kinds of fact in one bucket.

## Do

1. Split the relation. `USE` → `uses-protocol`, `USES` → `uses-tool` (names to settle in the task;
   `CapabilityRelation` is a public union).
2. Add `tools` to `Capabilities` and route `uses-tool` there.
3. Update `bucketFor`, the mapping table, and every consumer. `app/src/pages/AgentTrustPanel.tsx`
   renders `capabilities.protocols`.
4. Tests: one fixture per predicate, asserting a `uses` edge does not appear under `protocols`.

## Why it is not in ADR 0030's commit

It changes the connector's public `Capabilities` type and its rendering, which is a wider blast radius
than a predicate fix, and `.claude/rules/workflow.md`'s scope discipline applies even though the two
are adjacent. ADR 0030 records the deferral rather than hiding it.

## Which tier of the evidence ladder does this serve?

Tier 1 → 2. A capability filed under the wrong heading is an assertion dressed as a classification.

---

# Appendix — a second defect found in the same review

**`ensureAtomForURI` mints an atom for any `ipfs://` string without validating it is a CID.**

Confirmed on testnet while censusing the orphan predicate: 18 of the 21 stranded triples point at
objects whose data resolves to

```
invalid path "/ipfs/bafkreislithersolidityauditschemaarpdemo000000000000000000000":
  invalid cid: illegal base32 data at input byte 39
```

These are demo-seed placeholders that were minted as real atoms. They are permanent — Intuition has no
deletion — and they are indistinguishable, at the atom level, from a real pin.

Pre-existing, testnet only, and out of scope for both ADR 0030 and the task above. Worth its own fix:
validate the CID before minting, since the cost of not doing so is unrecoverable.
