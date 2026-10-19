# 15 — Roadmap: what testnet proves, what it cannot, and the order

**Date**: 2026-10-19
**Serves**: `docs/12_THE_IDEA.md`. Supersedes the ordering notes in `docs/13` where they conflict.

---

## What ARP is

> A connector between the Intuition protocol and agents, to create a network of agent and tool
> reputation.

An agent's operator signs one delegation. The agent runs, declares the tools it used, and deposits
its own TRUST on them under that cap. The tool gains reputation and so does the agent. **ARP is not a
party**: it holds no funds, signs nothing, and is in nobody's runtime (ADR `0035`, `0036`).

## Where things actually live

```
identity of the 88,243 agents  →  Base 8453
their atoms + the MultiVault   →  Intuition mainnet 1155     ← two different chains
ARP's own 8004 registry        →  Intuition testnet 13579
the test MultiVault            →  Intuition testnet 13579     ← one chain
```

Verified 2026-10-19: **nothing is deployed** at the registry address on 1155. The on-chain loop
happens entirely on the staking chain; the registry is only read, off-chain, to resolve an agent's
identity atom.

## What testnet can prove

Everything mechanical. The rig is already deployed on 13579 — ARP's own ERC-8004 registry
(`0xC165A2AD…`, live, 2 agents), `ModuleRegistry`, both enforcers, the MultiVault and the
DelegationManager.

- the full loop: create the triple, deposit, caveats enforcing, every revert path
- `DomainScopeEnforcer` **actually gating** — it works there, because `ModuleRegistry` is deployed
- `TrustStakeCapEnforcer` bounding a rolling period
- the connector surface; a protocol does not care which chain
- discovery, once the agents have registration files
- reading a tool's reputation

## What testnet cannot prove — six things, precisely

1. **Cross-chain identity resolution.** On mainnet the identity is on Base and the atom on 1155,
   joined by `same as`. On testnet both are on 13579 and ARP writes both, so `resolveAgent` is never
   exercised against a registry ARP does not control. **Mitigation**: route resolution through the
   same code path that will hit Base, and never shortcut it because the chains happen to match.

2. **Cost behaviour. Measured 100× apart**, which is the single most dangerous gap:

   |                   | testnet 13579        | mainnet 1155             |
   | ----------------- | -------------------- | ------------------------ |
   | `getTripleCost()` | 0.001000000002 TRUST | **0.100000000002 TRUST** |
   | `getAtomCost()`   | 0.001000000001       | 0.100000000001           |
   | `minDeposit`      | 0.001                | **0.01**                 |

   No budget, cap or loop guard tuned on testnet is valid on mainnet. And a term cost is a **fee,
   not a deposit** — it does not come back, unlike a deposit.

   This paragraph used to add "and **outside** `TrustStakeCapEnforcer`, which bounds the deposit
   only. An agent in a loop burns 0.1 TRUST per iteration with the cap untouched." **Both sentences
   were false** (ADR `0040`): the enforcer decodes `value` out of the execution and nothing else
   (`contracts/src/enforcers/TrustStakeCapEnforcer.sol:101`), so the fee counts against the cap and a
   loop would hit it. This was the **third** copy of that claim in this file; the other two were
   corrected and this one — the primary statement in the numbered gaps list — was missed, so the file
   contradicted itself 70 lines apart. What is true is narrower: **the cap bounds the amount, not the
   kind**, so a cap can be burned on fees instead of invested in positions.

3. **That a third party adopts.** No amount of testnet makes an operator sign. This is distribution,
   not engineering, and it is where the real risk sits.

4. **`DomainScopeEnforcer` on mainnet.** It gates exactly one selector,
   `ModuleRegistry.registerModule`, and `ModuleRegistry` is not on mainnet by ADR `0025`. So it is
   `status: "inert"` there. **This is not a testing gap — it is a missing design**, and it is the
   mechanism behind domain-scoped hiring, which is the thing worth selling.

5. **Economics.** tTRUST is free, so a testnet position carries no conviction. The mechanism is
   testable; the market is not. Whether anyone opposes a claim, whether a price means anything —
   mainnet only.

6. **The shape of a real agent's graph presence.** On mainnet an agent's atom comes from Deep3's
   mirrored shell with `has trust provider`, `has trust assessment` and the rest. On testnet ARP
   writes its own, so the real join is not exercised.

## The order

### Phase 0 — make the rig faithful. Small, and it unblocks everything.

The 2 testnet agents were minted with `register()` and carry an **empty `tokenURI`**, so nothing can
read them and the discovery path never runs. `setAgentURI()` exists.

- Give them registration files in the **mainnet shape** — `services[]`, a declared protocol, and
  capabilities on at least one. Mint a third.
- Point identity resolution at the real code path, per gap 1.

**Gate**: the verifier reads all three off the testnet registry and classifies them. **Met
2026-10-19** over ids 1,2,3,4,5 — see `tasks/24`.

**But the third bullet is deferred, so Phase 0 is not closed.** Identity resolution still does not go
through `resolveAgent`; `tasks/24` records why and who owns it. Gap 1 below therefore has an owner
rather than a reader's assumption that Phase 0 handled it.

### Phase 1 — the loop. This is the product.

- **The connector** — **built** 2026-10-19 (`tasks/16` half 1, ADR `0038`). It prepares the calls
  and the agent signs and sends them. Build and send were fused in `delegation-redeem.ts`;
  `packages/protocol/src/declare/` separates them, which is what keeps ARP out of the loop — no key, no gas,
  no signature — and preserves the package's own invariant: _never signs, never sends_. This bullet
  predicted the design before the task ran, which is the reason to trust it is not drift.
- MCP first, not a package — **done**: `arp_declare_used` and `arp_stake_on_used` return the plan,
  with a caveat on every response that nothing was signed or sent. Universal, and the agent chooses
  to call it.
- An operator signs a delegation scoped by domain and capped; the agent declares and deposits.
  **The agent half is built** — `toDelegatedCalls` wraps the plan for redemption, one call per
  redemption. **The operator half is not**: nothing in this repo yet asks a third-party operator to
  sign a delegation, and the domain scoping has no mainnet mechanism (Phase 3, gap 4).

**Gate**: a tool's reputation changes because an agent ARP does not control staked on it.

**The gate is NOT met, and the distance is one specific thing.** The whole path is verified
read-only against live mainnet — identity resolved, ids computed, costs read, plan priced — but
**nothing has been signed or sent on any chain**, so no tool's reputation has moved. Closing it
needs an agent ARP does not control, and its operator's decision to spend. That is Phase 4, which
is adoption and not engineering. Phase 1 has therefore built everything it can build and is **not
closed**, for the same reason Phase 0 is not.

### Phase 2 — make the result visible.

- The tool page (`tasks/23`) — the read service exists, the page does not. Without it the edges have
  no reader.
- Finish the verifier gate (`tasks/17`) — 100 agents in one walk.

### Phase 3 — what mainnet needs and testnet will not give.

- **A budget that tells a fee from a deposit.** Gap 2, restated after ADR `0040` found the old
  version of it wrong. `TrustStakeCapEnforcer` **does** cap the fee — it caps native `value`
  whatever the call — so a delegated redemption of `createTriples` is bounded. What it cannot do is
  distinguish spend-and-gone from spend-and-redeemable, so an operator's cap can be burned entirely
  on term creation. `DeclarePlan.totalValue` surfaces the cost before signing, which is the
  off-chain half; the on-chain half would have to decode calldata and know every term-creating
  selector, and is **not built**.
- **A domain mechanism that works without `ModuleRegistry`.** Gap 4. Likely an allow-list of tool
  atom ids in the delegation terms, with the domain resolved off-chain when the list is built — then
  the enforcer needs no registry and no graph read. **Not designed yet.**
- Re-derive every cost against mainnet values. Nothing carries over.

### Phase 4 — adoption. Not engineering.

One operator signing one delegation for an agent ARP did not mint. Everything above exists to make
that worth doing; none of it causes it.

## The honest summary

Testnet proves the machine. Mainnet proves the market. The gap that is **not** closed by testing is
the mainnet domain mechanism, which is design work and is in Phase 3 rather than hidden.

This used to say "two gaps", the second being "the fee outside the cap". ADR `0040` found that false:
`TrustStakeCapEnforcer` caps native `value`, so a fee counts against it. What remains of that second
gap is real but smaller — the cap bounds the amount and not the kind, so it can be burned on fees
rather than invested — and it is a refinement rather than a hole.
