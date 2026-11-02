# 37 — The redesign from references, 46d: `/register` offers two tiles

**Task:** `docs/tasks/46-the-redesign-from-references.md` (row 46d in §4)
**Completed:** 2026-11-02
**Commit:** uncommitted (branch `feat/46-tools-pagination`)
**Verifier verdict:** PASS (second pass; first FAIL on an unrecorded user choice)

## What shipped

- `apps/web/src/pages/Register.tsx` — the two `Choice` buttons replaced by a local `Tile`: `<button aria-pressed>`, `--radius-card`, name in `type-face`, mono line of what the branch needs (`ERC-8004 identity · wallet`, `URL · wallet`).
- `apps/web/src/pages/Register.test.tsx` — 2 behavioural tests: the label text, and `aria-pressed` follows the click.
- Task file §2/§4 and `.claude/STATE.md` row 46 updated.

## Surprises

- First verifier pass failed on scope, not on code. The user had approved the `/register` mockup in conversation, but §2 recorded only the shared layouts, which `/register` is neither. Recording the verbatim approval closed it.
- Removing the only external importer turned `Choice`'s `export` into an unused export in a file another session (task 47) owns. Logged in the 46d row and handed to that session, not fixed here.

## Decisions made

- **No symbol on the tiles** — a Sigil is generated from chain data, and there is no agent yet to generate one from.
- **"identity", not "id"** — the agent branch mints an identity for an agent that has none, so it is not a prerequisite.
- **No non-colour cue for the selected state** — the accent border is 5.1:1 against `--color-rule-strong` (#ffb020 vs #43474b), the same limit the old `Choice` had. ui-reviewer advisory, not taken.

## Rules touched

- `.claude/rules/ui.md` — sufficient. The unlayered `button {}` (`index.css:237`) and `button:focus-visible` (`index.css:333`, radius 1px) both beat utilities. The call-site comment the rule asks for is present and names both rules.
- `.claude/rules/code.md` — one deferred breach (unused `Choice` export), recorded with an owner.
- `.claude/rules/workflow.md` — sufficient. The §5 "mockup chosen" check is what caught the gap.

## Suggestions for future tasks

- Record the user's per-page mockup choice in §2 **before** building the row, quoted verbatim. "Approved in conversation" is invisible to the next reader.
- When a change orphans an export in a file another session is editing, log the debt in the task row and tell that session in the same step.
