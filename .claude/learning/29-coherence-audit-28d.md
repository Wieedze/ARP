# 29 — Coherence audit, entry 43: `/agent` step 5 pointed at a deleted script

**Task:** `docs/tasks/28-coherence-audit.md` (entry 43)
**Completed:** 2026-10-30
**Commit:** `b012c6d` (fix), `260a8f7` (entry's check corrected), branch `fix/28-dead-script-reference`
**Verifier verdict:** PASS (second pass; the first draft's check did not print what the entry said)

## What shipped

- `apps/web/src/pages/AgentRegister.tsx` — the "or run `bun scripts/agent-approve-sa.ts`" copy is removed; the step-5 docstring no longer names the script.
- `apps/web/src/services/delegation-redeem.ts` — four comment sites that named or pointed at the script now point at `fundAndApproveRuntime` / step 5.
- `docs/tasks/28-coherence-audit.md` — entry 43, struck through, with a check that prints exactly the one line it quotes.

## Surprises

- The script was deleted in `bf20de0` and nothing replaced it, so the fix was a removal, not a repoint.
- The entry's own grep matched the entry itself (three mentions) and any `.claude/worktrees/` checkout. A check written into the file it describes has to exclude that file, or it can never print what it claims.

## Decisions made

- **Remove the instruction, do not repoint it** — no file under `scripts/` calls `grantSmartAccountDepositApproval` or `fundAndApproveRuntime`; pasting the saved key is the only path.
- **ADR `0033:44` left as is** — append-only, historically true.

## Rules touched

- `.claude/rules/claims.md` check 6 — sufficient; it is what caught the first draft (scope of the grep vs scope of the claim).
- `.claude/rules/code.md` — sufficient (comments must not misdescribe state).

## Suggestions for future tasks

- When a task file entry carries its own grep, add `--exclude=<that file>` and `--exclude-dir=worktrees` from the start, then run it and paste the output.
- Evidence ladder: tier "staked" — step 5 grants the approval an agent needs before it can stake under delegation; this keeps that path's instructions true rather than moving ARP up the ladder. State it in the completion report.
