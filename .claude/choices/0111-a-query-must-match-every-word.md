# 0111 — A query must match every word, and an empty query answer suggests nothing

**Status:** Accepted
**Date:** 2026-11-02
**Triggered by:** task 45c's measurement, and the user's « oui » to a quieter search. Task
`docs/tasks/51-quiet-search.md`.

## Context

ADR `0108` ranked results by the words they matched, so one word out of two was enough to be
returned. When nothing matched, the answer listed the domain words so the agent could ask again.
Task 45c measured the result: agents read lists of tools that only shared one word with the need,
then answered from memory. A run with ARP used 3.14 times the tokens of a run without.

## Decision

A result must hold every word of the query, ignoring filler words. A free-text query that finds
nothing returns an empty answer with no list of words to try next. The tool description tells the
agent to answer from what it knows. A `domain` search keeps its list.

## Alternatives considered

- **Keep partial matches but rank them lower.** The agent still reads them. Cutting them is what
  shrinks the answer.
- **Search by meaning.** Recall would be better, but it needs a hosted service or a local model. It
  is recorded in `FUTURE.md` and was deferred by the user on 2026-11-02.

## Consequences

**Positive:**
- Probe, testnet 13579, 2026-11-02, one-off: `card payments` went from 4,071 bytes and 10 results
  to 97 bytes and 0.

**Negative:**
- A need described with a word the description lacks is missed.
- Task 51 §3 measured no established saving: the cost of a consultation is mostly the extra turns.

## References

- Related task: `docs/tasks/51-quiet-search.md`, `docs/tasks/45-discovery-without-a-command.md` (45c)
- Related ADR: `0108` (amended here on the query path only), `0046`
