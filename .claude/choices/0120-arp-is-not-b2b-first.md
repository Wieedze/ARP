# 0120 — ARP is not B2B first

**Status:** Accepted
**Date:** 2026-11-03
**Triggered by:** user decision during `docs/tasks/27`, verbatim: _« non ce nest pas b2b first ,
peut etre pour les agregateur ou les publisher dans le futur »_

## Context

`docs/12` and `docs/01` both said ARP is "not consumer-facing — B2B infrastructure; agents, dApps
and protocols consume it". The product built since says otherwise: the Claude Desktop extension is
made for a person who has never opened a terminal (`docs/26`), and the presentation kit
(`Wieedze/ARP-business-dev`, `pitch/kit-de-presentation.md`) names "Claude users with no technical
background" and agent developers as the first audiences. The task 27 pass found the contradiction.

## Decision

ARP is not B2B first. Its first users are people who use an agent — Claude users, agent builders,
tool authors — and the agent itself, which reads ARP mid-task. Business customers, aggregators and
publishers, may come later, through the data licence ADR `0112` already describes. They are not the
lead.

## Alternatives considered

- **Keep "B2B infrastructure"** — rejected by the user; it describes neither the Desktop extension
  nor the kit's audiences.
- **"Consumer product"** — not chosen: what a person installs is still used through their agent, and
  no ARP surface asks them for anything beyond the install.

## Consequences

**Positive:**

- `docs/12`, `docs/01` and the kit say the same thing about who ARP is for.

**Negative:**

- A product for non-technical users carries the onboarding and support cost B2B infrastructure did
  not. ADR `0103`'s plain words are part of that cost, already paid.

**Neutral:**

- `docs/11:189` still cites `docs/01` for "B2B infrastructure". `docs/11` is analysis and its subject,
  calibration, is out (ADR `0049`), so it is left as the record.

## References

- Related doc: `docs/12_THE_IDEA.md`, `docs/01_PROJECT_CONTEXT.md`, `docs/26_DEMO_PLAN.md`
- Related ADR: `0075`, `0103`, `0112`
- Triggered by: `docs/tasks/27-strip-the-ai-slop.md`
