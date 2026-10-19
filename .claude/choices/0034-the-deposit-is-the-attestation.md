# 0034 — The deposit is the attestation

**Status:** Accepted
**Date:** 2026-10-19
**Triggered by:** user proposal, responding to ADR `0032`'s observation that anyone can write
`(X, uses, Y)` about any `X` — _"on peut avoir un attestateur qui prend une position quand une arête
est créée, et cette position affirme alors que l'arête vient bien d'ARP"_.

## Context

ADR `0032` established that the subject of a triple is data, not authorisation: writing
`(NetGuardian, uses, Slither)` requires controlling neither. The edge therefore carries **no
provenance**. A reader — including ARP's own connector — cannot tell an edge ARP wrote from one a
spammer or a competitor wrote.

ADR `0032` left that open, treating the subject as a readability question. It is, but it is not the
whole question: a readable edge of unknown origin is still unusable.

The obvious answers are all heavier than the problem: a signature scheme over the edge, a dedicated
`attested by` predicate, an allow-list of writer addresses, a registry of authorised attestors.

## Decision

**ARP deposits on an edge's vault when it writes the edge. That deposit is the attestation.**

A position is recorded on-chain against the depositor's address, so the deposit is both a statement
of provenance and a statement of belief. No signature scheme, no new predicate, no new atom type.

**Verified implementable in one query**, 2026-10-19 on mainnet. The `positions` table carries
`account_id`, `term_id`, `curve_id`, `shares`, `transaction_hash`, `created_at`, `block_number`, so
both directions work:

```graphql
positions(where: {account_id: {_eq: $attestor},
                  term: {triple: {predicate_id: {_eq: $uses}}}})
```

returns every `uses` edge an account vouches for, with the transaction that established it.

**The mechanism is already in use on mainnet.** `wieedze.eth` holds positions on
`(wieedze.eth, uses, Hardhat)` and `(wieedze.eth, uses, Discord)`; `w00ds.eth` on MetaMask, Claude,
Obsidian, Cursor, ChatGPT and more. So this is not a new convention being proposed to the ecosystem —
it is the convention the ecosystem's existing `uses` edges already follow.

**Deposits batch.** Transaction `0xc71feb6a…` carries positions on MetaMask, After Effects,
Excalidraw and ChatGPT at once, so gas amortises across an attestation set.

## Consequences

**Positive**

- One query filters a cohort-wide read down to edges ARP stands behind. No index to build, no
  off-chain registry to host, nothing for a third party to trust.
- **It doubles as the economic position**, which ARP wanted anyway. The attestation is not an
  overhead on top of the stake; it _is_ the stake.
- **It is revocable.** A position can be redeemed, so ARP can withdraw a vouching when an edge turns
  out wrong. That is strictly better than an immutable signature, which cannot be taken back.
- Every attestation carries a `transaction_hash`, so any filtered row reproduces from the chain.
- It composes with `docs/14`'s ladder rather than sitting beside it: a free edge is _nothing_, and an
  attested edge is a priced assertion, which is exactly the distinction already drawn.

**Negative**

- **It is a filter, not an exclusion.** Anyone else may deposit on the same edge, and anyone may
  write a competing edge ARP has not attested. "ARP vouches for this" never means "only ARP vouches",
  and a reader must not be shown it as exclusivity.
- **Every attestation costs a deposit.** At least `minDeposit` per edge — read it from the contract
  rather than trusting a copy, since it is governance-configurable. That bounds how many edges ARP
  can stand behind, and the bound is money, not engineering.
- **It conflates authorship with belief.** A deposit says ARP believes the edge; it does not
  separately record that ARP wrote it. Accepted deliberately: belief is the useful claim, and
  authorship without belief is worth nothing to a reader.
- **The attestor address has to be published**, or the filter is unusable by anyone but ARP. It needs
  a home in `deployments/<chainId>.json` and ideally an atom of its own, and it becomes a key whose
  rotation breaks every historical filter that pinned the old one.

**Neutral**

- This does not change ADR `0032`. The edge still carries the registration-derived identity atom as
  its subject; `0034` answers who stands behind it, which `0032` did not.
- `scripts/measure-attestor-filter.ts` reproduces the query and the live examples above.
- No mainnet transaction is implied by this ADR. Depositing is `ADR 0017`'s posture and its seven
  safeguards, unchanged, and **no agent or script may sign one** (`rules/security.md`).
