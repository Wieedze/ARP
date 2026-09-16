# Task 06 — Restore the Intuition write path, server-side only

> **Status: COMPLETE** (2026-09-16, commits `1e9b92b` + `f482588`).
> Post-mortem: `.claude/learning/08-pin-writes-server-side.md`. Verifier: PASS.
>
> Not a hackathon task. No narrative-preservation answer required.
>
> Acceptance criteria 2 and 3 (`bun scripts/seed.ts`, `bun scripts/agent-loop.ts`)
> were not executed — they send real transactions on Intuition Testnet. Verified
> instead by running both with the pin key cleared: each resolves all imports and
> reaches `requirePinAuth()` before any chain work.
>
> Criterion 4 caveat: root `bun run test` and `contracts` lint fail for
> pre-existing reasons unrelated to this task (sdk has no test files; solhint is
> not installed). See the post-mortem.

## Objective

Restore every broken Intuition write path by pointing `pinThing` at the gated
`pin.intuition.systems` endpoint, and make it structurally impossible for the partner API key to
reach the client bundle.

## Why this exists

`pinThing` was removed from the indexer GraphQL endpoints. Measured 2026-09-16:

```
POST https://testnet.intuition.sh/v1/graphql   -> {"errors":[{"message":"no mutations exist"}]}
POST https://mainnet.intuition.sh/v1/graphql   -> {"errors":[{"message":"no mutations exist"}]}
POST https://pin.intuition.systems/v1/graphql  -> 401 {"message":"No API key found in request"}
```

`app/src/services/intuition-pin.ts` still posts to `deployments.chain.graphqlUrl`, which is now
read-only. Every atom-minting path in the repo is dead: the seed script, the agent loop, stake-on-use,
and the `uses` predicate. The demo does not work.

No browser flow pins — that was verified call site by call site, so nothing in the UI regresses. But
the pin-capable code lives in `app/src/services/`, one import away from a page wiring a partner key
into a `VITE_` variable and publishing it to every visitor.

Full context: `docs/08_ERC8004_AGENT_LAYER_OPPORTUNITY.md` §8. Decision: ADR 0016.

## Required skills

- **Local**: `arp` SKILL.md.
- Vendored `intuition` skill — **but it is stale on exactly this point**. `reference/graphql-queries.md:35`
  still claims the indexer endpoint supports pin mutations, and `reference/schemas.md` carries the old
  recipe. Read it for the `MultiVault` surface; ignore it on pinning. Re-syncing it is a deliverable
  of this task.
- `docs/07_INTUITION_ERC8004_PARTNER_GUIDE.md` — authoritative on the pinning API and the canonical
  agent-atom recipe.

## Required rules

- `.claude/rules/code.md` — service purity, no `any`, no ambient env reads in services
- `.claude/rules/security.md` — no API keys in client code, fail loudly on missing env
- `.claude/rules/workflow.md`

## Deliverables

### Pin service

Rewrite `app/src/services/intuition-pin.ts`:

- Target `https://pin.intuition.systems/v1/graphql`. It is network-agnostic — one key serves testnet
  13579 and mainnet 1155. Do **not** derive it from `deployments.chain.graphqlUrl`; that field stays
  what it is, the read endpoint.
- Signature becomes `pinThing(args, auth: {apiKey: string; headerName?: string})`. The credential is
  an explicit parameter. No `process.env` read inside the service — that is what keeps the module
  pure and testable without an environment, and what makes a browser caller a type error rather than
  a runtime leak.
- `headerName` defaults to `"apikey"`.
- Throw a named, actionable error on 401 that names the env var and points at `bun run verify:pin`.
  A bare `pinThing HTTP 401` cost real debugging time already.

### Thread the credential

`ensureAtomForThing` (`intuition-graph.ts`) and `redeemEnsureAtomForThing` (`delegation-redeem.ts`)
take the auth object as a required parameter and pass it through. So does
`getOrCreateUsesPredicateAtomId`, and therefore `declareUsesTriple`.

Required, not optional. An optional parameter re-opens exactly the hole this task closes.

### Node entry points

Only these read `process.env.INTUITION_PIN_API_KEY`:

| File                            | Change                                                                     |
| ------------------------------- | -------------------------------------------------------------------------- |
| `scripts/seed.ts`               | delete its duplicate local `pinThing` (lines ~114-135), import the service |
| `scripts/agent-loop.ts`         | pass auth into `redeemEnsureAtomForThing` (~line 142)                      |
| `scripts/agent-stake-on-use.ts` | pass auth into `redeemEnsureAtomForThing` (~line 173)                      |

Add one shared helper — `scripts/pin-env.ts`, exporting `requirePinAuth()` — that reads the env,
throws a loud error naming the missing var, and returns `{apiKey, headerName}`. No silent fallback,
per `.claude/rules/security.md`.

### Tests

Three suites mock `pinThing` and change with the signature:

- `app/src/services/__tests__/intuition-pin.test.ts` — endpoint assertion moves to
  `pin.intuition.systems`; add coverage for the auth header being sent, for `headerName` override,
  and for the 401 error message.
- `app/src/services/__tests__/intuition-graph.test.ts`
- `app/src/services/__tests__/delegation-redeem.test.ts`

Per ADR 0011 the app test scope is services only — no page tests needed.

### Skill re-sync

Correct `.claude/skills/intuition/reference/graphql-queries.md` and `reference/schemas.md`: pin
mutations are no longer on the indexer endpoint. Per ADR 0005 the skill is a vendored snapshot, so
note the divergence and the date rather than silently rewriting it as if upstream had changed.

### Verification

`bun run verify:pin` must pass end to end, including step 4 (the determinism check). A MISMATCH there
blocks this task: it would mean ARP cannot derive canonical agent atoms, which invalidates the write
path for `docs/08` O2 and O3 before it is built.

Then re-run the demo: `bun scripts/seed.ts` and `bun scripts/agent-loop.ts` both complete.

## Out of scope (explicitly)

- **No serverless pin proxy.** Rejected in ADR 0016.
- **No new browser pin flow.** `RegisterModule.tsx` keeps taking a user-supplied `schemaURI`. If
  self-serve pinning is ever wanted, that is a separate product decision with its own ADR.
- **No mainnet writes.** This task restores testnet 13579 only. Mainnet needs explicit per-session
  confirmation per `CLAUDE.md`.
- **No work on `docs/08` O1-O7.** Those are read-side and separately scoped.
- **Do not move `ensureAtomForThing` out of `app/src/services/`.** Tempting — it is effectively
  Node-only now — but it is a layout refactor that touches every import path, and the explicit-auth
  parameter already closes the leak. If it still seems right afterwards, propose it as its own ADR.

## Acceptance criteria

- [ ] `bun run verify:pin` exits 0 with MATCH
- [ ] `bun scripts/seed.ts` completes against Intuition Testnet
- [ ] `bun scripts/agent-loop.ts` completes, including the two revert-path demonstrations
- [ ] `bun run test` green, `bun run lint` clean
- [ ] `grep -rn "VITE_INTUITION_PIN" app/` returns nothing
- [ ] No `process.env` read anywhere under `app/src/services/`
- [ ] `task-verifier` returns a pass
