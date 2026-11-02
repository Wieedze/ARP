# 49 — The Claude Code demo: a fetched skill the runtime can invoke, paid by the sponsor

**Task:** `docs/tasks/55-claude-code-demo.md`
**Completed:** 2026-11-02
**Commit:** `29b10c9` (branch `feat/55-claude-code-demo`, on top of `ec54749`, `2324b66`, `5ddf73a`)
**Verifier verdict:** PASS (second pass; the first failed on four stale sites)

## What shipped

- `apps/cli/src/install/{targets,commands}.ts`, `cli.ts`: `arp init --sponsored` writes `SPONSORED_ENV` (`ARP_TARGET=testnet`, `ARP_TOOLS=sponsored`, `ARP_SKILLS_DIR=.claude/skills`).
- `apps/mcp/src/config.ts`: `sponsored` is the same mode as `desktop`; `SKILLS_DIR`.
- `apps/mcp/src/desktop/loop.ts`: `getSkill` installs `<skillsDir>/<name>/SKILL.md` when the name matches `/^[a-z0-9][a-z0-9._-]*$/i`, and appends the receipt line to the project's `.arp/receipts.jsonl`, the file the hook's `fetchedRefs` reads.
- `apps/mcp/src/desktop/handlers.ts`: `installed_at` in the `arp_get_skill` answer.
- Tests: `apps/cli/test/install.test.ts`, `apps/mcp/test/desktop.test.ts`.
- `docs/26_DEMO_PLAN.md` §4 rewritten to ready, with the script; `docs/22` env block gains `ARP_TOOLS`, `ARP_SKILLS_DIR`, `ARP_CONTENT`, `ARP_SPONSOR`.
- `packaging/` regenerated (stale on `dev` after `ee11cb0`).

## Surprises

- The first live run had the hook log the skill with `ref: null`: the receipt was only in `~/.arp/`, and the hook reads the project's file. A unit test could not have caught that. Only the live run did, because the two paths were each correct in isolation.
- Claude Code does not see a skill written to `.claude/skills/` until the next session. The demo has two sessions because of this (measured with 2.1.316).
- Session 2 fetched the skill again before declaring, so the run has three receipts and the declaration's proof was probably the second.

## Decisions made

- **Hook record stays local (option A)** — user decision 2026-11-02; nothing publishes it, and the sponsor is unchanged.
- **`sponsored` is an alias of `desktop`, not a new mode** — one code path, a name that reads right in Claude Code. No new ADR; extends ADR `0110`.

## Rules touched

- `.claude/rules/claims.md` — sufficient; check 5 caught the misses. Four comments still said "Desktop only" or "no other mode holds a key" after the mode was widened. One was a statement about who holds a key.
- `.claude/rules/security.md` — sufficient. The traversal check holds: no slash, and the first character must be alphanumeric. Overwrite and symlink-following are recorded as known limits.

## Suggestions for future tasks

- When a mode or flag is widened, grep its old value (`ARP_TOOLS=desktop`) across comments and `docs/22` in the same commit. `docs/22` claims to list every env var, so a new one belongs there in the feature commit.
- Keep `claude -p` result lines from a live run next to the session logs. The costs in §3b could not be re-derived.
- `CLAUDE.md:167` still describes only the Desktop build as holding the key. That is true but incomplete, and worth widening on the next router edit.
