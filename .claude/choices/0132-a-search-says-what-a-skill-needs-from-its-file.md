# 0132 — A search says what a skill needs from its own file, including a skill listed yesterday

**Status:** Accepted
**Date:** 2026-11-04
**Triggered by:** the usage demo of 2026-11-03. The user, 2026-11-04: _« améliore ça, améliore le
connecteur pour avoir une meilleure recherche, une meilleure performance »_.

## Context

16 agents searched for a skill to turn a web page into Markdown. All 16 fetched
`web-to-markdown`, which needs a `web2md` CLI and a Chrome. None had them. 10 passed by doing the
conversion themselves and declared it; 6 did not pass.

What each agent had been shown for that skill, and for the two others listed that day, was a name:
`purpose: null`, no `requires`. Three separate causes:

1. Descriptions came from skills.sh only, read 2026-10-29. A later listing had none.
2. `requires` read the frontmatter only. `web-to-markdown` declares nothing there, so even a fresh
   reading would have been silent.
3. An absent `requires` meant both "its file showed nothing" and "nobody read its file".

## Decision

- **`requires.runs`**: commands the file's instructions run, beyond a list of common ones. Read from
  shell fences (skipping heredocs, open strings and continued lines), and from `command -v <name>`
  and install lines in inline code. Other inline code is not read: when it was, it gave `film`,
  `auth`, `render`. At most five are shown.
- **A skill skills.sh was not read for takes its description from its own SKILL.md**, with no
  install count.
- **`file_not_read: true`** on a skill nobody read, so silence stops meaning two things. It covers
  the 141 the layout leaves unread and anything listed after the last measurement.
- **Search**: from three words on, one may be missing, and a row holding every word always comes
  first. One or two words must all be found, so task 51's "card payments" still answers nothing (ADR
  `0111` stands). Two words side by side also match as one: "web page" finds "webpage".
- **The listing read is kept 60 s per process.** A search read the registry from the graph each
  time. The first search of a session still pays it.

## Alternatives considered

- **Read the file live at search time for an unmeasured row** — a network dependency on every first
  search, and a search cannot match words in a file it has not read yet. `file_not_read` is honest
  for now; the real fix for a new listing is `/list-tool` recording it (`FUTURE.md`).
- **Rank a skill down for what it needs** — task 56 decided no reordering: whether a program is
  present depends on the machine, and the agent can check that and ARP cannot.
- **Inline code carrying a flag counts as a command** — tried and measured; too much prose.

## Consequences

- `runs` is a reading of text, not a fact the author wrote. Some names in it are not commands
  (`film`, `app`, `rev-parse`), so it says "runs" and is never presented as a requirement proven.
- Nothing here makes a declaration prove that a skill did the work, which is what let 10 agents
  declare a skill whose CLI they never ran. That is a separate question.
- A declaration can take a minute to move the order inside one session.
