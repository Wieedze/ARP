# 0026 — The import links the agent to its operating account with `same as`

**Status:** Accepted
**Date:** 2026-09-16
**Triggered by:** `tasks/11-import-existing-erc8004-agent.md`, which names this as "the one design question, and it is yours to settle"

## Context

An imported agent is proven by a registry read: the ERC-8004 Identity Registry names the `owner` of
each token, and the import compares it to the connected wallet. That settles ownership and needs no
decision.

What needed one is what happens after. A tool stake is a `MultiVault.deposit` sent by the operator's
**Smart Account** — the delegator in ARP's delegation flow — and the graph therefore records a
deposit by an address. Nothing on the graph says that address operates that agent. Tool reputation
survives this (the stakers are still distinct) but **agent reputation does not**: "what this agent is
composed of, and how much it has committed to that composition" (`docs/12` §4) has no subject to
attach to. Agent reputation is half the mechanism, so the import has to publish a link.

Four things constrain what that link can be.

1. **`docs/07` forbids inventing vocabulary.** "Resolve object term_ids from these tables; do not mint
   your own copies — a differently-pinned duplicate is a different node and fragments the staking
   surface." So the predicate must come from Appendix B.
2. **Pinning is server-side only** (ADR 0016). `PinAuth` is branded so a browser caller does not
   compile. Any construction that needs a `pinThing` cannot happen on the import page.
3. **The subject is fixed.** ADR 0015 made the registration-file-derived atom the subject of
   everything ERC-8004-facing, and it already exists for the mirrored cohort. The connector's
   preflight returns it; deriving a replacement would be the duplicate (1) forbids.
4. **Mainnet already carries both spellings of a CAIP-10 account id.** Measured 2026-09-16 against
   `https://mainnet.intuition.sh/v1/graphql`: 5,003 atoms of the form `caip10:eip155:…`, of which
   ~170 spell the address entirely in lowercase and the rest checksum it; for at least one address
   (`0x25d5C9Db…`) both spellings exist as separate atoms, minted a minute apart. Atom ids are
   content-derived, so the two are different nodes.

Two measurements bear on the choice and are recorded here because they were not obvious beforehand:

- **No `same as` triple on mainnet currently points at a CAIP-10 atom.** `triples(where: {predicate_id:
{_eq: <same as>}, object: {data: {_like: "caip10:%"}}})` returns zero rows. The predicate is
  canonical and the object construction is in live use (5,003 atoms, 45 of them on chain 1155), but
  this particular pairing is new on mainnet.
- **Adding one `same as` edge does not make the agent ambiguous to readers.** The connector's cohort
  row flags `isIdentityAmbiguous` when more than one ERC-8004 identity is established _or_ when the
  sample of `same as` edges was incomplete (`IDENTITY_SAMPLE_LIMIT = 4`). A CAIP-10 object is not a
  CAIP-19 asset id, so `parseCaip19` drops it and the identity count stays at one. Live edge counts:
  agent 8453:6649 has one `same as` edge, 8453:2340 (Clawnch) has two (the second is
  `did:web:clawn.ch`). Both stay under the sample limit with one more.

## Decision

The import publishes exactly one edge on Intuition mainnet:

```
(canonical agent atom, same as, caip10:eip155:1155:<operating account>)
```

- **Predicate**: Intuition's canonical `same as`,
  `0xbeebfb7d177cbd96ffc239d2196c72ec346efe81f39dc595773f13d83506f5f0`, taken from the connector
  (`INTUITION_SAME_AS_TERM_ID`) rather than resolved by label or re-declared in the app. This is the
  pattern ADR 0014 and ADR 0015 already established for linking the canonical atom to the
  position-holding account; the import reuses it with the Smart Account in that role.
- **Subject**: the canonical atom from the connector's preflight. Never re-derived, never re-pinned.
- **Object**: the CAIP-10 account atom for the operating account on chain 1155. The plan checks the
  chain first and **converges on whichever spelling already exists**; only when neither does is one
  created, in the checksummed form the mainnet vocabulary predominantly carries.
- **Nothing is minted on the import path** in the sense that matters: no ERC-8004 token on any
  registry, and no agent atom. The account atom is a node for the operator's own account, created
  only when the graph does not already hold it, and is named in the priced plan before the operator
  signs.

The EIP-712 statement the operator signs is **consent, not proof**. Ownership is proven by the
registry comparison. The signature is re-verified against that owner immediately before the write, so
a statement that was altered after signing never reaches the chain — which is the only thing it is
load bearing for.

## Alternatives considered

- **`created by` (`0x5a959cdd…`) against the owner's wallet atom** — the closest competitor, and the
  one the cohort actually uses: all 98 indexed mainnet agents carry this edge, and `docs/07` gives its
  object construction verbatim. Rejected for two independent reasons. Its object is a _pinned Thing_
  (`{name: "<address lowercased>", description: "Wallet address atom observed in ERC-8004 registry
data.", image: "", url: ""}`), so publishing it needs the partner pinning key and cannot happen in
  the browser (ADR 0016) — it would have to be a script, which is not where an operator is. And it
  says the wrong thing: `created by` names the registration owner, while the address that must be
  linked is the Smart Account that sends the deposit. Those are different addresses, and asserting
  one about the other would be a false statement written to an immutable graph.
- **Mint a new predicate — `operated by`, `stakes as`** — rejected outright. `docs/07` names this as
  the anti-pattern, and the task forbids it.
- **`has type` / `available on` / `implement` / `use` / `compatible with` / `has tag` /
  `has category`** — the rest of Appendix B's predicates. None expresses "this account acts for this
  agent"; each would be a category error, and a wrong canonical predicate is worse than a right novel
  one because consumers will read it.
- **Publish no link and let the stake stand alone** — the status quo, and what the task exists to fix.
  Tool reputation would keep working; agent reputation would not.
- **Use the SDK's `createAtomFromEthereumAccount` for the object** — `docs/07` warns against it for
  the `created by` edge: it produces a protocol account atom with a different id, which "splits the
  owner's signal away from the atoms the indexed cohort already points at." The warning is scoped to
  that edge, but the mechanism is general and the CAIP-10 construction is the one ADR 0014 already
  chose.
- **Lowercase the CAIP-10 address, matching `caip10Uri` in `delegation-redeem.ts`** — rejected as the
  _default_, kept as a fallback. ARP's own testnet atoms lowercase, and internal consistency is worth
  something; but mainnet predominantly checksums, and a link that names a node nobody else points at
  buys consistency at the cost of the thing the link exists for. Converging on whatever already
  exists gets both in every case where it matters.

## Consequences

**Positive:**

- Agent reputation becomes attributable: deposits from the linked account can be read back to the
  agent's canonical atom, which is what `docs/12` §4 requires.
- The edge is readable by anything that already reads `same as` from an agent atom — no ARP-specific
  vocabulary, nothing for a consumer to learn.
- Converging on an existing account atom means two operators who import the same account do not
  produce two nodes.
- The import runs entirely in the browser. No pinning key, no script, no server.

**Negative:**

- `same as` asserts identity, and the Smart Account is the operator's account rather than the agent
  itself. The assertion is defensible in the sense ADR 0015 already uses it — the account is the
  agent's position holder — but it is looser than a predicate that meant exactly "operates". No such
  predicate is canon, and inventing one costs more than the imprecision.
- The write costs real TRUST on mainnet: 0.100000000001 TRUST for the account atom (when it does not
  exist) and 0.100000000002 for the triple, read from `getAtomCost()` / `getTripleCost()` on
  2026-09-16. The plan shows both before the operator signs, and the total is held under the same
  `VITE_MAX_STAKE_TRUST` ceiling the trust panel uses.
- The agent's `same as` edge count goes up by one. Well under the connector's sample limit today; an
  agent already carrying four would become ambiguous to the cohort listing, and this import would be
  the edge that tipped it. Not guarded against, because no such agent exists in the measured cohort
  and a guard against a hypothetical is worse than a recorded limit.
- ARP now has two CAIP-10 spellings in the codebase: `caip10Uri` lowercases for testnet,
  `caip10AccountUris` prefers checksummed for mainnet. Deliberate — changing `caip10Uri` would orphan
  the atoms and triples ARP has already written on testnet — but it is a seam, and it is named here
  so the next reader does not treat one as a bug.

**Neutral (worth knowing):**

- The connector now exports one term id (`INTUITION_SAME_AS_TERM_ID`). It adds no write path; the
  package still never signs. The alternative was a second frozen copy of the constant in the app,
  which is how frozen constants drift apart.
- The link names the Smart Account, which the app derives through a testnet client.
  `getSmartAccountsEnvironment` returns the same `SimpleFactory` and `HybridDeleGatorImpl` on 13579
  and 1155, so the derived address is the same on the chain the stake lands on. Asserted in
  `app/src/services/__tests__/agent-import.test.ts` rather than argued from CREATE2 in a comment.
- ADR 0025 stands: there is no `ModuleRegistry` on mainnet and `DomainScopeEnforcer` there is inert.
  The import writes to the MultiVault and to nothing else, so neither is involved.

## References

- Related task: `tasks/11-import-existing-erc8004-agent.md`
- Related doc: `docs/12_THE_IDEA.md` (the mechanism), `docs/07_INTUITION_ERC8004_PARTNER_GUIDE.md`
  (Appendix B term ids, the owner-atom recipe, the duplicate-node warning)
- Related ADR: `0014` (CAIP-10 account atom as the position-holder identity), `0015` (canonical atom
  as the ERC-8004-facing subject, `same as` as the anchor), `0016` (pinning is server-side),
  `0017` (real TRUST on mainnet, and the safeguards reused here), `0025` (no `ModuleRegistry` on
  mainnet)
- Code: `app/src/services/agent-import.ts`, `app/src/pages/AgentImport.tsx`,
  `erc8004/src/sources/intuition/terms.ts`
