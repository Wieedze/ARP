# fix(pin): restore the Intuition write path, credential server-side only

**Branch** `feat/pin-writes-server-side` → `docs/strategy-and-positioning` · 5 commits · Phase 0 of `docs/09`.

Branches off the strategy PR; review that one first. Independent of the connector PR — the two are
siblings and can merge in either order.

---

## The problem

Every atom-minting path in this repo was dead, and had been for a while without anyone noticing.

Intuition removed `pinThing` from its indexer GraphQL endpoints and moved pinning behind a gated API. Measured directly:

```
POST https://testnet.intuition.sh/v1/graphql   -> {"errors":[{"message":"no mutations exist"}]}
POST https://mainnet.intuition.sh/v1/graphql   -> {"errors":[{"message":"no mutations exist"}]}
POST https://pin.intuition.systems/v1/graphql  -> 401 {"message":"No API key found in request"}
```

`app/src/services/intuition-pin.ts` still posted to `deployments.chain.graphqlUrl`, which is now read-only. So: seeding dead, the agent loop dead, stake-on-use dead, the `uses` predicate unmintable. The demo did not work.

## Why this is not a one-line endpoint swap

A partner API key cannot go into a Vite bundle — `VITE_`-prefixed variables ship to every visitor, and `.claude/rules/security.md` forbids it outright. And `scripts/` imports app services directly, so the same module is both the browser's pin path and the runtime's.

Blast radius was checked call site by call site rather than assumed. **No browser flow pins**: `RegisterModule.tsx` takes the `schemaURI` as typed user input, `ToolDetail.tsx` uses `ensureAtomForURI` (the explicitly non-pinning variant, per ADR 0008), `AgentRegister.tsx` never touches a pin path. So no UI regresses — but pin-capable code sat in `app/src/services/`, one import away from a future page wiring a key into client code.

## What changed

**`pinThing` takes its credential as an explicit required parameter**, not an ambient `process.env` read inside the service. That keeps services pure and testable without an environment, and makes a browser caller a type error rather than a leaked key. Threaded through `ensureAtomForThing`, `getOrCreateUsesPredicateAtomId`, `declareUsesTriple`, `redeemEnsureAtomForThing` — required, never optional, because an optional parameter re-opens exactly the hole this closes.

Only Node entry points read the env, via a new `scripts/pin-env.ts` that fails loudly with no fallback. `scripts/seed.ts` drops its duplicate implementation.

**`PinAuth` is nominal.** Review caught that the original claim — "makes a browser caller a compile-time error" — was false: a structural type means `pinThing(args, {apiKey: "x"})` compiles anywhere, and ADR 0016 asserted the same thing. Rather than soften the ADR, the type now carries an unexported `unique symbol`. Verified against the compiler, not asserted:

```
error TS2345: Argument of type '{ apiKey: string; }' is not assignable to parameter of type 'PinAuth'.
  Property '[pinAuthBrand]' is missing
```

The module comment states the real guarantee: the brand stops the accident, and makes any other production a greppable, commented assertion. No TypeScript brand stops someone determined to write `as unknown as`.

## How it was verified

Both scripts run for real on Intuition Testnet 13579. `seed.ts` pinned through the newly targeted gated endpoint and correctly skipped both on-chain writes as already-existing. `agent-loop.ts` on a two-entry manifest published a module, created the tool atom, declared the triple, and staked 0.001 tTRUST:

```
processing Slither (Crytic) (solidity-audit)
  published        0x181290e86c09921ccf5c04a7e81410e201ad0dfbcda2c716d1dcf2acba75f581
  tool atom        0x54e076aecd…  (created)
  declared triple  0x11d4ed663f819c147f5ebb0daf2113373c07ffb5ea9618e8d89b3a440e97224b
  staked           0.001 tTRUST  tx=0x87fce0291b5ed4317cceead17405b15772051adf5229a7dc20169b0ea1a7eac2

processing DefiLlama API (defi-strategy)
  domain rejected  defi-strategy  (DomainNotAllowed)
```

That run exercised `agent-loop.ts:149` — the one new live call, pinning through the gated endpoint — which an empty-key run can never reach.

App tests 56/56, eslint clean, `tsc -b` clean, `grep "process.env" app/src/services/` empty, `grep "VITE_INTUITION_PIN" app/` empty.

## One acceptance criterion is not met, and is not marked green

**`StakeExceedsCap` did not fire.** `DomainNotAllowed` did. The compose delegation's cap is 0.1 tTRUST per hour and the Smart Account funding the stakes holds 0.013 — you cannot exceed a cap you cannot reach. Exercising it needs ~0.09 more tTRUST in `0xf11EA875389d88ED3ac7a8962Cc91164e606c2c4`, or a fresh delegation signed with a smaller cap.

Nothing in this task touched that path, and funds were not moved between wallets to manufacture a pass. The real reason is written into the task file.

## Review

Two-axis review (Standards + Spec, parallel, findings kept separate). Spec: faithful, zero scope creep. Standards: security invariants hold, tests strengthened rather than weakened, no secret printed or fixtured. Six findings raised and closed, including the branding above.

One judgement call deliberately **not** acted on and logged instead: `{walletClient, publicClient, pinAuth}` now travel together through four signatures in `intuition-graph.ts`, wanting an `IntuitionWriteContext`. That is a refactor task 06 did not ask for. It is in the post-mortem.

## Also in here

The vendored `intuition` skill claimed the indexer endpoint supports pin mutations. Per ADR 0005 it is a snapshot, so the divergence is noted with its date rather than rewritten as though upstream had changed.

## Which tier of the evidence ladder does this serve?

None directly — it unblocks every tier above 2. Without a working write path, neither the capability layer nor the trust-provider shell can be written at all.
