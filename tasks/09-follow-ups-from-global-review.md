# Task 09 — Follow-ups the global review surfaced

> **Status: NOT STARTED** (specified 2026-09-16).
>
> None of these blocks the four branches from merging. They were found by the cross-branch review and
> a duplication scan after each branch had already passed its own review — which is exactly the class
> of problem per-branch review cannot see.

## Why this file exists

Four branches were built by separate agents that could not see each other. Each passed a two-axis
review against its own spec. The contradictions below only exist _between_ them, or were pre-existing
and only became visible once the pieces sat side by side.

Recorded rather than fixed, because fixing them at the end of a long session — without the operator
present, on branches that are green — trades a known-good state for an unreviewed one.

## Priority 1 — the curve id, and it touches real money

`erc8004/src/sources/intuition/queries.ts:15` hardcodes `vaults(where: {curve_id: {_eq: "1"}})` in the
`MARKET_SIDE` fragment, interpolated for both `term` and `counter_term`. Every market number the panel
displays is therefore curve-1-only, with no comment acknowledging the assumption and no way to
configure it — `IntuitionSourceConfig` exposes `graphqlUrl`, `fetch`, `timeoutMs`, `transport`, and no
curve.

Meanwhile every write path reads it from the chain, deliberately: `trust-stake.ts:175` carries the
comment _"getBondingCurveConfig() and getGeneralConfig() — queried, never hardcoded"_, and
`use-stake-session.ts:11-13` says _"the curve is 1 on mainnet today and that is not a guarantee"_.

**The failure:** in one `AssessmentRow`, the market cap and position count come from the curve-1
GraphQL filter while the vault totals and the deposit itself use `session.curveId` read live. If
`defaultCurveId` is ever not 1 — a governance change, or pointing the source at testnet — the panel
shows one curve's market next to a deposit into another curve's vault, silently. The app's own tests
already exercise curve ids `3n`, `5n` and `7n`, so the app treats it as variable while the connector
does not.

**Fix:** surface the curve on `IntuitionSourceConfig`, default 1, and have the app pass the value it
read from `getBondingCurveConfig()`.

## Priority 2 — ARP mints a third `uses` predicate the connector cannot read

`app/src/services/intuition-graph.ts:152-170` pins a Thing named `"uses"` with an ARP-specific
description and caches the resulting atom id. Because atom ids are content-deterministic over the
pinned URI, that id is neither `USE` (`terms.ts:37`) nor `USES` (`terms.ts:86`).

So ARP writes `(agent, uses, tool)` on a predicate that the connector's `CAPABILITY_PREDICATE_IDS`
will never match. One half of the codebase writes edges the other half cannot see.

`docs/07` warns about exactly this: _"do not mint your own copies — a differently-pinned duplicate is
a different node and fragments the staking surface."_ This predates today's work and contradicts
ADR 0015, which forbids label resolution and fixes the canonical ids.

**Fix:** use the published constant. Migrating existing triples is a separate question — they are
permanent.

## Priority 3 — `has tag` has no testnet constant

`terms.ts:43` notes the mainnet atom differs from the testnet one, but only the mainnet value exists.
`INTUITION_TESTNET_GRAPHQL` is an exported, supported configuration, so pointing the connector at
testnet returns **zero `has tag` capabilities, silently**. The testnet value is published in `docs/07`
Appendix B.

## Priority 4 — four TRUST formatters, three behaviours

`trust-format.ts:25` is the considered one: 8-dp cap, trailing-zero trim, a `<0.00000001` dust floor,
negatives handled. The other three have none of that:
`ModuleList.tsx:218`, `Hire.tsx:330` (a byte-identical private copy of the same helper, same name),
and `trust-stake.ts:128` `formatWeiPlain`.

**Visible today:** `formatWeiPlain` renders the user-facing validation messages at
`trust-stake.ts:114` and `:121`, while the row above goes through `formatTrust` — so the same
`minDeposit` can show 18 decimals in the error and 8 in the row.

## Priority 5 — vault metrics implemented twice

`app/src/hooks/use-vault-metrics.ts:55-177` and `sdk/src/modules.ts:151-200` are the same four-step
algorithm — curve config, `calculateAtomId`, `getVault` per atom, one filtered `getLogs`, dedup on
`receiver` — down to paraphrased rationale comments. The app already depends on the sdk and already
delegates to it for agents and reputation. The `Deposited` event signature is declared three times.

## Lower

- `sdk/src/client.ts:74-76` hardcodes three addresses `deployments/13579.json` already owns, with a
  comment telling the reader to hand-update them.
- The testnet chain is defined three times (`app/src/lib/chains.ts:14`, `sdk/src/client.ts:16`,
  `scripts/seed.ts:152`) with differing completeness — `seed.ts`'s copy omits `blockExplorers` and
  `testnet: true`. `app/src/lib/intuition-mainnet.ts` already imports its chain from the sdk; its
  sibling does not.
- `INTUITION_MAINNET_CHAIN_ID` and `INTUITION_MAINNET_EXPLORER` restate fields on the chain object
  re-exported two lines above them.
- `.env.example:57` `VITE_INTUITION_TESTNET_GRAPHQL` is read by nothing.
- `erc8004/README.md` headlines `entry.market?.support.totalAssets` as its example field. That is the
  _term_-level total and runs ~1,000× the vault balance; `MarketPanel.tsx` deliberately avoids it and
  reads `getVault` instead. The connector's README teaches integrators the number its own app rejects.
- `erc8004/package.json` points `exports` at `./dist`, which is gitignored, so `app` will not build on
  a clean clone until `erc8004` is built. No path alias to `erc8004/src`.

## Out of scope

Anything requiring a migration of already-written triples. They are permanent, and rewriting history
on the graph is not possible — decide what to do about Priority 2's existing edges separately.
