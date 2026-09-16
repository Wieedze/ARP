# 08 — Restore the Intuition write path, server-side only

**Task:** `tasks/06-pin-writes-server-side.md`
**Completed:** 2026-09-16
**Commit:** `f482588` (docs on top of `1e9b92b`)
**Verifier verdict:** PASS

## What shipped

- `app/src/services/intuition-pin.ts` — rewritten. Module constant `PIN_ENDPOINT = "https://pin.intuition.systems/v1/graphql"` (deliberately *not* derived from `deployments.chain.graphqlUrl`, which is now read-only); signature is `pinThing(args, auth: PinAuth)` with `PinAuth = {apiKey, headerName?}`, `headerName` defaulting to `"apikey"`; 401 throws a named `PinAuthError` naming `INTUITION_PIN_API_KEY`, forbidding the `VITE_` prefix, and pointing at `bun run verify:pin`.
- `app/src/services/intuition-graph.ts` — `pinAuth` threaded as a **required** param through `ensureAtomForThing`, `getOrCreateUsesPredicateAtomId`, `declareUsesTriple`.
- `app/src/services/delegation-redeem.ts` — same for `redeemEnsureAtomForThing`. The non-pinning variants (`ensureAtomForURI`, `redeemEnsureAtomForURI`, `redeemEnsureAtomForCaip10`) are untouched and stay credential-free.
- `scripts/pin-env.ts` — new. `requirePinAuth(): Required<PinAuth>` reads `INTUITION_PIN_API_KEY` + `INTUITION_PIN_API_KEY_HEADER`, throws with the remediation inline, no silent fallback.
- `scripts/seed.ts` — local duplicate `pinThing` deleted (~22 lines), imports the shared service; credential resolved at the top of `main()` before any chain read.
- `scripts/agent-loop.ts`, `scripts/agent-stake-on-use.ts` — pass `pinAuth` into `redeemEnsureAtomForThing`.
- Three suites updated: `intuition-pin.test.ts` (endpoint assertion including a `not.toBe(deployments.chain.graphqlUrl)` regression guard, default header, `headerName` override, `PinAuthError` message content), `intuition-graph.test.ts`, `delegation-redeem.test.ts`. 7 files / 55 tests pass.
- `.claude/skills/intuition/reference/graphql-queries.md` + `reference/schemas.md` — dated "ARP divergence note" per ADR 0005; snapshot text left intact rather than rewritten.

## Surprises

- The type system does the enforcement, not review discipline. Making `pinAuth` required rather than optional means a browser caller is a compile error — `bunx tsc -b` in `app/` is now the leak check. The invariant `grep -rn "process.env" app/src/services/` → empty is the belt-and-braces half.
- `stakeOnUsedMethodologies` calls `requirePinAuth()` *inside itself* rather than taking the credential as a param. That is why its two callers (`scripts/agent-server.ts`, `scripts/agent-server-specialist.ts`) needed no change at all. Sanctioned by ADR 0016 point 3 (it is a `scripts/` module), but the consequence is worth knowing: those two servers fail on a missing key at first-request time, not at boot.
- `scripts/verify-pin-key.ts` keeps its own standalone `pinThing`. Deliberate — a preflight tool that shares the code path it is preflighting proves less — and explicitly carved out in `pin-env.ts`'s header. Do not "dedupe" it later without reading that comment.

## Decisions made

- **Credential as an explicit parameter, not an ambient `process.env` read** — keeps `app/src/services/` pure and testable without an environment, and converts the leak from a review habit into a compile-time fact. ADR: `.claude/choices/0016-intuition-writes-move-server-side.md`.
- **`headerName` is configurable but defaults** — a scheme change upstream (e.g. `Authorization: Bearer`) then needs an env var, not a code change. ADR: same (point 4).
- **`scripts/pin-env.ts` follows prettier style (2-space/single-quote) rather than its neighbours'** — it matches `scripts/verify-pin-key.ts`, the sibling added by the same ADR. No ADR; recorded here.

## Rules touched

- `.claude/rules/code.md` — sufficient. Service purity ("a service never imports from React", no ambient env) carried the whole design; no `any`, no `@ts-ignore`, no dead code, no `TODO` in any of the 10 changed `.ts` files.
- `.claude/rules/security.md` — sufficient. "No API keys in client code" and "fail loudly on missing env, no silent fallbacks" both directly instantiated. `.env.example` already documented `INTUITION_PIN_API_KEY` with the `VITE_` prohibition.
- `.claude/rules/workflow.md` — sufficient. Two atomic conventional commits, `fix(pin):` and `docs(skill):`, correctly split.

## Suggestions for future tasks

- **Two pre-existing gates are broken and will keep muddying acceptance criteria.** (a) `bun run test` at the root exits 1 solely because the `sdk` workspace declares `"test": "vitest run"` and has zero test files. (b) `contracts` lint is `solhint`, which is not installed in this environment (exit 127). Neither is caused by a task; both make a literal reading of "`bun run test` green, `bun run lint` clean" un-passable. Worth one chore commit.
- **`bunx prettier --check` fails on 139 files repo-wide**, including 7 of this task's files *at their pre-task state* (verified by checking out the `78e8f3f` copies in isolation). The repo's actual style is 4-space/double-quote; `.prettierrc.json` says 2-space/single-quote. There is no hook and no CI, so nothing enforces it. Either fix the config to match reality or reformat once — do not keep asking task authors to judge it.
- **Scripts that spend testnet funds can still be verified without spending them.** Running `INTUITION_PIN_API_KEY="" bun scripts/seed.ts` and the same for `agent-loop.ts` proved import wiring resolves, the new module loads, and `requirePinAuth()` is reached at `seed.ts:127` / `agent-loop.ts:72` *before* any chain work — a stronger signal than reading the diff, at zero cost. Reuse this pattern.
- **`declareUsesTriple` has no production caller** (only tests). Pre-existing, not introduced here, but `code.md` forbids unused exports — either wire it or note why it is API surface.
