# 55 — One door: Register folds into Get started

**Task:** `docs/tasks/62-one-door.md`
**Completed:** 2026-11-03
**Commit:** uncommitted (branch `feat/62-one-door`)
**Verifier verdict:** PASS (second pass; first FAIL on a misplaced docstring and an ADR sentence the redirect contradicted)

## What shipped

- `apps/web/src/pages/StartPage.tsx` — `/start/agent` asks "already have an ERC-8004 id?" (`?have=yes` → `AgentImport` replaces the steps); wallet forms (`MintIdentity`, `ToolRegister`) behind `?with=wallet`, lazy-loaded; `WalletSection` takes focus only on a non-POP navigation carrying `focusWallet` state.
- `apps/web/src/App.tsx` — `RegisterRedirect`: `/register`, `/agent`, `/agent/import` land on the branch they named; `apps/web/src/RegisterRedirect.test.tsx`, 7 cases.
- `apps/web/src/components/brand/NavSplit.tsx`, `Layout.tsx` — `NavAction` "Get started" opens the onboarding panel, lit on `/start/*`, closes the phone menu.
- `apps/web/src/pages/MintIdentity.tsx` — was `YourAgent.tsx`, wrapper and question removed; `Register.tsx`, `YourAgent.tsx` and their tests deleted.
- `AgentImport.tsx` h1 → h2, `ImportStep.tsx` h2 → h3; `lib/control-class.ts` table lists `font-family`; `README.md` route table drops `/register`.

## Surprises

- `RouteTransition` keys routes on `location.key`, so a first-render flag cannot tell a link push from a fresh load; the focus fix had to read `location.state` + navigation type. The unit test only caught it once it rendered inside `RouteTransition`.
- The unlayered `button { font-family: inherit }` turned a mono nav button into Archivo; caught by `ui-reviewer` in a browser, not by any gate.

## Decisions made

- **One door, wallet as an option inside it** — `/start/<profile>` is the only entry; sponsored first, wallet fallback on the same page. ADR: `.claude/choices/0125-one-door-register-folds-into-get-started.md`.
- **Nav item is a button opening the panel, not a link** — keeps the panel's "I use Claude" choice; cost: no open-in-new-tab. Same ADR.

## Rules touched

- `.claude/rules/ui.md` — sufficient; its "defeated by an unlayered rule" paragraph is exactly what bit `font-family`.
- `.claude/rules/claims.md` — sufficient; §5 caught an ADR sentence ("`/register?what=…` lands on `?with=wallet`") broader than the redirect.
- `.claude/rules/code.md` — sufficient; caught a docstring stacked on the wrong function.

## Suggestions for future tasks

- A component that depends on mount behaviour must be tested inside `RouteTransition`, as the app renders it.
- When an ADR restates a mapping that a table-driven test already encodes, copy the test's cases into the ADR rather than paraphrasing.
- `docs/12_THE_IDEA.md:85` and `scripts/measure/registry-mintability.ts` still say `/agent/import`; true via redirect, left deliberately.

## Evidence ladder

**Which tier of the evidence ladder does this serve, and does it move ARP up it?**

Asserted: an agent or tool entering ARP is the step before any declaration; it does not move ARP up a tier, it removes a duplicate door below the first rung that the staked and proven tiers depend on.
