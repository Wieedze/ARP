# Portability

Load when writing anything that touches a chain. The goal is mainnet; testnet is a rehearsal.

## The one rule

**New protocol logic goes in `packages/protocol/`, not in `app/`.**

Measured 2026-10-19:

| where                                | what it binds                                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `packages/protocol/src` (not `arp/`) | **zero** chain bindings. Config takes `graphqlUrl` and `rpcUrls` keyed by `chainId`; a plan carries its `chainId`.     |
| `packages/protocol/src/arp`          | **names both chains, on purpose** — `defineChain` for 13579 and 1155, plus `TESTNET_DEPLOYMENT` as a visible fallback  |
| `app/src/lib/deployments.ts:1`       | `import deploymentsJson from "../../../deployments/13579.json"` — **the whole app is bound to testnet at module load** |
| `app/src`                            | ~12 sites hardcode `chain: intuitionTestnet` in write paths                                                            |

Re-measured 2026-10-19 after ADR `0041` folded `sdk/` in, because that fold made the old version of
this table wrong: it said the package had **zero** chain references, which stopped being true the
moment `sdk/`'s chain definitions arrived. They are confined to `src/arp/`, which is the namespace
for ARP's own contracts, and that is the whole reason the namespace exists. **The rest of the package
still has none** — that is the invariant worth protecting, and `src/arp/` is the one place to look
when it seems broken.

The app's binding is **deliberate, not a defect.** `app/src/lib/intuition-mainnet.ts` is a separate
module precisely so "a mainnet read can never be served from a testnet constant by accident, and so
that grepping for `intuition-mainnet` finds every place real value is at stake" — its own words. Two
explicit worlds with a greppable boundary is a good safety property and should not be collapsed.

But it means **anything built in `app/` inherits the testnet world** and has to be ported later, site
by site. The protocol package does not. So the loop — prepare a call, resolve an identity, read a
tool's standing — belongs there.

That reason is why the answer to "why does everything live in the protocol package?" is not "move it
into `app/`". ADR `0041` renamed the package because the **name** was wrong, and left the boundary
where the measurement puts it.

## What portable actually requires

Four things, each of which has already been got wrong once in this project:

1. **No chain constant at module scope.** Take it as config, default it, never import it.
2. **Never shortcut a path because two chains happen to coincide.** On testnet ARP's registry and the
   staking are both on 13579; on mainnet the identity is on Base 8453 and the staking on 1155. A
   resolution path that skips the join on testnet will not fail until migration.
   `docs/15_ROADMAP.md` gap 1.
3. **Never tune a number on testnet values.** Measured 2026-10-19, 100× apart: `getTripleCost()` is
   0.001000000002 TRUST on 13579 against 0.100000000002 on 1155, and `getAtomCost()` 0.001000000001
   against 0.100000000001. A loop guard that looks harmless on testnet burns a hundred times more on
   mainnet, and a term cost is a **fee** — it does not come back, unlike a deposit.

   This rule used to add "and outside `TrustStakeCapEnforcer`, which bounds the deposit only". **That
   was wrong** (ADR `0040`): the enforcer decodes `value` out of the execution and nothing else
   (`contracts/src/enforcers/TrustStakeCapEnforcer.sol:101`; its own NatSpec says "Only `value` is
   consumed"), so it is a native-spend cap and a fee counts against it like anything else. What is
   true is narrower: **the cap bounds the amount, not the kind** — an agent can exhaust an
   operator's whole cap on fees and hold no position. And **direct mode has no enforcer at all**, so
   nothing is bounded there; `DeclarePlan.totalValue` before signing is the only guard.

4. **Never rely on controlling the registry.** On testnet ARP owns the ERC-8004 registry and can mint
   and set URIs at will. On mainnet it owns nothing. Any step that works because ARP can write to the
   registry is not a step, it is a rehearsal prop.

## Read it from the chain, not from a copy

`deployments/<chainId>.json` records addresses. It does **not** record governance-configurable
values: `minDeposit`, `getTripleCost()`, `getAtomCost()` and `defaultCurveId` are read from the
contract at call time. `deployments/1155.json` says this in its own note about `defaultCurveId` —
"read it, do not trust this copy" — and the same applies to every cost.

## The exception

The trust panel's mainnet staking path stays in `app/` under `intuition-mainnet.ts`. It is UI, it is
human-signed, and ADR `0017`'s safeguards are UI behaviour. Do not move it into the connector: the
connector never signs and never sends, and that invariant is worth more than the symmetry.
