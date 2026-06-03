# Task 04c — Agent autonomous positioning under bounded delegation

> **Status: IN PROGRESS** (started 2026-06-03).
>
> **Hackathon track**: MetaMask Dev Cook-Off — primary track ($3000 Best Agent). Narrative-preservation check required in completion report.

## Objective

Make the agent **the actor** in the protocol — autonomously publishing modules in its operator-authorized domains, declaring tool composition triples on Intuition, and staking tTRUST on tools — bounded entirely by a small set of signed ERC-7710 delegations.

> *The operator signs two delegations once. From that point the agent runtime, holding only the runtime key, can discover modules, register new ones in its scope, declare its composition publicly on Intuition, and stake conviction-money on tools it considers useful — without ever asking the operator again. Every action passes through the MetaMask `DelegationManager`, which calls our custom `DomainScopeEnforcer` + `TrustStakeCapEnforcer` (and MetaMask's stock `AllowedTargetsEnforcer`) `beforeHook`s. Out-of-scope or over-cap actions revert at the framework level.*

This is the hackathon's load-bearing demo. Without it, the submission is "we built a registry and a UI"; with it, the submission is "we built an agent that positions itself autonomously inside its principal's authority".

## Why this exists (and what corrected)

Phase 04b's compose flow (`/tool/:id`) signs from the connected operator EOA directly. That is correct **for the operator**'s explicit actions but does not exercise the delegation framework. The submission narrative requires the **agent** (runtime, not browser) to be the one staking + composing, bounded by enforcers.

A first plan attempted to wire delegation into the operator's compose flow itself. That plan was wrong: the existing `DomainScopeEnforcer` is hard-coded to gate `ModuleRegistry.registerModule` (selector check + `domain` argument decode). It rejects any other selector. The fix is to keep two distinct delegations with appropriate caveats per action class (publish vs. compose+stake), and to route the agent runtime through both.

## Required skills

- **Canonical**: `mms-smart-accounts-kit` — specifically `references/delegations.md` for the SDK caveat builders, `references/smart-accounts.md` for SA deploy guarantees re: ERC-1271 signature validation.
- **Local**: `arp` SKILL.md for the two-layer reputation framing.
- Vendored Intuition skill for `MultiVault` payable surface.

## Required rules

- `.claude/rules/code.md`
- `.claude/rules/ui.md`
- `.claude/rules/metamask-delegation.md`
- `.claude/rules/workflow.md`

## Architecture

Two delegations, signed once by the operator, stored client-side + exported to the runtime via `.env`:

**Delegation A — Publish modules**
| Field | Value |
|---|---|
| delegator | Operator Smart Account |
| delegate | Runtime EOA address |
| caveats | `DomainScopeEnforcer([allowedDomains])` + `TrustStakeCapEnforcer(cap, period)` |
| effective scope | Agent can call `ModuleRegistry.registerModule` only for `domain ∈ allowedDomains`, total spend ≤ cap per rolling period |

**Delegation B — Compose & stake**
| Field | Value |
|---|---|
| delegator | Operator Smart Account |
| delegate | Runtime EOA address |
| caveats | `allowedTargetsBuilder([MultiVault])` (stock) + `allowedMethodsBuilder([deposit, createAtoms, createTriples])` (stock) + `TrustStakeCapEnforcer(cap, period)` (ours) |
| effective scope | Agent can call only the three composing methods on MultiVault, total spend ≤ cap per rolling period |

The operator's runtime key is the `delegate` for both — single keypair, two scopes.

## Deliverables

### UI — operator signing flow

- [ ] `/agent` wizard: add **step 5 "Sign delegations"** after the existing "Deploy Smart Account" step
  - Form: multi-select allowed domains (chips driven by `useDomains` from the current module list), numeric cap input (tTRUST), period selector (1h / 1d / 7d preset radio)
  - Two calls to `smartAccount.signDelegation` (one per delegation A and B)
  - Display each signed delegation as a hex blob with "Copy to clipboard" button (for paste into `.env`)
  - Persist both to `localStorage` keyed by SA address (for the UI to show "delegation already active" on subsequent visits)
- [ ] `app/src/hooks/use-stored-delegations.ts` — `useStoredDelegations(saAddress?)` returns `{publish?, compose?, set, clear}` backed by `localStorage` with serialize/deserialize via the existing `delegation.ts` helpers

### Service layer — agent-side redemption

- [ ] `app/src/services/delegation-redeem.ts` — thin wrappers around `redeemArpDelegation` (already in `agent-action.ts`) for each action class. Functions:
  - `redeemRegisterModule({signedDelegation, agentWalletClient, registry, module: {name, domain, schemaURI, description}})` — for Delegation A
  - `redeemEnsureAtomForThing({signedDelegation, agentWalletClient, publicClient, thing})` — wraps the pin + createAtoms path under Delegation B
  - `redeemDeclareUsesTriple({signedDelegation, agentWalletClient, publicClient, agentAtomId, toolAtomId})` — wraps createTriples under Delegation B
  - `redeemStakeOnAtom({signedDelegation, agentWalletClient, publicClient, atomId, amount, receiver?, minShares?})` — wraps deposit under Delegation B
- [ ] Update `app/src/lib/caveat-builder.ts` if needed to expose helpers that combine our `TrustStakeCapEnforcer` with the stock `allowedTargetsBuilder` / `allowedMethodsBuilder` — keep ARP-specific composition logic in one place

### Headless runtime — the agent loop

- [ ] `scripts/agent-loop.ts` — Bun script, reads `.env`:
  - `AGENT_PRIVATE_KEY` (runtime key, generated by `/agent` step 2)
  - `DELEGATION_PUBLISH_HEX` (the JSON-stringified signed delegation A from step 5)
  - `DELEGATION_COMPOSE_HEX` (B)
  - `MANIFEST_PATH` (default `scripts/manifest-modules.json`)
- [ ] Loop body:
  1. Read manifest of `{name, domain, schemaURI, description}` entries
  2. For each: if module not yet on chain → `redeemRegisterModule`
  3. After publish round, for each module of interest in the operator's allowed domains → `redeemEnsureAtomForThing` (agent atom) → `redeemDeclareUsesTriple` → `redeemStakeOnAtom` with a small amount
  4. Print a structured log line per action: action, txHash, gas used, vault TVL after
- [ ] Graceful handling: a revert (out-of-scope domain, cap exceeded) prints the enforcer's custom error name and the loop continues to the next item

### Demo manifest

- [ ] `scripts/manifest-modules.json` — 8 modules across 4 domains:
  - `solidity-audit`: Slither, Mythril (plus the existing Solidity Audit)
  - `code-review`: Code Review GPT, ESLint Bot
  - `defi-strategy`: Yearn Optimizer, Aave Analytics
  - `data-analytics`: Dune Query, Etherscan Bulk Fetch

  This populates the domain filter on the home page with real diversity.

### Revert-path demonstration

- [x] **Implemented at the script level rather than the UI.** `scripts/agent-loop.ts` catches `DomainNotAllowed` on each `redeemRegisterModule` attempt (see `agent-loop.ts` line ~168) and logs a `domain rejected (DomainNotAllowed)` structured line, then continues with the next manifest entry. Because the manifest deliberately spans more domains than any single `publish` delegation will typically cover, the revert path fires naturally during a single `bun run scripts/agent-loop.ts` and is visible in the terminal log of the demo video.
- [x] **Decision recorded.** A separate `/agent` "Test revert" UI surface would have duplicated the demo signal without adding value — the headless script already shows the enforcer firing in real time, in the same window where every other agent action is being narrated. Adding a UI button would dilute the wizard's role (operator configures, agent acts elsewhere). Documented in ADR 0012.

### Compose flow (`/tool/:id`)

- [ ] **No change** — operator continues to sign directly (their explicit composition decisions are not what we want to delegate). Document this in the task post-mortem with the rationale (acts of design ≠ runtime decisions).

### Tests

- [ ] vitest unit tests for `delegation-redeem.ts`: each wrapper builds the correct `ExecutionStruct` and calls `redeemArpDelegation` with the right delegation + execution; mock `DelegationManager.execute.redeemDelegations`
- [ ] Tests for the new combined caveat builders (if any added to `caveat-builder.ts`) — round-trip encode → decode matches the Solidity expectation
- [ ] No new tests for `scripts/agent-loop.ts` (script orchestrator — covered by manual run)

### Documentation

- [ ] ADR `0012-agent-positioning-via-two-delegations.md` recording:
  - Why two delegations rather than one (separation of action classes; auditability)
  - Why we kept `/tool/:id` compose on direct EOA
  - The decision to use stock `AllowedTargets` + `AllowedMethods` rather than writing a new ARP enforcer
- [ ] Update `docs/00_HACKATHON_PIVOT.md` task list to reflect the recast narrative if necessary

## Out of scope (explicitly)

- A2A redelegation (sub-delegation agent-to-agent) — separate task, plausibly 04d, planned post-04c
- TEE / KMS / secret-manager integration for the runtime key — `.env` is the demo path; production posture is documented in the ADR
- UI for browsing other agents' delegations or reputation history — read-only marketplace view stays scoped to tools+stake
- Replacing `DomainScopeEnforcer` with a more general "allowed selectors on `ModuleRegistry`" enforcer — current implementation is sufficient for the hackathon scope

## Narrative-preservation answer (to fill at completion)

> *Does this preserve the hackathon submission narrative?*
>
> Yes — the implementation directly materializes the pivot narrative ("agent registers via MetaMask Smart Accounts, declares its tool composition on Intuition's semantic graph, stakes TRUST on its tools, posts attestations autonomously within a scoped ERC-7710 delegation, bounded by ARP-specific caveat enforcers"): the operator signs two delegations once in `/agent`, the headless `scripts/agent-loop.ts` runtime publishes modules + declares triples + stakes tTRUST autonomously under those delegations, and the same loop demonstrates the enforcer reverts (`DomainNotAllowed`, `StakeExceedsCap`) — see `docs/00_HACKATHON_PIVOT.md`.
