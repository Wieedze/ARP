# 54 — One path per profile, from the landing

**Task:** `docs/tasks/53-one-path-per-profile.md`
**Completed:** 2026-11-03
**Commit:** `de14def` on `feat/53-signed-listing` (on top of `d09c874`; 53a/b and the 53c web side came in through PR #50, the doc fixes through PR #53)
**Verifier verdict:** PASS on the second pass. The first pass failed on d09c874.

## What shipped

- `apps/web/src/components/onboarding/` — one panel opened by the nav's Connect and the landing's Get started; `ConnectPrompt` gates an action at six sites. Index pages stay open.
- `apps/web/src/lib/start-paths.ts`, `apps/web/src/services/start-steps.ts`, `apps/web/src/pages/StartPage.tsx` — `/start/:profile`, three profiles, steps ticked from the local feed.
- `apps/web/src/pages/AccountPage.tsx` — two tabs, Your agent first; scene 4 of `/` removed.
- `apps/web/src/services/list-tool.ts`, `apps/web/src/hooks/use-list-tool.ts` — path C posts to the sponsor's `POST /list-tool` (ADR `0123`).
- `apps/web/src/services/list-tool-sign.ts` — `signListing`: signs the listing request on 13579 after asking the wallet to switch; returns unsigned with a reason (`no-wallet`, `wrong-chain`, `declined`).

## Surprises

- The first version of the signing code hard-coded chain 13579 in the typed-data domain. The wallet config allows 13579, 1155 and 8453. A wallet on another chain refuses that domain, and a bare `catch` sent the listing unsigned without a word. Nobody had noticed the user's decision was being missed.
- "All have tests" was true of the service and false of the new branch. `StartPage.test.tsx` mocks `useListTool` whole, so the hook's logic had no test until it moved into a service.

## Decisions made

- **Switch chain before signing, unsigned on refusal** — a wallet on another chain is asked to switch to 13579; refused, the request goes under the anonymous cap on purpose, and the reason is returned. Covered by ADR `0114` §2 and ADR `0123`; no new ADR.
- **Path B shows a local-build hint** — `start-steps.ts` says the CLI is not on npm yet, rather than printing an `npx` command that 404s.

## Rules touched

- `.claude/rules/code.md` — sufficient. "Hooks tested behaviourally" caught the untested branch. Moving the hook's logic into a service with every IO passed in made it testable in a few lines.
- `.claude/rules/security.md` — sufficient; the list-tool request was already listed as a signature site (ADR `0123`).
- `.claude/rules/claims.md` — the 40/42 and 6/42 figures now carry their intervals.

## Suggestions for future tasks

- A signature whose domain names a fixed chain needs a chain check or a switch before signing. A `catch` there must return why it fell back, not just fall back.
- When a page test mocks a hook whole, the hook's own branches need a test somewhere else. Check this before you claim the code is covered.

## Evidence ladder

**Which tier of the evidence ladder does this serve, and does it move ARP up it?**

Staked, indirectly. Path A ends with a sponsored declaration by an agent ARP does not control, and a 53c listing only makes a tool findable. So this moves ARP up only once those agents are measured to be third parties, and nothing here measures that.
