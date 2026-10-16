# 15 — `strict` is off in the app

**Task:** `tasks/18-strict-is-off-in-the-app.md`
**Completed:** 2026-10-16
**Commit:** `6b351ee` on `feat/agent-panel-tabs`
**Verifier verdict:** PASS — `task-verifier` first pass. `ui-reviewer` deliberately not run; see
"Decisions made".

## What shipped

- `app/tsconfig.app.json:19` — `"strict": true` in the `/* Linting */` block.
- `app/tsconfig.node.json:18` — the same, same block. It had the same omission the task told step 3
  to look for.

Nothing else. Two insertions, two files, zero code. Re-measured at `6b351ee`: `tsc -b --force` exit 0,
`eslint .` exit 0, 205 passed / 2 skipped across 15 files, `tsc -b && vite build` exit 0.

The flag now covers **83 files** — 82 `.ts`/`.tsx` under `app/src`, plus `app/vite.config.ts`, the
only entry in the node project's `include`. Counted with `bunx tsc -p <project> --listFiles`.

## Surprises

**The two changed files are not inputs to either gate the commit cites.** eslint's `files` is
`**/*.{ts,tsx}`, so JSON is never linted; `tsc -b` _consumes_ a tsconfig rather than checking it. The
honest check-4 sentence is not "the checks pass over the changed files" — it is that the changed files
_configure_ the gate, and the evidence is that the gate still passes over its 83 inputs with the flag
on. Worth stating because the natural phrasing is wrong in a way that reads right.

**"Fourteen post-mortems cite a clean typecheck" is false.** Measured over
`.claude/learning/0*.md 1*.md` for `tsc|typecheck|type-check|type check`: **3 of 15** cite one as (this file is the fifteenth, and its own hits are the finding, not a claim)
evidence of their own work — `01-project-setup.md:18`, `05-smart-account-integration.md:29`,
`08-pin-writes-server-side.md:21`. `14-strip-the-panel-copy.md` mentions it only to record this
finding. 14 is the number of post-mortems that exist, not the number making the claim — `claims.md`
check 2 exactly. The task's own wording was about _completion reports_, which are chat messages and
not measurable from the repo at all; the measurable population is the 3.

**The `scripts/` gap is live, not latent.** All 20 files in `scripts/` under `strict` +
`noUnusedLocals` + `noUnusedParameters` produce 24 diagnostics. Genuine ones: `scripts/seed.ts:34`
`decodeEventLog` declared and never read (TS6133 — a dead import _today_, not the historical one the
commit message describes), and five implicit-`any` parameters (`agent-server.ts:142`,
`agent-server-specialist.ts:93`, `demo.ts:53`, `measure-cohort-callable.ts:40`,
`measure-cohort-endpoints.ts:31`). Six more are type mismatches at the viem/delegation seam needing
triage (`agent-server.ts:210,211,287,307`, `agent-server-specialist.ts:210,211` — including
`Delegation.salt` typed `` `0x${string}` `` against `bigint`). The rest are missing Bun types:
`@types/bun` is installed nowhere in the repo. So widening the gate is **not** zero-cost, which is
the thing that made task 18 safe to do inline and the reason it was right not to bundle.

**`app/vitest.config.ts` is in neither tsconfig project.** `tsconfig.node.json` includes only
`vite.config.ts`. Measured: adding `vitest.config.ts` to that `include` costs **zero errors** under
the node project's options with `strict` on. A different omission from the one the task named, same
shape, same price.

**`bun run format:check` fails on 190 files** at this commit, `app/tsconfig.app.json`,
`app/tsconfig.json` and `app/tsconfig.node.json` among them. Pre-existing: the parent versions of both
changed files also fail at their real paths (`prettier --check --stdin-filepath`), and
`app/tsconfig.json` — untouched here — fails too. Cause: `app/.prettierrc.json` (ADR 0020) sets
`tabWidth: 4` while the Vite-generated tsconfigs are 2-space. The added line correctly matches the
file, not the config. The commit message never claimed format clean, which was right.

## Decisions made

- **No ADR.** `workflow.md` requires one for a non-obvious decision or a rule _change_. This is
  compliance with `code.md`'s existing non-negotiable requirement — workflow.md's own "bug fixes where
  the right answer was obvious" exclusion. The consequence for the record lives in four places without
  one: the commit message, `learning/14:77-82`, `STATE.md`'s known-defects table, and this entry. An
  ADR records a decision; it is the wrong instrument for a correction to past evidence.
- **`ui-reviewer` not run, and correctly so — on the agent's own spec, not on judgement.**
  `.claude/agents/ui-reviewer.md` takes "the paths to changed UI files" as input and its steps 1–5 all
  operate on changed components and pages; that set is empty here. Step 6 is typecheck + lint, which
  ran. Both files set `"noEmit": true`, so `tsc` emits nothing and the flag cannot change a byte of
  the bundle — there is no rendered surface for a design review to see. Precedent is not overturned:
  the held `ui-reviewer` gates in `learning/11` and `learning/13` were real UI changes.
- **`scripts/` left alone.** Recorded at `tasks/19-the-use-edge-and-its-witness.md:35` as "worth its
  own change — related to `tasks/18`, wider than it", and in `STATE.md`'s defect table. Measured above
  as not zero-cost. Widening would have been the "while we're at it" drift signal firing on a
  one-line commit.

## Rules touched

- `.claude/rules/code.md` — **now satisfied in `app/`**, for the first time since `0c40a60`. Verified
  absent from every prior revision: `git log -S'"strict": true' -- app/tsconfig.app.json
app/tsconfig.node.json` returns only `6b351ee`.
- `.claude/rules/claims.md` — **sufficient, and it earned its keep on first use.** Check 2 caught the
  "fourteen post-mortems" figure; check 4 caught that neither cited gate takes the changed files as
  input; check 1 caught a defect described as historical while one instance is current.
- `.claude/rules/workflow.md` — sufficient. Its scope discipline is what kept `scripts/` and
  `recommendedTypeChecked` out of a two-line commit, for the second task running.
- `.claude/agents/ui-reviewer.md` — **wrong, step 6.** It runs `bun run typecheck`, and no `typecheck`
  script exists in `app/package.json` or the root. The one step that would have applied here cannot
  run as written. Needs either a `typecheck` script or `bunx tsc -b` in the step.

## Suggestions for future tasks

- **The `scripts/` gate gap has no owning task.** `STATE.md` points at task 19, where it appears only
  inside step 1's "why the gates missed that" note; steps 2–5 do not include it. It needs its own task
  file, and that task must commit a `tsconfig.scripts.json` and re-measure rather than inherit task
  18's "zero errors" — the 24 diagnostics above say it will not be zero. Start by adding `@types/bun`.
- **`app/vitest.config.ts` into `tsconfig.node.json`'s `include`** — one line, measured at zero errors.
- **Decide `format:check`**: a gate failing on 190 files is not a gate. Either run `bun run format`
  once repo-wide, or narrow the glob so what it checks is what it enforces.
- When citing a gate, name its scope in the same sentence. "tsc clean over `app/src` + `vite.config.ts`;
  `scripts/` and `vitest.config.ts` are outside it" costs eight words and cannot be misread.

## Which tier of the evidence ladder does this serve?

None directly — `docs/09_POSITIONING_AND_PLAN.md` §3 ranks claims about the world, and this is a claim
about the repo. It repairs the evidence _about_ the code: "typecheck clean" now means over 83 files
what every report since task 01 implied it meant, and the measured scope of what it still does not
cover is written down rather than assumed.
