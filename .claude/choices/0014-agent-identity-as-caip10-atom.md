# 0014 — Agent identity atom is CAIP-10, not a pinned Thing

**Status:** Accepted
**Date:** 2026-06-09
**Triggered by:** user request (preparing the "Post 3" reveal — the public proof that an agent registered, attested via a triple, and staked on-chain)

## Context

The agent's self-atom is the subject of every `(agent, uses, tool)` triple — the
immutable layer of ARP's two-layer reputation model. It was created as an
IPFS-pinned **Thing** (`redeemEnsureAtomForThing({name: "ARP Agent runtime …",
description})`) at three runtime sites that had to agree byte-for-byte (the
self-atom in `agent-loop.ts`, and the same atom re-derived in `agent-stake-on-use.ts`
via an `agentSelfThing` param threaded through `agent-server.ts` and
`agent-server-specialist.ts`). The coupling was enforced only by a comment
("MUST match agent-loop.ts exactly").

Inspecting the live triple on the Intuition indexer
(`triple 0x066f36…e6f4`) showed the subject atom resolving as
`type: "Unknown", label: null` — the indexer could not classify the pinned
Thing, so the triple reads `? → uses → ARP Module — Solidity Audit` on the
explorer. That is a weak public proof for the reveal.

## Decision

Represent the agent's identity atom as a **CAIP-10 account atom** of its runtime
wallet — `caip10:eip155:{chainId}:{address}` (lowercased) — instead of a pinned
Thing. A single helper `redeemEnsureAtomForCaip10(address)` derives the atom from
the address with no IPFS pin, and is used at every site. The runtime wallet is
the same account that holds the agent's reputation positions, so the triple
subject is now identical to the position holder read by the reputation queries.

## Alternatives considered

- **Keep the Thing, fix its pinned metadata so the indexer resolves a label** —
  still leaves the identity decoupled from the position holder, still requires
  the fragile "name string must match across call sites" invariant, and still
  depends on the indexer resolving IPFS content. Rejected.
- **Use the Smart Account (delegator) CAIP-10 instead of the runtime EOA** — the
  position holder (the `receiver` of `MultiVault.deposit`) is the runtime EOA, so
  the runtime EOA is the identity that must match the stake. The Registered owner
  for agentId 1 is also the runtime EOA. Rejected for divergence from the
  position holder.

## Consequences

**Positive:**
- The Intuition indexer types the atom as `Account` and renders the address as
  the label — the triple reads `0xc634…d551 → uses → ARP Module — Solidity Audit`.
- The triple subject equals the position holder, so the immutable layer (triple)
  and the economic layer (stake) point to one identity.
- The fragile cross-file "name must match" coupling is gone: every site derives
  the same atom id from the same address by construction. The `agentSelfThing`
  param is removed from `stakeOnUsedMethodologies` and its two callers.
- No IPFS pin for the identity atom — one fewer failure mode and one fewer round-trip.

**Negative:**
- The label is the raw address, not a human name ("Solidity Audit Agent"). A
  human display name, if wanted later, would be a separate descriptive atom
  linked to the account — not folded into the identity atom.
- The change creates a *new* subject atom and therefore a *new* triple. The old
  Thing-subject triple (`0x066f36…e6f4`) remains on chain (immutable) as an
  orphan; the next agent-loop / demo run materializes the CAIP-10 triple.

**Neutral (worth knowing):**
- Reputation reads are unaffected: `sdk/getReputation` keys positions by the
  runtime wallet via `Deposited` events, independent of the subject atom.
- CAIP-10 atoms are not IPFS-pinned — consistent with the Intuition skill, which
  exempts blockchain addresses from the pin flow.

## References

- Related rule: `.claude/rules/metamask-delegation.md` (delegation-redeem helpers), `.claude/rules/code.md` (no dead weight — removed the threaded param)
- Related skill: `.claude/skills/intuition/operations/create-atoms.md` (CAIP-10 URI format, no pin)
- Related ADR: `.claude/choices/0010-scope-reanchor-two-layer-reputation-and-track-selection.md`, `.claude/choices/0012-agent-positioning-via-two-delegations.md`
- Code: `app/src/services/delegation-redeem.ts` (`caip10Uri`, `redeemEnsureAtomForCaip10`), `scripts/agent-loop.ts`, `scripts/agent-stake-on-use.ts`
