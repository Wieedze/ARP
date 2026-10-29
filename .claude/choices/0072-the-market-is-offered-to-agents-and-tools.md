# 0072 — the market is offered on an agent or a tool, and no single field says which

**Status:** Accepted
**Date:** 2026-10-28
**Triggered by:** a `ui-reviewer` finding on `tasks/30`, then the user's decision.

## Context

Generalising `AgentBacking` into `AtomMarket` and wiring it onto `/atom/:atomId` put a **deposit
control on every atom in the Intuition graph**. That page deliberately serves any atom — a tool, an
agent, a tag, a category, a person — because `getAtomStanding` does not presume the predicate. So
with a wallet on mainnet, ARP offered a real-TRUST position on the tag `Sanctioned Address`, on a
book, on a name.

ADR `0056` is the market's authority and it does not cover that. Its title is _the market on an
agent is on its atom_; the trigger quote is _« juste une bourse d'agents **et d'outils** »_. "Agents
and tools" is not "every node in a permissionless graph".

Put to the user with the tag case in front of him. His answer: **agents and tools only.**

## Decision

The market renders only where `offersMarket` is true, and that takes **two** tests, either of which
is enough:

1. the atom **points at something** — a non-empty `url` in its pinned Thing;
2. somebody has declared **using** it — it is the object of at least one `uses` edge, matched on
   ADR `0030`'s frozen predicate id and never on a label.

## Why two, and not one

Because no single field carries the distinction, and finding that out cost a false negative on the
exact thing the market is for.

`type` cannot decide it. Measured on mainnet 1155, 2026-10-28: the tag `Sanctioned Address` and the
skill `docx` are **both** `Thing`.

The url looked like the answer — a tool points at something on the web, a tag does not — and it is
right for every atom written by `toolThing` or by the skills.sh cohort. Then the user opened
`Trail of Bits — secure-workflow-guide`, a real tool on testnet, and the market was **gone**: the
rig's tools predate that recipe and carry `url: ""` with a real name and description. **A false
negative here is worse than the false positive it was guarding**, because it removes the market from
the things the market exists for.

A tag fails both halves: empty url, and its 250+ edges are all `has tag`. A freshly registered tool
passes the first before anyone has used it; a legacy rig tool passes the second.

## Alternatives considered

- **Offer it on every atom.** Defensible — Intuition gives every atom a vault, and refusing access
  is ARP deciding for the market, which ADR `0046` forbids elsewhere. Rejected by the user. The
  distinction is that ARP is not scoring the atom; it is declining to put a money button on a word.
- **Gate on `type`.** Measured not to work.
- **Gate on the url alone.** Shipped for twenty minutes and hid a real tool.
- **Keep the market on the agent page only** (unwire it from `/atom/:atomId`). Rejected: an agent
  arriving by atom id could then not reach the market at all, which is the gap this work exists to
  close.

## Consequences

**Positive:**

- No money button on a tag, a keyword or a person's name.
- Both halves are read from data the page already has — the atom's Thing and its edge groups — so
  the test costs no extra query.
- `url` is now on `AtomStanding`, normalised once in the reader: the tag atoms carry `""`, not a
  missing field, so a caller testing truthiness on a raw value would read a tag as a thing that
  points somewhere. Proven by two package tests.

**Negative:**

- **It is a heuristic and it will be wrong at the edges.** An atom that points at something but is
  not a tool — a book with a url — passes. The rule is "does anything suggest this is a thing that
  gets used", not "is this a tool", and no data in the graph answers the second.
- A tool registered with no url and never used is invisible to the market until its first `uses`
  edge. `/register` always writes a url, so this is the legacy rig's shape only.

**Neutral:**

- The control's wording is the user's: **"Take a position, or exit"**, not "Back" and not
  "Recommend". He asked for something catchier; `recommend` is an opinion word that ADR `0056`
  rejects (_« c'est un market donc pas un signal »_) and collides with a `recommends` predicate a
  real person uses on the graph, and `support` is already `StakeSide`'s word for a triple that has
  a counter-vault, which an atom does not. "Take a position" was already the app's own phrase in
  the empty state; this promotes it to the label.
