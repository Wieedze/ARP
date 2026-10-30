# Task 18 — `strict` is off in the app, and has been since the first commit

> **Status: COMPLETE** 2026-10-16 · commit `6b351ee` · post-mortem
> `.claude/learning/15-strict-is-off-in-the-app.md` · `task-verifier` PASS.
> Measured cost was indeed zero errors. Both `tsconfig.app.json` and `tsconfig.node.json` got the
> flag. **The `scripts/` gate gap is NOT closed by this** — it is not zero-cost and now has its own
> task, `docs/tasks/21`.

## The finding

`.claude/rules/code.md` says:

> `strict: true` in `tsconfig.json`. **Non-negotiable.**

`app/tsconfig.app.json` has never set it. It is absent from `0c40a60`, the first commit, through today.
`erc8004/tsconfig.json:7` does set it, so the two workspaces have been typechecked under different
rules the whole time.

The file enables `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly` and
`noFallthroughCasesInSwitch` — which reads as a considered "Linting" block and is probably why nobody
noticed the one flag that was missing. Without `strict`, `strictNullChecks` and `noImplicitAny` are
both off, so **every `tsc -b` pass recorded in a completion report since task 01 is weaker evidence
than the rule it was cited against.**

## Measured cost: nothing

Enabling it and typechecking the app:

```
bunx tsc -p tsconfig.app.json --noEmit   →   0 errors
```

The app code is already strict-clean. The flag is a declaration of what the code already does, not a
migration. That is the whole reason this is worth doing now rather than scheduling.

## Do

1. Add `"strict": true` to `app/tsconfig.app.json`, in the `/* Linting */` block beside the four flags
   already there.
2. Re-run `bunx tsc -b`, `bun run lint`, `bun run test`. All three were green with the flag on when
   this was measured.
3. Check `app/tsconfig.node.json` for the same omission.

## Also worth deciding, separately

`app/eslint.config.js:14` uses `tseslint.configs.recommended`, not `recommendedTypeChecked`. The
type-aware rules — `no-unsafe-assignment`, `no-floating-promises`, `no-misused-promises` — are
therefore not running. `code.md` does not require them, so this is a proposal rather than a
violation, and it is **not** zero-cost: it needs `parserOptions.project` wired up and will surface
real findings. Keep it out of step 1 so that the one-line fix stays one line.

## Do not do in this task

- Do not touch application code. If `strict` ever does surface an error, stop and report it rather
  than refactoring to satisfy the flag.
- Do not enable `recommendedTypeChecked` in the same change.

## Which tier of the evidence ladder does this serve?

None directly. It repairs the evidence _about_ the code: it makes "typecheck clean" mean what every
completion report since task 01 has implied it meant.
