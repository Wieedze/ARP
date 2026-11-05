# 0134 — A skill's pulse is read on demand, and its content id is git's tree id

**Status:** Accepted
**Date:** 2026-11-05
**Triggered by:** `docs/tasks/63`, the user's decisions there

## Context

ARP has fed a catalogue by hand: 673 skills to list before anyone can find them, and a build step
for what each needs. `npx skills find` searches a far larger set with the engine installs use.
On two searches, 152 of 168 GitHub results were absent from the catalogue (scratch trial, 2026-11-05).

So a reader has to work on a skill nobody listed, and has to read the file an install would take.
The first trial matched directory names and read 135 of 180 results. Its misses included the search's
first result, whose repository also carries translated copies.

## Decision

1. **A skill is read when someone asks**, from its repository, on the asker's machine. Nothing is
   written anywhere by reading.
2. **A result names a skill by its frontmatter `name`, and ties follow the installer's order**
   (`skills` 1.7.4, `PRIORITY_PREFIXES`, first name kept). Off that order, differing files stay
   `ambiguous`.
3. **The content id is git's tree id of the skill's directory.** It covers every file and anyone can
   recompute it with `git rev-parse HEAD:<directory>`.
4. **Every failure is a status.** A skill not read is never shown as a skill needing nothing.
5. **The search is the official CLI, pinned, with four environment variables, and no `/api/` route of
   skills.sh is called**: its `robots.txt` disallows them. It does not run where an agent key is kept, and
   `ARP_PULSE_SEARCH=off` stops it. `search_output` takes the command's text and runs nothing.

## Alternatives considered

- **A hash of `SKILL.md`**: misses scripts, and groups two skills whose instructions match while
  their code differs.
- **`resolveContentPath`'s directory match**: right for serving an atom's file, wrong for predicting
  an install.
- **Keep growing the catalogue**: every skill has to be guessed in advance, and only what was guessed
  can be found.

## Consequences

**Positive:** no listing cost, and a skill can be checked before anything about it is on a chain.

**Negative:** the search depends on another project's CLI, and its text output has no stated format.
`parseSkillsFind` returns an empty list if it changes. Its results are the only ones seen, and some
are not on GitHub, so they stay `not_github`.

**Neutral (worth knowing):** a skill at a repository's root takes the root's id, which changes with
any file in the repository.
