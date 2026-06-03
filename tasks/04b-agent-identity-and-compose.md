# Task 04b — Agent identity + tool composition UI

> **Status: COMPLETE** (2026-06-03, commits `d92b7e3` → `1e22843`).
>
> **Hackathon track**: MetaMask Dev Cook-Off — primary track ($3000 Best Agent), secondary track ($3000 Best A2A — unlocked downstream by Task 04c). Narrative-preservation check required in completion report.

## Objective

Materialize the **two-layer reputation model** (ADR 0010) end-to-end in the UI:

> *An operator mints an ERC-8004 agent NFT, designates a runtime wallet that the agent program holds, then the agent declares its tool composition as Intuition triples and stakes tTRUST on each tool atom. The triple is the immutable claim (graph); the stake is the mutable economic conviction (vault). Other agents and humans browse the graph and use stake magnitudes to weight trust.*

Concretely, the UI now exposes two flows:

1. `/agent` — wizard that mints the operator-owned NFT, generates the runtime keypair, signs the EIP-712 `SetAgentWallet` message on behalf of the runtime, and deploys the user's Smart Account on chain.
2. `/tool/:id` — per-tool detail page that shows the tool's atom + reputation metrics (total staked, shares minted) and runs the three-tx compose wizard (ensure agent atom → declare `uses` triple → deposit tTRUST).

## Required skills

- **Canonical**: `arp` local skill (the SKILL.md describes the two-layer model)
- **Intuition**: vendored `.claude/skills/intuition/` for atom/triple/vault primitives
- **MetaMask**: `mms-smart-accounts-kit` for the Smart Account path inherited from Task 03b

## Required rules

- `.claude/rules/code.md`
- `.claude/rules/ui.md`
- `.claude/rules/metamask-delegation.md`
- `.claude/rules/workflow.md`

## Deliverables

### On-chain prerequisite

- [x] Vendor ChaosChain's ERC-8004 reference IdentityRegistry, port to OpenZeppelin v5, deploy on Intuition Testnet. Address in `deployments/13579.json` as `arp.identityRegistry`. (commit `58f76b6`)

### Service layer (`app/src/services/`)

- [x] `agent-identity.ts` — `registerAgent`, `findAgentIdByOwner` (Registered event scan), `designateAgentRuntimeWallet` (browser-side keypair gen + EIP-712 self-sign + on-chain `setAgentWallet`)
- [x] `atom-stake.ts` — `depositOnAtom` (curve-aware deposit to MultiVault), `readVaultState` (totalAssets + totalShares)
- [x] `intuition-pin.ts` — `pinThing` against the Hasura GraphQL endpoint declared in deployments
- [x] `intuition-graph.ts` — `ensureAtomForThing` (idempotent atom creation), `getOrCreateUsesPredicateAtomId` (module-cached canonical "uses" predicate), `declareUsesTriple` (creates the (agent, uses, tool) triple)

### Hooks (`app/src/hooks/`)

- [x] `use-agent.ts` — `useAgentId` (owner → agentId via event scan), `useAgentWallet` (current runtime wallet), `useTotalAgents`
- [x] `use-atom-stake.ts` — `useAtomStake(atomId)` returns vault metrics, polls every 15s
- [x] `use-modules.ts` — `useModule(id)` added for single-module reads on the detail page

### Pages (`app/src/pages/`)

- [x] `AgentRegister.tsx` — 4-step wizard (RoleBanner explaining operator vs runtime, mint, designate, deploy SA), error surfacing, transaction-hash explorer links
- [x] `ToolDetail.tsx` — metadata table, reputation metrics tiles, compose wizard (3 steps: agent atom → triple → stake)
- [x] `App.tsx` — `/tool/:id` route added
- [x] `ModuleList.tsx` — rows are `role="link"`, keyboard-navigable, route to `/tool/:id` on click/Enter/Space

### ABI (`app/src/lib/abi/`)

- [x] `identity-registry.ts` — minimal ABI fragment: `register`, `getAgentWallet`, `setAgentWallet`, `Registered` event, `AgentWalletSet` event, plus `totalAgents`, `balanceOf`, `ownerOf`, `tokenURI`

### Tests

- [x] vitest installed, `bun run test` / `bun run test:watch` wired
- [x] Mock client fixtures (`PublicClient`/`WalletClient` doubles + `readContractDispatcher`)
- [x] 29 unit tests across 5 service files:
  - `intuition-pin.test.ts` — 4 tests: GraphQL mutation shape, HTTP error path, GraphQL error path, missing-URI guard
  - `atom-stake.test.ts` — 6 tests: curve-aware deposit, custom receiver, custom minShares, RPC failure bubbles, vault state reads (populated + empty)
  - `intuition-graph.test.ts` — 6 tests: atom idempotence (existing skip vs new create), empty-string optional fields, cached "uses" predicate (single pin across reuses), triple args correctness
  - `agent-identity.test.ts` — 7 tests: register + Registered event recovery, no-event guard, last-of-multiple selection, findAgentIdByOwner (null/last), EIP-712 signature recovery against the runtime address (proves self-consent), custom validForSeconds
  - `smart-account.test.ts` — 6 tests: private-key signer dispatch, walletClient signer dispatch, custom salt, deploy-skip when code exists, factory-tx path, no-factory-args guard
- [x] Typecheck clean (`bun x tsc --noEmit -p tsconfig.app.json`)
- [x] Lint clean (`bun run lint`)

### Documentation

- [x] ADR `0011-app-test-scope-services-only.md` — records the deliberate scope (services only, no hooks/components) and the rationale.

## Out of scope (explicitly)

- A2A redelegation (sub-delegation between agents) — that is Task 04c
- Wiring the user's Smart Account + ERC-7710 delegation into the compose path itself — the current page signs from the connected EOA directly. Branching delegation through the compose wizard is **the next task** before the hackathon submission (Phase 3 in the conversation plan)
- Hook tests + component tests (see ADR 0011)
- A modules-list reputation row (stake on every row) — likely Task 04d if time permits
- Pinning tool atom images, agent avatars — text-only metadata for MVP

## Narrative-preservation answer

> *Does this preserve the hackathon submission narrative?*
>
> Yes. The UI now exposes both ARP layers in a single user-facing flow: ERC-8004 identity + Intuition triple (immutable) + Intuition stake (mutable). Operator vs runtime split matches the autonomous-agent framing in `docs/00_HACKATHON_PIVOT.md`. Smart Account deploy is wired but not yet load-bearing in the compose path — that gap is the next task (Phase 3), and was deliberately scoped out of 04b to keep the diff reviewable.
