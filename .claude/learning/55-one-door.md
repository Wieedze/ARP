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

---

## Follow-up: §7 and §8, the wallet leaves the panel (ADR `0128`)

**Verified:** 2026-11-03, on top of `8cb7bea`, uncommitted. **Verdict:** PASS on the third pass. The first failed on code-adjacent issues (none in the code itself): ADR `0128` cited §2 for quotes in §7, and the working tree held a `README.md` rewrite and six `apps/*/README.md` that another session wrote. The second pass confirmed both resolved: the citation is fixed, and those files are excluded from the task-62 commit.

**What shipped**

- `components/onboarding/ConnectPrompt.tsx` — connects the wallet directly; an always-rendered `aria-live` line says "No wallet detected" (`ProviderNotFoundError` or no connector) or wagmi's `shortMessage`.
- `components/onboarding/OnboardingPanel.tsx` + `onboarding-context.ts` — no wallet line; centred (`m-auto` in a flex parent); Close fixed top-right on a banged `--color-ground`; closes on `landed()`, which `StartPage` calls on mount, so neither the landing nor the route fallback shows through.
- `components/WalletConnect.tsx` — renders nothing while disconnected.
- `DeclareUse.tsx`, `AgentImport.tsx` — "Connect the wallet that owns the agent" is a `ConnectPrompt`, not a sentence.
- `services/start-steps.ts` — the "Free for now" step removed from all three paths. `StartPage`'s `<main>` → `<div>`.

**Surprises**

- `injected()` is always configured, so "no wallet" surfaces only as `connect`'s error. A connector-presence check would have left a dead button. `ui-reviewer` found it in a browser.
- Closing the sheet on the location change still flashed the route fallback for about 280ms, because `RouteTransition` keys routes on `location.key`. Only a mount signal from the destination page closes it cleanly.
- An ADR number collided with one already on origin (`0126`), so it became `0128`. Check `git ls-tree origin/main .claude/choices` before numbering.
- A shared checkout picked up another session's README rewrite. Commit by explicit path when sibling sessions share a working tree.

**Decisions**

- **A wallet is asked for only by the action that signs.** ADR: `.claude/choices/0128-a-wallet-is-asked-for-by-the-action-that-signs.md`. It supersedes part of ADR `0114` item 1.

**Gates** (`apps/web` only): `tsc -b` 0, lint 0, test 81 files / 745 passed / 2 skipped, `check:tokens` clean.

**Evidence ladder:** asserted. It does not move ARP up a tier; it removes friction before the first rung.
