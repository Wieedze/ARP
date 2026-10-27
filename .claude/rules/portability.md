# Portability

Load when writing anything that touches a chain. The goal is mainnet; testnet is a rehearsal.

## The one rule

**New protocol logic goes in `packages/protocol/`, not in `app/`.**

Measured 2026-10-19:

| where                                | what it binds                                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `packages/protocol/src` (not `arp/`) | **zero** chain bindings. Config takes `graphqlUrl` and `rpcUrls` keyed by `chainId`; a plan carries its `chainId`.     |
| `packages/protocol/src/arp`          | **names both chains, on purpose** — `defineChain` for 13579 and 1155, plus `TESTNET_DEPLOYMENT` as a visible fallback  |
| `app/src/lib/deployments.ts:1`       | `import deploymentsJson from "../../../deployments/13579.json"` — ARP's **own** deployment, still bound at module load |
| `app/src`                            | **11** sites hardcode `chain: intuitionTestnet`, all of them ARP's own contracts — re-measured 2026-10-27              |

Re-measured 2026-10-19 after ADR `0041` folded `sdk/` in, because that fold made the old version of
this table wrong: it said the package had **zero** chain references, which stopped being true the
moment `sdk/`'s chain definitions arrived. They are confined to `src/arp/`, which is the namespace
for ARP's own contracts, and that is the whole reason the namespace exists. **The rest of the package
still has none** — that is the invariant worth protecting, and `src/arp/` is the one place to look
when it seems broken.

## The boundary moved on 2026-10-27, and it is now a different line

ADR `0061`. It used to be **module vs module**: `intuition-mainnet.ts` against `deployments.ts`, two
explicit worlds, and "grepping for `intuition-mainnet` finds every place real value is at stake".
That property is gone, and on purpose — a grep for a module name cannot tell you which chain a
button is about to spend on, because the answer is now per quote rather than per import.

The line is **whose contract it is**:

| addressed to                                 | chain                          | how                                                                 |
| -------------------------------------------- | ------------------------------ | ------------------------------------------------------------------- |
| Intuition's **MultiVault**                   | either, the reader's choice    | `lib/chain-choice.ts`, and the chain rides on the quote or the plan |
| **ARP's own** contracts (`IdentityRegistry`) | testnet 13579, by construction | `lib/deployments.ts` at module load — they exist on one chain only  |

So "real value is at stake" is answered by `isMainnet` on the chain a quote was priced against, which
the quote carries and the confirmation step prints. If you are adding a write, carry the chain on the
thing you priced; do not re-read a toggle at signing time.

**What still holds unchanged:** anything built in `app/` against ARP's own contracts inherits the
testnet world and has to be ported later, site by site. The protocol package does not. So the loop —
prepare a call, resolve an identity, read a tool's standing — still belongs there.

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

The trust panel's staking path stays in `app/`. It is UI, it is human-signed, and ADR `0017`'s
safeguards are UI behaviour. Do not move it into the connector: the connector never signs and never
sends, and that invariant is worth more than the symmetry.

This used to read "the trust panel's **mainnet** staking path … under `intuition-mainnet.ts`". Both
halves are now wrong: the path serves either chain, and `intuition-mainnet.ts` is three constants
(ADR `0061`). The exception is about **where the code lives**, not which chain it targets.
