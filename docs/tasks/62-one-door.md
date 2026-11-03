# Task 62 — One door: Register folds into Get started

**Status:** **verified** 2026-11-03 on `feat/62-one-door`. `ui-reviewer` PASS on the third round
(§6); `task-verifier` PASS on the second pass (the first failed on a misplaced docstring and an ADR
sentence the redirect contradicted), post-mortem `.claude/learning/55-one-door.md`.
**ADR:** `0125`.
**Depends on:** task 53 (`/start/<profile>`, the onboarding panel), task 46d (`/register`'s tiles).
**Rules:** `ui.md`, `code.md`, `claims.md`, `workflow.md`.
**Reviewers:** `ui-reviewer`, then `task-verifier`. No contract, no Intuition write path changed.

---

## 1. Why

The web app had two doors for putting an agent or a tool into ARP, and they wrote the same data:

| | Get started → `/start/<profile>` | Register → `/register?what=` |
| --- | --- | --- |
| Tool | the sponsor lists the URL (ADR `0123`) | `ToolRegister`, the operator's wallet |
| Agent | `arp init --sponsored`, the sponsor pays the mint (ADR `0110`) | `YourAgent`: mint with a wallet, or import an id |

A tool's atom id is a pure function of its URL (ADR `0054`), so both tool paths create the same
atom; on testnet both agent paths mint into the same registry (`apps/web/src/services/identity-mint.ts`,
`TESTNET_MINT`). The only real difference was who pays, which is an option inside one flow and not
a choice of door.

## 2. The user's decisions (2026-11-03)

| Question | Decision |
| --- | --- |
| Unify the two flows | _« ok pourquoi garder register si on peut juste garder get started ? »_ — keep Get started only |
| What Register held that Get started lacked | Importing an existing id, the wallet path, and mainnet. All three move into `/start/<profile>` (recommendation accepted: _« oui »_) |
| The nav | "Register" becomes "Get started" and opens the same panel as the landing (_« oui »_) |

## 3. What changed

- `/start/agent` asks "Does your agent already have an ERC-8004 id?". Yes (`?have=yes`) replaces
  the steps with the import, because the steps would mint a second identity. Otherwise the
  sponsored steps show, with "Mint with a wallet instead" (`?with=wallet`) under them.
- `/start/tool`'s "Add it with a wallet" opens `ToolRegister` on the same page (`?with=wallet`)
  instead of linking to `/register`.
- The nav's Register item is a Get started button (`NavAction`) that opens the onboarding panel and
  is lit on `/start/*`.
- `/register`, `/agent` and `/agent/import` redirect to the branch they named
  (`RegisterRedirect` in `App.tsx`). `Register.tsx` and the `YourAgent` wrapper are deleted;
  `YourAgent.tsx` is now `MintIdentity.tsx`.
- `AgentImport`'s `h1` is an `h2` under the start page's `h1`, and its paragraph pointing at the
  old `/agent` is gone.
- `README.md`'s route table loses `/register`.
- A wallet form opened from its link takes the focus (`WalletSection`), decided from the
  navigation's state because `RouteTransition` remounts the page on every push. `ImportStep`'s
  headings are `h3`, under the import's `h2`.

## 4. Do not do in this task

- Change what the sponsor accepts, or any write path. The forms are moved, not changed.
- Touch `/start/claude`: it is usage, not registration.

## 5. Gates

Run 2026-11-03, scope `apps/web` only:

```
cd apps/web && bunx tsc -b          # 0
cd apps/web && bun run lint         # 0
cd apps/web && bun run test         # 81 files, 742 passed, 2 skipped
cd apps/web && bun run check:tokens # every var() resolves
```

## 6. Review

`ui-reviewer`, three rounds, measured in Chromium against the dev server:

1. **FAIL**: "Get started" rendered in Archivo, because the unlayered `button { font-family:
   inherit }` beat an unbanged `font-mono`. `lib/control-class.ts`'s bang table now lists
   `font-family`. Also: no focus target after the wallet link unmounted, no heading on the tool's
   wallet form.
2. **FAIL**: the focus fix did nothing in the app. `RouteTransition` keys every route on
   `location.key`, so the page remounted and a first-render flag could not tell the link from a
   fresh load. The unit test passed because it rendered without `RouteTransition`.
3. **PASS**: focus is decided from `location.state` and the navigation type. Link by Enter or
   click focuses the section; Back, Forward, reload and a fresh load do not. The test renders
   inside `RouteTransition` and fails when the fix is removed (mutation-checked).
