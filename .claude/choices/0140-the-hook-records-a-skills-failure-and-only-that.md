# 0140 — The hook records a skill's failure, in one file, and writes `worked` never

**Status:** Accepted
**Date:** 2026-11-05
**Triggered by:** `docs/tasks/68`, the user's « go », 2026-11-05. Extends ADR `0090`.

## Context

ADR `0090` limits what the hook keeps from a call, and the hook ignored `Bash`. A skill's real failures show up in `Bash`: its program is missing, or its key. An agent does not write those down by itself, so the next session repeats them.

## Decision

A failed `Bash` call writes one line to `<arpHome>/failures.jsonl` when a skill used earlier in the session asks for that command and the output shows `missing-key`, `missing-program` or `missing-file`. The line holds the date, session, skill, source and reason, at most once per session, skill and reason. `arp backfill` applies the same rule to old transcripts. Neither sends anything.

The hook never writes `worked`, because no error does not show that the job was done. The command and its output stay out of the line, as ADR `0090` requires of content: they are read to choose a reason and dropped.

## Alternatives considered

- **A failure line in `.arp/session.jsonl`:** rejected. That log feeds `arp_declare_session`, so a shell call would start to look like a use.
- **The project's `.arp/`:** rejected. A key or a program missing here is missing in the next project too.
- **Counting any failure after a skill:** rejected. An error after a skill is often not the skill's. The cost is that real failures go unseen when the skill's text does not name the command.
- **Not counting a missing key or program:** rejected for this file. It is right that they say little about the tool's quality, which is why the score does not hold them against a skill (`docs/28`), and they are what the next agent needs to know.

## Consequences

**Positive:**
- The record exists with no action from the agent, and a user has something to read on the first search.

**Negative:**
- Local and forgeable, so it is a weak witness if a line ever goes on chain (`docs/tasks/67` §9).
- Plugin skills are not covered by the live hook, and a command of several parts counts if any part is asked for.
- **Attribution lasts the whole session, by program.** A skill naming `git` or `gh` takes a later unrelated failure of that program. Excluding common programs would lose real failures, so this is a stated limit, to bound only if real lines show the problem.

## References

- Related task: `docs/tasks/68-the-field-memory.md`
- Related ADR: `.claude/choices/0090-what-the-hook-records.md`
- Related doc: `docs/22_RUNNING_THE_NODE.md`, `docs/28_THE_SIGNAL.md`

## Amendment, 2026-11-05 (`docs/tasks/70` item 2; not yet validated by the user)

The hook also keeps what `arp_pulse` answered, in `.arp/searches.jsonl`: the session, the domain and the skills found with their source, never the query. A failure of a skill that a search of that session found takes that domain and source. With no such search it has no domain: none is invented. The skill's own category was not used, because it says what a skill is for and not the context in which it failed, and the catalogue does not hold what `npx skills find` returns.

**Second amendment, same day.** The user: « il y a toujours un contexte ». With no search, the domain comes from the person's latest words in the session's transcript, then from the skill's own description, by whole-word match on the tree's labels (`inferDomain`). The words are read and dropped. Words that name no category still give no domain: the context exists, but no closed word says it.

