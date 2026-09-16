# 0020 — A package-local Prettier config for `app/`

**Status:** Accepted
**Date:** 2026-09-16
**Triggered by:** `tasks/08-agent-trust-panel.md` acceptance criterion "`prettier --check` clean",
and the `task-verifier` note that adding a second config is a recorded decision.

## Context

The root `.prettierrc.json` says `singleQuote: true`, `tabWidth: 2`. Every TypeScript file in `app/`
is written double-quote, 4-space — including files that predate this branch by months. The two have
never agreed, so `prettier --check` over `app/` failed on **every** file it looked at and therefore
told nobody anything: a genuinely misformatted file and a perfectly consistent one produced the same
warning.

Task 08 carries "`prettier --check` clean" as an acceptance criterion. It was not achievable as
written — roughly 180 files fail repo-wide today and essentially all of them predate the task. The
instruction for this task was explicitly to match `app/`'s existing style and not to reformat files
the task did not otherwise touch, which rules out the obvious alternative of reformatting the tree to
the root config.

`erc8004/` hit the same wall in task 07 and solved it with a package-local `.prettierrc.json`
(4-space, double-quote, `bracketSpacing: false`). That package was greenfield, so every file
conformed and the check went green immediately.

## Decision

**`app/.prettierrc.json` records the style `app/` is actually written in** — the same settings
`erc8004/` uses. No existing file is reformatted. Prettier resolves configuration per file by walking
up from the file, so `app/` now checks against its own rules and the rest of the repo is unaffected.

The check is not green: 23 pre-existing files still fail, and they are left alone deliberately.
Clearing them is a chore of its own, not part of a feature branch.

## Alternatives considered

- **Reformat `app/` to the root config** (2-space, single-quote) — rejected. It would rewrite ~43
  files inside a feature branch, bury the actual change in whitespace, and the task instruction was
  the opposite.
- **Change the root config to 4-space double-quote** — rejected as out of scope here. It is the right
  end state if the repo wants one style, but it moves `contracts/`, `scripts/` and the docs tree too,
  and that is a decision about the whole repo rather than about `app/`.
- **Drop the acceptance criterion** — rejected. The criterion is reasonable; what was wrong was that
  nothing in the repo made it checkable.
- **Leave it and report the gap** — considered seriously, and rejected because it preserves a config
  that is a lie about the code it governs. Files failing the root config in `app/` went from 43 to 23
  by writing down what was already true.

## Consequences

**Positive:**

- `cd app && prettier --check src` is now a real signal: everything task 08 touched passes, and the
  23 that fail are a named, finite backlog rather than noise.
- New work in `app/` is formatted the way the surrounding code is, without a reviewer having to know
  that the root config is wrong about this directory.

**Negative:**

- Two Prettier configs in one repo, which is one more than anyone wants. The root config is now
  accurate about everything except `app/` and `erc8004/`, each of which overrides it.
- `prettier --check` at the repo root is still red. This ADR narrows the problem; it does not close
  it.

**Neutral (worth knowing):**

- The 23 remaining files are all pre-existing: `ModuleList`, `WalletConnect`, `Hire`, `HireResult`,
  `ToolDetail`, `AgentRegister`, `RegisterModule`, the older hooks, and six service files with their
  tests. A single `prettier --write app/src` clears them, and should be its own commit.

## References

- Related task: `tasks/08-agent-trust-panel.md`
- Related ADR: `.claude/choices/0019-erc8004-connector-surface-deviations.md` (the same problem, solved
  the same way, one task earlier)
- Related rule: `.claude/rules/workflow.md` (git hygiene; the recording protocol this ADR follows)
- Related files: `app/.prettierrc.json`, `erc8004/.prettierrc.json`, `.prettierrc.json`
