# Task 21 — `scripts/` is outside every gate

> **Status: COMPLETE** 2026-10-27. `tsconfig.scripts.json` is committed and wired as
> `bun run check:scripts`. **93 → 0.**

## The measured number, and what it found

The task said not to inherit 6 or 24, because two ad-hoc configs disagreed. The committed config
reported **93**, and the breakdown is the useful part:

| class            | count | what it was                                                                                                                                                                                                                                            |
| ---------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TS1375 + TS2451  | 41    | **config artefact.** Eight scripts have no import or export, so TS treated every top-level `const` in them as sharing one global scope — `URL_`, `USES`, `gql` colliding across files. `export {}` makes them modules, which Bun already runs them as. |
| TS18046 + TS2339 | ~38   | untyped reads at the wire. `Response.json()` is `unknown` under `strict`, correctly.                                                                                                                                                                   |
| TS2307           | 4     | **four dead scripts** — see below                                                                                                                                                                                                                      |
| TS7006           | 4     | implicit `any` parameters                                                                                                                                                                                                                              |
| TS6133           | 1     | a dead constant, `PAGE` in `staker-concentration.ts`                                                                                                                                                                                                   |
| the rest         | 5     | type mismatches at the viem and Bun seams                                                                                                                                                                                                              |

### Two real defects, neither of which any review had found

**`scripts/measure/erc8004-population.ts` never existed.** Five scripts imported
`./erc8004-population.js`; git has no record of the file, deleted or otherwise. So
`cohort-callable`, `cohort-endpoints`, `cohort-onchain-activity` and `cohort-skills` **threw on
import** and had been dead for their whole life. Confirmed by running one. The module is written
now, lifted from the private copy `cohort-coverage.ts` had kept — and verified against the chain:
highest minted id on Base **1,138,237**, consistent with the 1,137,885 that
`canonical-registry.ts` got from a `register()` simulation minutes earlier.

**`tool-page-states.ts` built its accumulator without `opposePositions`.** The default literal
omitted the field, so the first edge on any tool did `undefined + n` and every count after it was
`NaN`. The comment two lines below it explains why the opposition half matters. The object that had
to hold it did not.

## The boundary question the task said to resolve first

`import.meta.env` turned out not to be the problem: only four scripts import from `app/src`, and
none of them reaches `chains.ts`. The config needs no Vite ambient types — `"types": ["bun"]` and
`@types/bun`, added at the root, is the whole of it.

## One package change, and it is a fix rather than an accommodation

`ProbeOptions.fetch` was `typeof globalThis.fetch`. Under Bun's lib types that global is an
**object** carrying `preconnect`, so a counting or caching wrapper — the only reason anyone injects
a fetch — cannot satisfy it. `verify-cohort.ts` has exactly such a wrapper and was the thing that
could not typecheck. It is `FetchLike` now, which the package has had all along for this, and which
is all the prober uses.

## Also recorded here

- **`app/vitest.config.ts`** is still in neither tsconfig project. Measured at zero cost during task
  18; left for a config task rather than folded in here, because this one is already large.
- **`bun run format:check`** still fails repo-wide and is still not a gate. Unchanged.
- **A root eslint config** is out of scope, as the task predicted: it would surface findings across
  `contracts/` and `packages/protocol/` too, and that is its own task.
- **`scripts/seed.ts` no longer exists**, so item 3 of the Do list is moot.

## The finding

Twenty files in `scripts/` are checked by **nothing**:

- `app/tsconfig.app.json` includes only `src`, and `tsconfig.node.json` only `vite.config.ts`. So
  `tsc -b` covers 83 files and no part of `scripts/`.
- There is no eslint config at the repo root. `eslint .` run from `app/` never sees `scripts/`.
- `bun build` strips types without checking unused locals, so bundling a script proves it resolves
  and parses, nothing more.

This is not theoretical. It already cost something twice in one day:

1. A `pinAuth` variable left assigned-and-never-read in `scripts/agent-loop.ts` and
   `scripts/agent-stake-on-use.ts`, which also left both scripts hard-throwing for a credential they
   no longer used — so nobody could run the path a fix had just repaired. Found by review, not by a
   gate. `noUnusedLocals` is already `true` in both app tsconfigs and would have caught it.
2. **A dead import that is live right now**: `scripts/seed.ts:34` imports `decodeEventLog` and never
   uses it. Verified directly — one occurrence in the file, and it is the import. `code.md` forbids
   unused imports.

## Why it is not a one-line fix

Task 18 was safe to do inline because the measured cost was zero. **This is not.** Two independent
ad-hoc configurations disagreed on the count — 24 diagnostics and 6 — because they resolved Bun
types and module paths differently. Neither is a committed gate, so **neither number should be
inherited**. `.claude/rules/claims.md`: commit the script, not the number.

Known shapes, from both runs:

- implicit `any` parameters in `agent-server.ts`, `agent-server-specialist.ts`, `demo.ts`,
  `measure/cohort-callable.ts`, `measure/cohort-endpoints.ts`
- type mismatches at the viem / delegation seam, including `Delegation.salt` typed `` `0x${string}` ``
  against `bigint`
- missing Bun types — `@types/bun` is installed nowhere in the repo
- `import.meta.env` unavailable, because `scripts/` imports `app/src/lib/chains.ts` which uses it

The `import.meta.env` one is the interesting one: it means `scripts/` and `app/src` cannot share one
tsconfig without the scripts inheriting Vite's ambient types. Decide the boundary before writing the
config.

## Do

1. Write `tsconfig.scripts.json`, committed, with `strict`, `noUnusedLocals` and `noUnusedParameters`
   on. Resolve the `import.meta.env` boundary first.
2. **Measure with it and record the number**, then fix what it reports. Do not quote 6 or 24.
3. Fix `scripts/seed.ts:34` either way — it is a confirmed dead import and needs no gate to justify.
4. Wire it into a repo-level check so this cannot regress, and say in the task where that check runs.
5. Decide whether a root eslint config is in scope or a separate task. It is likely separate: a root
   config will surface findings across `contracts/` and `packages/protocol/` too.

## Also recorded here, same shape, different file

- **`app/vitest.config.ts` is in neither tsconfig project.** `tsconfig.node.json`'s `include` is
  `["vite.config.ts"]` only. Measured during task 18's verification: adding it costs **zero errors**
  with `strict` on. Cheap, and it belongs with this task rather than in a config-flag task.
- **`bun run format:check` fails on 190 files** and has for a long time, so it is not functioning as
  a gate. Cause is known: `app/.prettierrc.json` sets `tabWidth: 4` (ADR `0020`) while the
  Vite-generated tsconfigs are 2-space. Any report citing `format:check` green would be making
  `claims.md` check 4. Either fix the 190 or stop citing it; a gate that always fails is noise.

## Do not do in this task

- Do not relax a flag to make the count smaller. If `strict` is genuinely wrong for a script, say so
  in the task and record why.
- Do not refactor `scripts/` beyond what the diagnostics require.
- Do not enable `recommendedTypeChecked` — that is still the separate proposal from `tasks/18`.

## Which tier of the evidence ladder does this serve?

None directly. Like task 18 it repairs the evidence _about_ the code — and it is the half task 18 did
not reach, so until it lands, "typecheck clean" in a completion report means `app/src` and nothing
else.
