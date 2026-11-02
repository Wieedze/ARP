# 38 — Plain words: the operator does not read the chain's vocabulary (47)

**Task:** `docs/tasks/47-plain-words.md`
**Completed:** 2026-11-02
**Commit:** uncommitted, worktree `ARP-plain-words`, branch `feat/47-plain-words` (on `feat/36-chain-facts`)
**Verifier verdict:** PASS (first pass; ui-reviewer FAIL round 1, PASS round 2)

## What shipped

- `apps/web/src`: visible copy across pages, components, display services, error messages and activity-bar tx labels follows ADR `0103`. Atom, triple, vault, shares and minimum-shares figures sit in a collapsed "Verify" `<details>` (StakeControl, DeclareUse, AgentImport, ToolRegister, RepoPage, SkillPage, AtomPanel) or a `Hint`. The enforcer address on `/account` became a "contract ↗" explorer link.
- `apps/mcp/src`: tool and parameter descriptions, server instructions, notes, warnings, `session-log` and `fetch-skill` output.
- `packages/protocol/src`: `why:` strings on prepared calls.
- `.claude/choices/0103-the-operator-reads-plain-words.md`: the user's glossary, the four later rows, the shares row, the exceptions.
- Tests asserting visible text updated (web 687 pass / 2 skipped, protocol 820 pass / 4 skipped, mcp 37 pass; re-run by the verifier).

## Surprises

- The first glossary was silent on four words (curve as a control, predicate, off chain, the `supports-protocol` group). Its own rewrite created a collision: "Supports" had to become "Protocols" once "support" meant money behind something.
- A `Hint` inside a link is invalid HTML, so the `/agents` row's curve count was dropped rather than hidden. An address inside a `Hint` cannot be copied, so the enforcer went behind a link.
- ui-reviewer round 1 found three meaning errors, where a substituted word said something false, not just a missed string. A word swap can change what a sentence claims.
- The CLI and the node needed no change. The node's API errors are machine-facing (ADR exception) and the CLI carries none of the glossary's words in visible strings.

## Decisions made

- **Glossary, exceptions, shares row**: user's, term by term. ADR: `.claude/choices/0103-the-operator-reads-plain-words.md`.
- **Comments touched only where the old label would misdescribe the code** (e.g. the "Most claims" table in tool-catalog, the "Supports" rationale). That is not a rewrite: `code.md` forbids comments that misdescribe state.

## Rules touched

- `ui.md` (Copy): sufficient. ADR `0103` adds a vocabulary but changes no rule.
- `claims.md`: no new figures written. The curve measurements in the MCP descriptions predate the task.
- `code.md`: sufficient. No identifier, route, JSON field or tool name renamed (checked in the diff).

## Suggestions for future tasks

- Any vocabulary sweep: grep the replacement word for collisions with existing labels before writing the glossary.
- Review each substitution for meaning, not just for coverage. Round 1's three errors were all of that kind.
- `apps/mcp/test/server.test.ts`, `packages/protocol/src/declare/identity-plan.ts`, `reachability-plan.ts` are unformatted at HEAD. Format them in a chore commit before the next task touches them, so the diff stays copy-only.

Evidence ladder: serves no tier on its own. It makes the staked tier (TRUST behind a declaration) readable to an operator who does not know the chain's words, and does not move ARP up the ladder.
