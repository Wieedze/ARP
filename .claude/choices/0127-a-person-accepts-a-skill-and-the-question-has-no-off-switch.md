# 0127 — A person accepts a skill before it is installed, the question has no off switch, and the page shows facts, never a verdict

**Status:** Accepted
**Date:** 2026-11-03
**Triggered by:** `docs/tasks/61`; user decisions 2026-11-03 — « la question doit toujours être
posée »; the pattern counts ship (« oui, en comptes bruts »); per-version figures wait (« pas
encore »); a refusal keeps nothing (« si l'utilisateur ne veut pas je pense pas qu'il faille lui
mettre de côté »); the dialog keeps one help sentence; and « tu n'inventes rien, tu testes ».

## Context

In project mode `arp_get_skill` wrote a skill's whole directory, scripts included, under
`.claude/skills/`, read at `HEAD`, with nothing between a compromised repository and that directory
but a sentence in the tool description. Task 61 asked for a pinned version, a page of facts and a
person who accepts, and for the surface to be tested before it was relied on.

What was measured on 2026-11-03, with a stub MCP server that logs `initialize` and sends one
`elicitation/create` (`scripts/measure/elicitation-probe.mjs`; logs
`data/measurements/elicitation-2026-11-03-claude-p.txt` and `…-interactive.txt`). The logs show what
each client declared and answered; whether a dialog was shown, and who answered, is the user's
report from the keyboard:

| client | declares elicitation | what happened |
| --- | --- | --- |
| Claude Code 2.1.316, `claude -p` | yes (`form`, `url`) | answered `cancel`, nothing shown |
| Claude Code 2.1.316 / 2.1.317, terminal | yes | dialog shown, the person answered |
| same, `--dangerously-skip-permissions` | yes | dialog still shown, the person answered |
| Claude Code in VS Code, client 2.1.317 | yes | answered `decline`, nothing shown |

The VS Code row is a known defect, `anthropics/claude-code#98256`, open since 2026-09-29; #98978 and
#103296 were closed as its duplicates. Not tested here, because not installed: Gemini CLI, Codex,
Cursor, Copilot CLI.

The dialog prints the message line by line, then each field's title and description. A 75-line
page did not fit; the person saw only the checkbox.

The fallback the task proposed — park the skill and have `arp skills accept` read `y/N` from the
controlling terminal — was tested and is not a lock: a model's shell has no `/dev/tty` (`ENXIO`),
but `echo y | script -qec "<command>" /dev/null` gives it one and answers the question.

## Decision

1. **A version is a pinned commit.** Each catalogued repository is pinned to the newest commit
   GitHub dates at or before the catalogue's `recordedAt` (`scripts/build/build-skill-pins.ts`,
   `data/catalogue/skill-pins-13579.json`). Listing and bytes are read at that commit; a repository
   with no pin is refused, never read at `HEAD`. The content receipt names the commit: a receipt
   with a `commit` is signed under domain version 2, and a version 1 receipt still verifies.
2. **The only path that writes a skill is an explicit accept to an MCP elicitation**: `action:
   accept` with the box ticked. A decline, a cancel, an unticked box, a client that does not declare
   elicitation, the HTTP transport, a configuration with no way to ask, and no answer within fifteen
   minutes all write nothing and keep nothing. There is no ARP flag, variable or mode that skips the
   question.
3. **No terminal fallback.** The agent is told that the client did not accept and, if the person
   saw no question, to ask again from Claude Code in a terminal, where the dialog shows.
4. **The question shows facts, never a verdict.** The skill and repository; a link to read every
   file on GitHub at the pinned commit; files by kind with the total size; files that start with
   `#!`; for a fixed list of regular expressions the count of matching lines, and up to three of the
   lines; third-party figures with their source and date. The box reads "Install <skill> into
   <path>" and its only help is "Nothing is written unless you tick this and press Accept." The
   test suite checks the text never says safe, clean, trusted, suspicious or verified.
5. **Where a fact ends.** A pattern's name says what the expression matches ("network",
   "pipe to a shell"), never what it implies about the author. Zero matches is printed as zero, not
   as a clean bill. Nothing is weighted, combined or ranked.

## Alternatives considered

- **`arp skills accept` reading the terminal** — built, then removed: a model drives it through a
  pseudo-terminal (tested). A tool that looks like a lock where there is none is worse than none.
- **Park a refused or unasked skill in `.arp/pending/`** — removed on the user's decision: a no is
  a no, and the VS Code case is better served by the terminal, where the real lock works.
- **A label or a score on the page** ("suspicious", "maintained") — rejected by ADR `0046` and the
  task: a skill ARP did not flag would become ARP's miss.
- **The full file list in the dialog** — did not fit (measured); it is one click away at the link.

## Consequences

**Positive:**

- The bytes installed are the bytes that were listed, and the receipt says which commit.
- In a terminal, nothing lands in `.claude/skills/` without the person, even with permissions
  bypassed.

**Negative:**

- In Claude Code inside VS Code, no skill can be installed through ARP until #98256 is fixed.
- The gate governs what ARP writes. A model with a shell can still install anything itself; that
  is outside what a server can stop.
- A newer upstream commit is not served until it is listed again, and nothing re-lists yet.
- GitHub's `until` filters on the committer date, which whoever commits sets: a pin is the commit
  GitHub dates at or before the listing, not a record of what the branch held at that second.

**Neutral:**

- Per-version figures (task 61 B) and whether a version is also an atom or a publisher's name
  (task 61 §5 point 4) are not decided.
- A user-installed `Elicitation` hook can answer the dialog; that is the user's own choice.

## References

- Task: `docs/tasks/61-review-before-install.md`
- Code: `packages/protocol/src/skill-review.ts`, `packages/protocol/src/receipt.ts`,
  `apps/mcp/src/client-session.ts`, `apps/mcp/src/desktop/skill-gate.ts`
- Measurements: `scripts/measure/elicitation-probe.mjs`, `scripts/measure/skill-paths-at-pin.ts`
  (521 of 662 resolve at the pins, 139 absent, 2 ambiguous —
  `data/measurements/skill-paths-at-pin-2026-11-03.json`)
- Related ADR: `0046` (ARP scores nobody), `0080` (content receipts), `0116` (refuse to overwrite)
- Third party: https://github.com/anthropics/claude-code/issues/98256
