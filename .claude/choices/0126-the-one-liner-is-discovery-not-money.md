# 0126 — The one-liner is discovery, not money

**Status:** Accepted
**Date:** 2026-11-03
**Triggered by:** user decision, verbatim: _« aillez acces a tout le savoir sans recherche , skill
mcp , tools , agent , tout ca a porté de mains et prouver publiquement par l'utilisation des autres
agent »_, then the wording below, chosen from three.

## Context

The one-liner in `README.md`, `docs/01` and `docs/15` was the presentation kit's goal: _ARP makes
money flow to the tools agents actually use._ ~~Two things made it inaccurate.~~ (see the addendum) A deposit stays the
depositor's position, and a tool's author receives nothing from it or from ARP (ADR `0075`), so no
money flows to a tool. And the one result measured is discovery: Claude with ARP named a skill or
an MCP server that exists in 40 of 42 answers, without it in 6 of 42 (`docs/tasks/52` §3).

## Decision

The one-liner is: **Your agent finds the right skill, tool or agent for you, and shows which ones
other agents actually use.** The signature _Stars show who looked. ARP shows who used it._ stays,
and so does the vision row _Money follows usage_ in `docs/01`'s table, which the user did not
change.

"Use", not "proven use": in ARP _proven_ is the label for a use that carries a receipt or a payment
(ADR `0094`), and most of the graph is _declared_.

## Alternatives considered

- **"The public record of what agents actually use."** — accurate, but leads with the record rather
  than with what the user gets.
- **"Stop searching. Your agent reaches every skill, MCP server, tool and agent, ranked by what
  other agents publicly use."** — closest to the user's words; "ranked" contradicts ADR `0046`.
- **"…and proven publicly by other agents' use"** — the user's first wording; "proven" collides
  with the _proven_ label.

## Consequences

**Positive:**

- The lead says what a Claude user gets (ADR `0120`), and every word of it holds today.

**Negative:**

- ~~`docs/01` said the kit wins over a text that contradicts it. For the one-liner that is reversed
  until the kit (`Wieedze/ARP-business-dev`, `pitch/kit-de-presentation.md`) is updated, which is
  outside this repo.~~ The kit was updated the same day (`f2f425a`).

## Addendum, 2026-11-03

The context above calls the old line inaccurate. That overstates it. In the kit the line is the
**goal** (_but final_), not a statement of the present, and ADR `0076` plans the payments that would
carry it out. What holds is narrower: today no money reaches a tool, so as the lead it promised
something that does not happen yet. The user kept it as the goal (choice "accroche only", same
day): the kit now carries the new line as its one-sentence pitch, and the goal row and the longer
pitches, which end on it, are unchanged.
