# 0012 — Agent positioning via two delegations (publish + compose)

**Status:** Accepted
**Date:** 2026-06-03
**Triggered by:** Task 04c implementation. Architecture re-cast after re-reading the Task 02b `DomainScopeEnforcer` implementation against the original Phase 3 plan.

## Context

A first plan for Phase 3 of the hackathon UI was to wire the operator's signed ERC-7710 delegation into the `/tool/:id` compose flow — replacing the direct EOA `depositOnAtom` call with a redemption against the MetaMask `DelegationManager`. Re-reading `contracts/src/enforcers/DomainScopeEnforcer.sol` showed that enforcer is **hard-coded** to gate `ModuleRegistry.registerModule` (selector check + decoded `domain` argument). It rejects any other selector. The MultiVault compose surface (`deposit`, `createAtoms`, `createTriples`) does not match.

The choices were:

1. Use only the `TrustStakeCapEnforcer` for compose. `TrustStakeCapEnforcer` caps `value` (msg.value) per period and doesn't constrain the selector. The agent could redirect spend to arbitrary targets the operator never intended.
2. Add a third Solidity enforcer (e.g. `MultiVaultActionEnforcer`) gating selector + target. New contract work, fresh review, audit prep — real time we don't have.
3. Compose stock MetaMask `AllowedTargetsEnforcer` + `AllowedMethodsEnforcer` (already deployed at the framework v1.3.0 addresses recorded in `deployments/13579.json`) with our `TrustStakeCapEnforcer`. Zero new Solidity.

Option 3 is the right one. The `AllowedTargets` + `AllowedMethods` builders are stock MetaMask, used widely, and their `terms` encoders are exported via `@metamask/delegation-core` (`createAllowedTargetsTerms`, `createAllowedMethodsTerms`).

A second secondary question: should the operator sign **one** delegation covering both publish and compose, or **two** delegations split by action class?

## Decision

**Two delegations**, split by action class:

| Delegation | Caveats | Action class |
|---|---|---|
| **Publish (A)** | `DomainScopeEnforcer([allowedDomains])` + `TrustStakeCapEnforcer(cap, period)` | `ModuleRegistry.registerModule` only, in the allowed domains |
| **Compose (B)** | stock `AllowedTargetsEnforcer([MultiVault])` + stock `AllowedMethodsEnforcer([deposit, createAtoms, createTriples])` + `TrustStakeCapEnforcer(cap, period)` | The three MultiVault composing methods only, capped on `value` |

Both delegations name the runtime EOA as `delegate` and the operator's Smart Account as `delegator`. They are signed once by the operator in `/agent` step 4 and persisted to `localStorage`. The headless runtime in `scripts/agent-loop.ts` consumes them from `.env` (operator copy-pastes via the wizard's "Copy as .env" button).

`/tool/:id` compose stays **direct EOA** — the operator's own composition decisions are not what we want to delegate.

## Alternatives considered

- **Single combined delegation** — fewer signatures, but the caveat list becomes harder to reason about (the operator can't visually parse "this scope is just for publish" vs "this scope is just for compose"). Auditability suffers. Rejected.
- **Add a new ARP enforcer for MultiVault actions** — would let us collapse to one enforcer per delegation, but requires fresh contract + tests + review + deployment. Outside the hackathon time budget. Rejected.
- **Use only `TrustStakeCapEnforcer` for compose** — minimal but unsafe. Agent could call any payable function on any contract. Rejected.
- **Wire delegation into `/tool/:id` compose** (original Phase 3 plan) — would force the operator's act of composition through a delegation they signed to themselves, conceptually upside-down. The operator decides what their agent uses; that's not a runtime decision. Rejected.

## Consequences

**Positive:**
- The hackathon's load-bearing demo (operator signs once → agent acts autonomously, bounded) materializes without writing new Solidity. The enforcers we already shipped in Task 02b carry their weight.
- Two delegations make the operator UI cleaner: each form section describes one action class with one set of bounds. Easier to explain in the demo video.
- The split also means the operator can revoke / re-sign one delegation without invalidating the other (e.g. tighten the publish cap without re-signing the compose authority).
- The runtime's headless script (`scripts/agent-loop.ts`) demonstrates both happy paths AND the `DomainNotAllowed` revert path in a single run, because the manifest deliberately includes domains some delegations won't cover.

**Negative:**
- Operator signs two EIP-712 messages back-to-back instead of one. Minor friction. Acceptable.
- The two delegations create two slots in `localStorage` per Smart Account. Storage shape documented in `app/src/hooks/use-stored-delegations.ts`.
- `MetaMask`'s stock `AllowedTargets` + `AllowedMethods` encoders come from `@metamask/delegation-core` directly. The high-level `createCaveatBuilder` exists in the type definitions but is not in the public exports of `@metamask/smart-accounts-kit`'s `index.d.ts` (verified 2026-06-03). We use `createCaveat(enforcer, terms)` + the core encoders, which is the documented low-level path. If MetaMask later re-exposes the builder, swapping to it is mechanical.

**Neutral (worth knowing):**
- `MULTI_VAULT_COMPOSE_SELECTORS` lists the function signatures (not selectors); the lib converts them via `toFunctionSelector` at caveat-build time. Changing a signature in `multi-vault.ts` ABI requires updating the constant here too — flag in the post-mortem.
- The runtime key lives in `.env` for the demo. ADR explicitly does NOT cover production secret management; that posture (TEE / KMS / Vault) is documented in the task spec's "out of scope" section.

## References

- Related rule: `.claude/rules/metamask-delegation.md` (Section "Off-chain side: Smart Accounts Kit")
- Related doc: `docs/00_HACKATHON_PIVOT.md` (the recast narrative this ADR enables)
- Related ADR: `.claude/choices/0009-smart-account-deploy-via-simple-factory.md` (SA must be deployed before delegations are validated)
- Related ADR: `.claude/choices/0010-scope-reanchor-two-layer-reputation-and-track-selection.md` (the two-layer model this delegation split serves)
- Related task: `tasks/04c-agent-autonomous-positioning.md`
- Related code:
  - `app/src/lib/caveat-builder.ts` (`composeAndStakeCaveats`, `publishModuleCaveats`)
  - `app/src/services/delegation-redeem.ts` (the agent-side redeem helpers)
  - `app/src/hooks/use-stored-delegations.ts` (the operator-side storage)
  - `scripts/agent-loop.ts` (the headless runtime)
