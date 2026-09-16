# Task 06 — Restore the Intuition write path, server-side only

> **Status: COMPLETE** (2026-09-16, commits `1e9b92b`, `f482588`, `4bf5d37`).
> Post-mortem: `.claude/learning/08-pin-writes-server-side.md`. Verifier: PASS.
>
> Not a hackathon task. No narrative-preservation answer required.

## Acceptance criteria — evidence

Criterion 4 caveat: root `bun run test` and `contracts` lint fail for reasons that
predate this task and are unrelated to it (the `sdk` workspace declares a `test`
script and contains zero test files; `solhint` is not installed). `@arp/app`
eslint, `@arp-protocol/sdk` tsc, `bunx tsc -b`, app tests (7 files / 56 tests) and
contracts tests (71) are all green. See the post-mortem.

### `bun run verify:pin` — exit 0, MATCH

```
[1/4] Key present: len=64 fp=c6a…75 header=apikey

[2/4] Probing pinning endpoint WITHOUT the key (expect 401)…
  http=401 OK — endpoint is gated as expected

[3/4] Probing WITH the key (expect 200)…
  http=200 OK — key accepted

[4/4] Determinism check against agent 8453:6649…
  planned thing: {"name":"Agent 8453:6649","description":"ERC-8004 agent 8453:6649","image":"","url":"https://8004scan.io/agents/8453/6649"}
  returned: ipfs://bafkreif6xwptjdsux2iwnhdbxyjom23bzzimhk62y574rreexdghi6hlbq
  on chain: ipfs://bafkreif6xwptjdsux2iwnhdbxyjom23bzzimhk62y574rreexdghi6hlbq   (label: Agent 8453:6649)

MATCH — the canonical agent-atom recipe is reproducible.
```

### `bun scripts/seed.ts` — exit 0, Intuition Testnet 13579

Idempotent path: the pin went through the newly targeted gated endpoint, and both
on-chain writes were correctly skipped because the module and atom already exist.
Deployer balance unchanged at `0.018641588743` tTRUST.

```
Deployer:         0xE596096F4176b682E300d73963e7B04B383C1AA1
ModuleRegistry:   0xc9a2f66775828017e984E8be077fA2d17e0A41F4
Intuition vault:  0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91

[1/3] Pinning Thing on Intuition…
  uri:            ipfs://bafkreiembmtprqzufrdkvig74lskv6iazuatblm4hwmtxkf5a3v67mkdkm

[2/3] Registering module on ModuleRegistry…
  domain 'solidity-audit' already has id 1 (creator 0xf11EA875389d88ED3ac7a8962Cc91164e606c2c4); skipping registration

[3/3] Creating Intuition atom for the module…
  atom already exists (id 0xde8890fca8dde322ca57bce0e20dfeb23be67332f9101305ebe72facdee032dc); skipping createAtoms

Deployments updated: /home/max/Project/ARP/deployments/13579.json
```

### `MANIFEST_PATH=… bun scripts/agent-loop.ts` — exit 0, Intuition Testnet 13579

Run against a two-entry manifest rather than the full 14, because funds are thin:
one in-scope entry for the happy path, one out-of-scope entry for the
`DomainNotAllowed` revert demo. The `uses` predicate line is the one new live call
this task introduced — `redeemEnsureAtomForThing` with `pinAuth` at
`agent-loop.ts:149` — and it pins through `pin.intuition.systems`.

```
agent runtime starting
  runtime address  0x906f3A52ec089f8D4E9127F91C6bE5Ae0d18f91f
  delegator (SA)   0xf11EA875389d88ED3ac7a8962Cc91164e606c2c4
  balance          0.0947809272 tTRUST
  manifest         2 entries from …/manifest-task06.json

ensuring agent self-atom
  agent atom       0x140ba760c0… (reused)
  uses predicate   0x3707e587ad…

processing Slither (Crytic) (solidity-audit)
  published        0x181290e86c09921ccf5c04a7e81410e201ad0dfbcda2c716d1dcf2acba75f581
  tool atom        0x54e076aecd…  (created)
  declared triple  0x11d4ed663f819c147f5ebb0daf2113373c07ffb5ea9618e8d89b3a440e97224b
  staked           0.001 tTRUST  tx=0x87fce0291b5ed4317cceead17405b15772051adf5229a7dc20169b0ea1a7eac2
  vault            tvl=0.000980000001 tTRUST shares=980000001000000

processing DefiLlama API (defi-strategy)
  domain rejected  defi-strategy  (DomainNotAllowed)

done. published=1 composed=1 domainRejects=1
```

Cost: runtime EOA `0.094780927200` → `0.094561711800` tTRUST (gas only, 0.000219);
Smart Account `0.012999999939` → `0.009999999936` tTRUST (atom + triple + stake).

**One revert demo of the two was reached, and this is honest rather than hedged.**
`DomainNotAllowed` fired as shown. `StakeExceedsCap` did **not**: the compose
delegation's `TrustStakeCapEnforcer` terms are `cap = 0.1 tTRUST` over a
`3600 s` period, and the Smart Account that funds the stakes holds `0.013` tTRUST,
so the cap cannot be accrued to at current funding. Exercising it needs either
~0.1 tTRUST in the Smart Account or a fresh delegation signed with a smaller cap.
Nothing in this task changed that code path.

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
