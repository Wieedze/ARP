# Task 47 — Plain words: the operator does not read the chain's vocabulary

**Status:** **DONE**, 2026-11-02, branch `feat/47-plain-words` (based on `feat/36-chain-facts`),
uncommitted at verification. ui-reviewer PASS (round 2), task-verifier PASS. Post-mortem
`.claude/learning/38-plain-words.md`. The CLI and the node needed no change (see ADR `0103`
exceptions).
**ADR:** `0103` — the glossary is there and is the user's.
**Rules:** `code.md`, `ui.md`, `claims.md`, `workflow.md`.
**Reviewers:** `ui-reviewer`, then `task-verifier`.

---

## 1. Why

The user, 2026-11-02: _« je voudrais enlever le vocabulaire web3 (par exemple claims ou position),
ça devrait avoir un langage plus commun »_. 45d did it for the MCP tools' descriptions; the web app,
the CLI and the rest of the MCP output still say position, claim, vault, shares, atom.

## 2. Deliverables

- **47a — the web app.** Every visible string in `apps/web/src` (text, `aria-label`, `title`,
  `Hint` text, empty states, button labels) follows ADR `0103`. Technical figures (atom and triple
  ids, vault, shares, bonding curve, minimum shares) move behind a `Hint` or a collapsed detail.
- **47b — what the CLI, the MCP server and the node show the operator.** Descriptions, messages and
  human-readable output. Tool names and JSON field names stay.
- Tests that assert visible text follow the new words.

## 3. Do not do in this task

- Rename identifiers, files, routes, CSS classes, `data-*` attributes, MCP tool names, JSON fields
  or query documents.
- Rewrite `docs/`, ADRs, task files or code comments.
- Change what a page shows beyond moving technical figures behind a `Hint` or a detail.
