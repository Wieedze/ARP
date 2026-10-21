# 0055 — One contract, not five

**Status:** Accepted
**Date:** 2026-10-21
**Triggered by:** user — _« si je réfléchis bien on a besoin d'aucun contrat à part les caveat pour que les agents puissent déclarer dans un graph donné avec un budget donné et staker sur les différents outils/agents non ? … on fait énormément de choses qui ne servent à rien j'ai l'impression »_

## Context

`contracts/src/` held **5 files, 1,106 lines**. Measured against what the mechanism in `docs/12`
actually needs:

| contract                                   | lines | what it was for                            | verdict                                                                             |
| ------------------------------------------ | ----- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `ModuleRegistry.sol`                       | 271   | ARP's own tool catalogue                   | retired by ADR `0051` — ARP points, it does not store                               |
| `erc8004/IdentityRegistry.sol` + interface | 539   | ARP's deployment of the ERC-8004 reference | kept as a **testnet fixture**, per ADR `0027`                                       |
| `enforcers/DomainScopeEnforcer.sol`        | 152   | bound which domains an agent may stake in  | dead — the domain taxonomy was hackathon scaffolding, and it gated `registerModule` |
| `enforcers/TrustStakeCapEnforcer.sol`      | 144   | cap native spend over a rolling period     | **the only one the product needs**                                                  |

**The stock framework does not replace the one that stays.** MetaMask's `functionCall` scope offers a
`valueLte` caveat — "Maximum native token value", read in the vendored reference. That bounds **one
redemption**. An agent can redeem a hundred times. "A given budget" needs a cumulative cap over a
window, which is what `TrustStakeCapEnforcer` is: state keyed by delegation hash, reset when the
period expires.

## Decision

**Delete `ModuleRegistry.sol` and `DomainScopeEnforcer.sol`, with everything that consumed them.**
Keep `TrustStakeCapEnforcer.sol`. Keep `IdentityRegistry.sol` as the fixture ADR `0027` already made
it.

What went with them, and why it is not collateral damage — each of these had **no live consumer**:

- **three app pages** — `/` (`ModuleList`), `/tool/:id` (`ToolDetail`), `/modules/new`
  (`RegisterModule`) — plus `use-modules`, `use-vault-metrics`, `register-module`, the
  `module-registry` ABI and `arp-sdk.ts`. `/` is the tool catalogue now; a root route onto a retired
  registry was the clearest surviving statement of the opposite.
- **the "Register" nav tab.** An entry point for writing into a registry that is not the product is
  worse than no entry point. What replaces it is in `FUTURE.md`.
- **the publish delegation.** `/agent` signed two: one gating `registerModule` within chosen domains,
  one gating the MultiVault. The first is gone, so `domainScopeCaveat` and `publishModuleCaveats` are
  gone, the domain picker is gone, and `useStoredDelegations` holds one delegation instead of a pair
  — with its storage key bumped to `v2`, because a stored `v1` pair would otherwise half-load and
  leave an operator believing a delegation is active that nothing can redeem.
- **790 lines of `packages/protocol/src/arp/`.** An `ArpClient`, a `ModuleRegistry` reader, an
  agent-reputation surface, a third copy of three ABIs, and `TESTNET_DEPLOYMENT`. Measured
  2026-10-21: every export had **zero consumers** outside the package. What is left is
  `arp/chains.ts` — the two `defineChain` calls, which is why the namespace exists at all
  (`rules/portability.md` makes it the one place allowed to name a chain).

## Alternatives considered

- **Keep them, marked legacy.** Done first, as the step that needed no decision: each page carried a
  note saying it was retired and not to build on it. It is not enough — a marked page is still a
  page, still in the nav, still teaching a vocabulary nobody else uses, and the user's "we do a lot
  of things that serve no purpose" is exactly the cost of leaving it.
- **Delete `TrustStakeCapEnforcer` too and rely on `valueLte`.** Measured and rejected above: that
  caps a redemption, not a budget.
- **Delete `IdentityRegistry.sol`.** Separate decision, and ADR `0027` already settled it: the mint
  targets the canonical registry on Base in production, and ARP's deployment is a testnet fixture.
  Confirmed again by the user on 2026-10-21. Keeping it costs 539 lines and buys an exercisable mint
  flow; the Base path is named and unbuilt.

## Consequences

**Positive:**

- The answer to "what does ARP deploy" is **144 lines of Solidity**, and the answer to "what does ARP
  store" is nothing. Both were true before and neither was legible.
- One fewer parallel tool system. There were three notions of "tool" — a registry entry keyed by an
  integer, an atom keyed by 32 bytes, and a URL — **with no route joining the first two**, and a
  registry entry's `ipfs://` `schemaURI` derives a _different_ atom than its URL does. Same tool, two
  atoms, two vaults, two reputations: the fragmentation ADR `0054` exists to prevent, reproduced by
  the architecture rather than by naming.

**Negative:**

- **`ModuleRegistry` stays deployed on testnet 13579 with entries nobody can now read through ARP.**
  Nothing is lost on chain; the client is. Migrating those entries was never decided and is not
  decided here.
- No register surface in the app until the screen in `FUTURE.md` exists. That screen is blocked on
  one question — a `uses` edge carries the **agent's** identity atom (ADR `0032`), and a human
  pasting a URL is not an agent.
- `/` and the "Tools" tab now lead to the same place. Deliberate while there are two tabs.

**Neutral (worth knowing):**

- **The set-aside hackathon surface is untouched**, and it still references the deleted contracts:
  `scripts/agent-loop.ts`, `agent-server*.ts`, `agent-stake-on-use.ts`, `demo-delegation.ts`, plus
  `app/src/services/agent-action.ts`'s `buildRegisterModuleExecution` and `delegation-redeem.ts`'s
  `redeemRegisterModule`, which those scripts are the only callers of. ADR `0033` keeps them as
  historical record and `scripts/` is outside every gate, so nothing breaks — but they are now
  record of a contract that is gone, and whether in-tree history is worth that is its own decision.
- Contracts after the deletion: `forge build` clean, **17 tests pass**. App: `tsc` 0, `lint` 0,
  `check:tokens` 0, 251 tests. Package: `tsc` 0, 349 tests.

## References

- Related ADR: `.claude/choices/0051-arp-points-and-prices-it-stores-nothing.md`
- Related ADR: `.claude/choices/0027-mint-into-the-canonical-registry.md`
- Related ADR: `.claude/choices/0033-the-hackathon-surface-is-set-aside.md`
- Related ADR: `.claude/choices/0041-one-protocol-package-not-two.md` — the fold that brought `arp/` in
- Related rule: `.claude/rules/portability.md` — why `arp/` may name a chain
- Related: `FUTURE.md` — the register/declare screen that replaces `/modules/new`
