# 08 — Restore the Intuition write path, server-side only

**Task:** `tasks/06-pin-writes-server-side.md`
**Completed:** 2026-09-16
**Commit:** `f482588` (docs on top of `1e9b92b`)
**Verifier verdict:** PASS

## What shipped

- `app/src/services/intuition-pin.ts` — rewritten. Module constant `PIN_ENDPOINT = "https://pin.intuition.systems/v1/graphql"` (deliberately *not* derived from `deployments.chain.graphqlUrl`, which is now read-only); signature is `pinThing(args, auth: PinAuth)`; `PinAuth` is **branded** with an unexported `unique symbol` (see "Follow-ups" below for why), `headerName` defaults to the exported `DEFAULT_HEADER_NAME`; 401 **and 403** throw a named `PinAuthError` naming `INTUITION_PIN_API_KEY`, forbidding the `VITE_` prefix, and pointing at `bun run verify:pin`.
- `app/src/services/intuition-graph.ts` — `pinAuth` threaded as a **required** param through `ensureAtomForThing`, `getOrCreateUsesPredicateAtomId`, `declareUsesTriple`.
- `app/src/services/delegation-redeem.ts` — same for `redeemEnsureAtomForThing`. The non-pinning variants (`ensureAtomForURI`, `redeemEnsureAtomForURI`, `redeemEnsureAtomForCaip10`) are untouched and stay credential-free.
- `scripts/pin-env.ts` — new. `requirePinAuth(): PinAuth` — the single sanctioned constructor of the branded type — reads `INTUITION_PIN_API_KEY` + `INTUITION_PIN_API_KEY_HEADER`, throws with the remediation inline, no silent fallback.
- `scripts/seed.ts` — local duplicate `pinThing` deleted (~22 lines), imports the shared service; credential resolved at the top of `main()` before any chain read.
- `scripts/agent-loop.ts`, `scripts/agent-stake-on-use.ts` — pass `pinAuth` into `redeemEnsureAtomForThing`.
- Three suites updated: `intuition-pin.test.ts` (endpoint assertion including a `not.toBe(deployments.chain.graphqlUrl)` regression guard, default header, `headerName` override, `PinAuthError` message content), `intuition-graph.test.ts`, `delegation-redeem.test.ts`. 7 files / 55 tests pass.
- `.claude/skills/intuition/reference/graphql-queries.md` + `reference/schemas.md` — dated "ARP divergence note" per ADR 0005; snapshot text left intact rather than rewritten.

## Surprises

- The type system does the enforcement, not review discipline — but only after a second pass. Making `pinAuth` *required* stops a caller forgetting it; it does not stop a caller inventing one, because a structural `{apiKey: string}` satisfies the parameter anywhere. Review caught the module comment and ADR 0016 both overclaiming this. The brand fixes it: `pinThing(args, {apiKey: "leaked"})` is now TS2345. `bunx tsc -b` in `app/` is the leak check; `grep -rn "process.env" app/src/services/` → empty is the belt-and-braces half.
- `stakeOnUsedMethodologies` calls `requirePinAuth()` *inside itself* rather than taking the credential as a param. That is why its two callers (`scripts/agent-server.ts`, `scripts/agent-server-specialist.ts`) needed no change at all. Sanctioned by ADR 0016 point 3 (it is a `scripts/` module), but the consequence is worth knowing: those two servers fail on a missing key at first-request time, not at boot.
- `scripts/verify-pin-key.ts` keeps its own standalone `pinThing`. Deliberate — a preflight tool that shares the code path it is preflighting proves less — and explicitly carved out in `pin-env.ts`'s header. Do not "dedupe" it later without reading that comment.

## Decisions made

- **Credential as an explicit parameter, not an ambient `process.env` read** — keeps `app/src/services/` pure and testable without an environment. ADR: `.claude/choices/0016-intuition-writes-move-server-side.md`.
- **`PinAuth` is nominal, not structural** — an unexported `unique symbol` brand, minted only by `requirePinAuth()` through one commented assertion. This is what actually delivers ADR 0016's "by construction rather than by convention"; without it the claim was false. No new ADR: it implements 0016's stated intent rather than changing it.
- **403 is treated as 401** — a key that exists but is not entitled is the same operator problem as no key, and deserves the same remediation rather than a bare `pinThing HTTP 403`.
- **`headerName` is configurable but defaults** — a scheme change upstream (e.g. `Authorization: Bearer`) then needs an env var, not a code change. ADR: same (point 4).
- **`scripts/pin-env.ts` follows prettier style (2-space/single-quote) rather than its neighbours'** — it matches `scripts/verify-pin-key.ts`, the sibling added by the same ADR. No ADR; recorded here.

## Rules touched

- `.claude/rules/code.md` — sufficient. Service purity ("a service never imports from React", no ambient env) carried the whole design; no `any`, no `@ts-ignore`, no dead code, no `TODO` in any of the 10 changed `.ts` files.
- `.claude/rules/security.md` — sufficient. "No API keys in client code" and "fail loudly on missing env, no silent fallbacks" both directly instantiated. `.env.example` already documented `INTUITION_PIN_API_KEY` with the `VITE_` prohibition.
- `.claude/rules/workflow.md` — sufficient. Two atomic conventional commits, `fix(pin):` and `docs(skill):`, correctly split.

## Follow-ups (logged, deliberately not done)

- **Data Clumps in `intuition-graph.ts`.** `{walletClient, publicClient, pinAuth}` now travel together through `ensureAtomForThing`, `ensureAtomForURI` (two of the three), `getOrCreateUsesPredicateAtomId` and `declareUsesTriple`, and the same trio minus the wallet recurs in `delegation-redeem.ts`. An `IntuitionWriteContext = {walletClient, publicClient, pinAuth}` passed as one argument is almost certainly right: it would collapse four signatures, make "what do you need to write to Intuition" a single named concept, and give the branded credential a natural home. Flagged by the standards review of task 06 and **deliberately left undone** — it is a signature refactor across every caller and test, which task 06 did not ask for and which would have buried the security change it was actually about. Worth its own small task; no ADR needed unless the boundary turns out to be contentious.

## Suggestions for future tasks

- **Two pre-existing gates are broken and will keep muddying acceptance criteria.** (a) `bun run test` at the root exits 1 solely because the `sdk` workspace declares `"test": "vitest run"` and has zero test files. (b) `contracts` lint is `solhint`, which is not installed in this environment (exit 127). Neither is caused by a task; both make a literal reading of "`bun run test` green, `bun run lint` clean" un-passable. Worth one chore commit.
- **`bunx prettier --check` fails on 139 files repo-wide**, including 7 of this task's files *at their pre-task state* (verified by checking out the `78e8f3f` copies in isolation). The repo's actual style is 4-space/double-quote; `.prettierrc.json` says 2-space/single-quote. There is no hook and no CI, so nothing enforces it. Either fix the config to match reality or reformat once — do not keep asking task authors to judge it.
- **Scripts that spend testnet funds can be *smoke*-verified without spending them — but that is not completion.** This was initially offered in place of criteria 2 and 3; review correctly rejected it, because the one new live call (`redeemEnsureAtomForThing` with `pinAuth`) is precisely what an empty key never reaches. Both scripts were subsequently run for real on testnet 13579 (output in the task file). Keep the trick for wiring checks, never for acceptance. Running `INTUITION_PIN_API_KEY="" bun scripts/seed.ts` and the same for `agent-loop.ts` proved import wiring resolves, the new module loads, and `requirePinAuth()` is reached at `seed.ts:127` / `agent-loop.ts:72` *before* any chain work — a stronger signal than reading the diff, at zero cost. Reuse this pattern.
- **`declareUsesTriple` has no production caller** (only tests). Pre-existing, not introduced here, but `code.md` forbids unused exports — either wire it or note why it is API surface.
