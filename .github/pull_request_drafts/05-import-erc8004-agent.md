# feat(app): import an existing ERC-8004 agent, without minting anything

**Branch** `feat/import-erc8004-agent` → `feat/agent-trust-panel` · 8 commits · closes the last gap in `docs/12_THE_IDEA.md`.

Last in the stack. Review order: strategy → connector → panel → this.

---

## The problem

ARP's mechanism worked for agents ARP mints. The 28,648 that already exist are the population — and a system that only serves the agents it created serves nobody.

## What ships

`/agent/import` — the second door, beside the mint, which is untouched.

An operator gives a chain and a token id. ARP reads the ERC-8004 registry, compares `owner` to the connected wallet, and takes an EIP-712 signature as the record of consent. **Ownership is proven by the comparison; the signature is the record, not the proof** — the code says so rather than implying otherwise.

Nothing is written to the Base registry. ARP does not own it.

The agent's canonical Intuition atom comes from the connector's preflight — it already exists for the mirrored cohort. Per ADR 0015 it is the subject of everything ERC-8004-facing, so no replacement is minted.

## The decision this PR had to make, and why it went the way it did

A tool stake is sent by the operator's **Smart Account**, not by the agent. Without a published link between the canonical agent atom and that account, tool reputation works and **agent reputation does not** — and agent reputation is half the mechanism.

So the import publishes `(canonical agent atom, same as, caip10:eip155:1155:<Smart Account>)`.

The real candidate against it was **`created by`** (`0x5a959cdd…`), which all 98 indexed mainnet agents carry — the apparently conformant choice. Rejected on two independent grounds:

1. Its object is a _pinned Thing_ per `docs/07`'s exact recipe, so it needs the partner key and cannot run in a browser (ADR 0016).
2. It names the **registration owner**. The address that must be linked is the Smart Account that sends the deposit. Writing `created by` would have been a false statement on an immutable graph.

The second is the one that settles it. Recorded in ADR 0026.

## A correction made mid-flight, worth reading

The CAIP-10 spelling was first taken as checksummed — 4,833 of the 5,003 `caip10:eip155:…` atoms across the graph are checksummed, so that looked right.

Checking **chain 1155 specifically**, it inverts: 34 of 45 are lowercase. Corrected in `ffc7796`.

This is not cosmetic. A different casing is a different atom, which is a different node, which splits the staking surface — the exact fragmentation `docs/07` exists to prevent.

## How it was verified

**Live reads against the Base registry** (`ERC8004_LIVE=1`, 34 passed): agent 8453:2340 owner `0x729a121c…de1d`, 8453:6649 owner `0x5c422e35…775c`. The wrong-owner path refuses. An unminted token reads as not-found.

**Live simulation against Intuition mainnet by `eth_call`, nothing broadcast**: `createAtoms` simulates clean and returns exactly the id `calculateAtomId` predicts. `createTriples` simulates clean against a real canonical atom with an existing CAIP-10 object — and reverts `MultiVault_TermDoesNotExist` when the object atom is absent, which is why the plan reports `deferred` rather than claiming a success it cannot have.

`tsc -b`, `eslint`, `build` clean. 186 tests in `app/`, 173 in `erc8004/`, 71 forge. **No mainnet transaction sent** — the first one is the operator's.

## Gaps, stated plainly

- **The link names an account that does not yet stake on the chain it is written to.** The edge lands on 1155 and names the Smart Account, because that is the delegator a delegated stake executes as. Today `trust-stake.ts` deposits from the connected EOA and the delegation path targets testnet 13579. So the edge is correct for the flow `docs/12` describes and early for the one that runs. This is `docs/12`'s remaining open row.
- **"The existing flow takes over unchanged" was optimistic** — the module and delegation surfaces are testnet-only per ADR 0025. The page says so.
- Nothing was seen in a browser. There is none in the build environment.

## Which tier of the evidence ladder does this serve?

It is the precondition for all of them. Until an existing agent can be imported, the mechanism has no subjects.
