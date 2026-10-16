# Task 23 — The tool surface

> **Status: NOT STARTED** (specified 2026-10-16, after the user restated that the point is **tool
> reputation from the agents that used them**).
> Depends on `tasks/19` steps 2–5. **This is the thing `docs/12` describes**, and the reason the
> `uses` edges are worth writing at all.

## The gap

`docs/12_THE_IDEA.md`: an agent is composed of modules; after it runs it stakes TRUST on the modules
it used, which builds reputation **for the tool and for the agent at once**.

Half of that does not exist. The app shows agents and their trust providers. **Nothing shows a tool
with its weight** — no page, no list, no number. There is no surface that says:

> this tool was used by these agents, who put this much behind it, and this much against

Without it the `uses` edges are a write path with no reader, and nobody can act on them.

## What bounds it

**Corrected 2026-10-16.** An earlier version of this file said the surface does not exist. That was
the _agent_-side figure — 194 `uses` triples against 88,243 agents — and it is the wrong number for
this task. Measured on the **tool** side, by walking the objects of those edges:

|                                                     |                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| distinct atoms that are the object of a `uses` edge | **84**                                                               |
| of those, carrying at least one position            | **64**                                                               |
| largest support on one tool                         | **22.69 TRUST** (Obsidian)                                           |
| a tool with real opposition                         | IPFS — 0.10 TRUST for across 10 positions, **0.03 against across 3** |

So the surface exists in miniature, and the disagreement mechanism has already been used at least
once. The first version has real data to show.

**Concentration is the thing to design for, not emptiness.** GitHub shows 22.59 TRUST across 6
positions — **of which one position is 22.44**. The figure alone reads as a market when it is one
account's conviction. So a weight never renders without its position count, and ideally not without
its spread.

**And one tool demonstrates the whole ladder at once.** IPFS's seven incoming edges include
`(Infura, uses, IPFS)`, `(Fleek, …)` and `(Pinata, …)` with **zero** stake — free assertions, which
`docs/14` puts at the bottom as _nothing_ — beside `(Relics by Intuition, …)` at 0.08 across 8
positions, with a counter side. Use it as the design fixture: if those three render like the fourth,
the page has failed.

An empty state is still needed for the other ~88,000 atoms nobody has declared, per `rules/ui.md`:
it explains what would be there and how to make it appear, and is not a marketing pitch.

## What a tool is, mechanically

No new namespace (`docs/14`, and ADR `0025` was right for this reason): in ERC-8004 plus MCP the tool
layer and the agent layer are the same layer.

- a tool is an atom — usually one that **already exists**, because the tool is a registered agent
- `(agent, uses, tool)` is a triple, which gets a stakeable vault **and** a counter-triple for free
- the tool's weight = deposits across its incoming `uses` edges
- its effectiveness = support against counter on those edges

So the read is: for a tool atom, walk `as_object_triples` filtered on the `uses` predicate, and for
each edge read both vaults.

## Do

1. ~~A service that, given a tool's atom id, returns its incoming `uses` edges with each edge's
   subject (the agent), its vault and its counter-vault.~~ **DONE** — `getToolUsage` in
   `erc8004/src/tool-usage.ts`, exported from the connector, 10 tests, verified against live mainnet
   on Obsidian, GitHub and IPFS.
2. A route and a page. Two columns per `rules/ui.md`: identity left, the edges right. Dense list,
   mono for ids and amounts, hairline borders.
3. **Render the provenance tier of each edge**, from `docs/14`'s ladder: a payment or an on-chain call
   is a fact; both parties agreeing is confirmed; the tool alone is a third party's word; the agent
   alone with stake is a priced assertion; the agent alone for free is **nothing**. A page that
   renders the bottom row like the others has made things worse than before it existed.
4. Link it from the agent panel: an agent's `uses-tool` capabilities become links to the tool page.
   That edge already renders after `tasks/20` — it just goes nowhere.
5. The empty state, for the ~88,000 atoms with no incoming edge. Not "before the populated one" —
   that instruction was based on the wrong figure; there is real data for the populated case.

## Out of scope

- A ranking or a score. Composing edges into one number is a separate decision and needs its own ADR.
- Writing edges — that is `tasks/19` steps 2–4.
- Any staking control on this page in the first version. Reading first; `ADR 0017`'s seven safeguards
  apply the moment a deposit becomes possible, and they are acceptance criteria, not advice.

## Do not do in this task

- Do not invent a tool namespace. Resolve the atom through the existing identity path.
- Do not show a weight without its position count. ADR `0023` and the `StakerCount` precedent: these
  vaults hold one or two positions, and a bare TRUST figure suggests a depth of opinion that is not
  there.
- Do not fill an empty page with example data presented as real.

## Gate

One tool page, rendered from live mainnet data, showing at least one real incoming `uses` edge with
its two vaults and its provenance tier — plus the empty state for a tool with none.

## Which tier of the evidence ladder does this serve?

**Tier 3 (staked), and it is the first surface where the ladder is the subject rather than the
method.** The panel makes one provider's opinion of one agent checkable; this makes a tool's standing
legible, and legible specifically as _who paid what to say so_.
