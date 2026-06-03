# 0011 — App test scope: services only, no hooks/components

**Status:** Accepted
**Date:** 2026-06-03
**Triggered by:** User request mid-Task-04b, end-of-task verification preparation.

## Context

`.claude/rules/code.md` mandates that "a function shipped without tests is not done", with explicit coverage targets per layer:

- Contracts: 100% line + branch coverage on the public surface.
- Services: every public function has a unit test.
- Hooks and components: tested behaviorally with React Testing Library.

When the agent identity + tool composition flow shipped (Task 04 extension), the app side had **zero** automated tests, only forge tests on the contracts. Bringing the app to the rule's full target inside the hackathon window (12 days remaining at decision time) would require:

1. Vitest install + config — small.
2. Service tests — moderate; pure TS, mockable at the network boundary.
3. Hook tests — large; needs `@testing-library/react`, `@testing-library/react-hooks` (or its successors), Wagmi provider scaffolding per test.
4. Component tests — very large; needs a DOM environment (jsdom/happy-dom), provider stacks (Wagmi + React Router + Tailwind), and behavioral assertions for `AgentRegister`, `ToolDetail`, `ModuleList`, `WalletConnect`.

The hackathon submission narrative (`docs/00_HACKATHON_PIVOT.md`) does not require behavioral component tests. The judges grade the live demo and the underlying delegation architecture, not the test suite shape.

## Decision

The app's unit-test surface is **services only**. Hooks and components are not tested automatically for the hackathon submission; they are covered by manual review (`ui-reviewer` agent) and live browser smoke per `.claude/rules/workflow.md`. Contracts retain the 100% forge coverage requirement unchanged.

## Alternatives considered

- **Full code.md compliance (services + hooks + components)** — rejected on time-cost. Hook and component tests would consume an estimated 2-3 days of the remaining 12-day window for marginal regression protection on a UI surface that changes rapidly between now and submission. The trade is wrong against the load-bearing risks (delegation wiring, A2A redelegation, demo recording).
- **No app tests at all** — rejected. Services contain the only off-chain business logic in the codebase (atom pinning, agent identity recovery from event logs, EIP-712 signing of `setAgentWallet`, Smart Account deploy detection). A regression here breaks the demo silently. Tests at this layer are cheap (no DOM, pure injection) and high-value.
- **End-to-end Playwright tests against Intuition Testnet** — rejected. Pretty for the demo, but flaky against live RPC, expensive to maintain, and does not replace unit coverage on the service layer.

## Consequences

**Positive:**
- 29 unit tests landed across 5 service files (`intuition-pin`, `atom-stake`, `intuition-graph`, `agent-identity`, `smart-account`) with assertions on real behavior: EIP-712 signature recovery, idempotent atom creation, factory-args deploy guard, getLogs-scoped event recovery.
- The test fixtures (`__tests__/fixtures.ts`) standardize the `PublicClient` / `WalletClient` doubles and the `readContractDispatcher` pattern. Adding tests for a new service file is now a 5-minute task.
- The dependency-injection pattern in the services (`publicClient` / `walletClient` as params, not module-level singletons) — which we already followed for non-test reasons — pays off here: tests pass mocks in directly without `vi.mock` gymnastics. `smart-account.ts` is the one exception (uses the module-level `publicClient`); its tests use `vi.mock` for the SDK and the clients module.

**Negative:**
- Hook bugs (incorrect React Query keys, missing `enabled` guards, stale state on disconnect) will only be caught by manual browser testing. Mitigation: keep hooks minimal (thin wrappers around services) so the surface area for bugs stays small.
- Component bugs (broken navigation, missing aria labels, regression in compose wizard step transitions) likewise rely on `ui-reviewer` + smoke testing. Mitigation: smoke the full happy path in browser before every commit that touches `AgentRegister.tsx` or `ToolDetail.tsx`.
- The rule in `code.md` is technically violated for the hooks/components surface. This ADR is the documented break; the post-hackathon plan is to revisit and either backfill the missing tests or amend the rule.

**Neutral (worth knowing):**
- Vitest config uses `environment: "node"` (no DOM). If hook/component tests are backfilled later, that file needs to gain `environment: "happy-dom"` or `"jsdom"` and `@testing-library/react` as a dep.
- `vi.resetModules()` is used in `intuition-graph.test.ts` to reset the module-scoped `cachedUsesAtomId` between tests. This means the chain object reference in writeContract assertions cannot be compared by identity — tests check `chain.id` instead. Documented inline.

## References

- Related rule: `.claude/rules/code.md` (the testing requirement this ADR carves out)
- Related rule: `.claude/rules/workflow.md` (the task-verification protocol)
- Related doc: `docs/00_HACKATHON_PIVOT.md` (the deadline pressure motivating the trade-off)
- Related files: `app/src/services/__tests__/`
