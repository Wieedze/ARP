# 0027 — ARP mints into the canonical ERC-8004 registry, not its own

**Status:** Accepted
**Date:** 2026-09-16
**Triggered by:** user decision, answering the open question `docs/12` carried: which registry does ARP mint into?

## Context

`docs/12` recorded that ARP mints into its own deployment of the ERC-8004 reference implementation on
Intuition testnet 13579, while the agents the ecosystem indexes live in `0x8004A169…A432`. An agent
minted where nobody indexes is the fragmentation the standard exists to prevent, so the doc carried
the question rather than hiding it.

The registry was inspected directly before deciding:

- **It is an EIP-1967 upgradeable proxy.** Implementation at `0x7274e874ca62410a93bd8bf61c69d8045e399c02`
  on Base. Its behaviour can change; that is a property to know, not a blocker.
- **Minting is open.** `register()` — the exact selector ARP's ABI already uses — simulates clean from
  an arbitrary caller and returns the id it would mint. Permissionless, as the standard intends.
- **`ownerOf` works as expected.** Token 2340 returns `0x729a121c…de1d`, matching what the connector
  reads for Clawnch.
- **It is deployed at the same address on Base and BSC**; the Ethereum RPC used did not answer, so
  that one is unconfirmed rather than absent.

Two findings fell out of the inspection and matter beyond this decision.

**The population is roughly three times what this repo has been saying.** Token 88243 exists, 88244
does not: **88,243 agents on Base**. Intuition mirrors 28,648 — about a third. Every "28,648" in
`docs/08` and `docs/12` is correct about the _mirror_ and wrong about the _registry_, and the
distinction is load-bearing: two thirds of the Base population is invisible to the graph, before BSC
and Ethereum are counted at all.

**ARP's ABI is not fully compatible with it.** `totalAgents()` reverts — the canonical implementation
does not have it, and `app/src/lib/abi/identity-registry.ts` declares it. Anything relying on it
breaks against the real registry.

## Decision

**When ARP mints, it mints into the canonical ERC-8004 registry** at
`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, on the chain the operator chooses — Base by default,
since that is where the mirror and the population are.

ARP's own `IdentityRegistry` on testnet 13579 becomes a **demo fixture only**. It is not retired from
the repo — it is what the testnet demo runs on — but nothing production-facing points at it, and no
agent minted through ARP lands there.

Consequences accepted:

- Minting costs gas on the target chain in that chain's native token, not TRUST.
- The operator's wallet must be on the mint chain for that step. The rest of the flow stays on
  Intuition.
- ARP inherits the proxy's upgradeability. Nothing ARP writes depends on the implementation staying
  fixed, but a future integration should not assume it has.
- `identity-registry.ts` must be reconciled against the real implementation before the mint path
  points at it. `totalAgents()` is one known divergence; there may be others, and the ABI was written
  against the ChaosChain reference rather than against this deployment.

## Alternatives considered

- **Keep minting into ARP's testnet registry** — rejected, and it is what prompted the question. An
  identity nobody indexes is not an identity; it is a local record that looks like one.
- **Deploy ARP's own registry to a mainnet** — rejected outright. `docs/01` says ARP is not an agent
  registry, and a second registry alongside the canonical one is the exact fragmentation the standard
  and `docs/07`'s frozen recipe both exist to prevent.
- **Mint only on the chain of the operator's choosing, with no default** — rejected as a v1 default.
  Base is where the mirror is, so an agent minted elsewhere gets no graph presence until someone
  mirrors that chain. Offer the choice; default to the one that works.

## Consequences

**Positive:**

- An agent minted through ARP is indistinguishable from any other ERC-8004 agent, indexed by
  8004scan, agentscan and anyone else reading the standard.
- ARP stops maintaining an identity namespace, which is what `docs/01` asked for all along.
- Mint and import converge: both end at a canonical identity the connector can resolve.

**Negative:**

- A second chain enters the operator's flow. The mint is on Base; everything after is on Intuition.
  That has to be legible in the UI or it will be mistaken for a bug.
- The ABI reconciliation is real work and is a precondition, not a follow-up.

**Neutral:**

- Nothing about the import path changes; it never minted.
- The testnet demo is unaffected.

## References

- Related doc: `docs/12_THE_IDEA.md` §1 (both doors), and the open question this closes
- Related ADR: `0015` (canonical atom pattern), `0025` (no ARP registry on Intuition mainnet)
- Related rule: `docs/01_PROJECT_CONTEXT.md` — "ARP is not an agent registry"
- Registry inspected on Base 2026-09-16: proxy `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, implementation `0x7274e874ca62410a93bd8bf61c69d8045e399c02`
