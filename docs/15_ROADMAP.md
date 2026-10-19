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

   No budget, cap or loop guard tuned on testnet is valid on mainnet. And the triple cost is a **fee,
   not a deposit** — unrecoverable, and **outside** `TrustStakeCapEnforcer`, which bounds the deposit
   only. An agent in a loop burns 0.1 TRUST per iteration with the cap untouched (ADR `0036`).

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

- **The connector**, built so ARP **prepares** the call and the agent **signs and sends** it. Build
  and send are fused today in `delegation-redeem.ts`; separating them is what keeps ARP out of the
  loop — no key, no gas, no signature. It also preserves the connector package's own invariant:
  _never signs, never sends_.
- MCP first, not a package. Universal, and the agent chooses to call it.
- An operator signs a delegation scoped by domain and capped; the agent declares and deposits.

**Gate**: a tool's reputation changes because an agent ARP does not control staked on it.

### Phase 2 — make the result visible.

- The tool page (`tasks/23`) — the read service exists, the page does not. Without it the edges have
  no reader.
- Finish the verifier gate (`tasks/17`) — 100 agents in one walk.

### Phase 3 — what mainnet needs and testnet will not give.

- **A fee budget**, enforced before `createTriples`. Gap 2 — not built, and the cap's name promises
  protection it does not give.
- **A domain mechanism that works without `ModuleRegistry`.** Gap 4. Likely an allow-list of tool
  atom ids in the delegation terms, with the domain resolved off-chain when the list is built — then
  the enforcer needs no registry and no graph read. **Not designed yet.**
- Re-derive every cost against mainnet values. Nothing carries over.

### Phase 4 — adoption. Not engineering.

One operator signing one delegation for an agent ARP did not mint. Everything above exists to make
that worth doing; none of it causes it.

## The honest summary

Testnet proves the machine. Mainnet proves the market. The two gaps that are **not** closed by
testing — the mainnet domain mechanism, and the fee outside the cap — are both design work, and both
are in Phase 3 rather than hidden.
