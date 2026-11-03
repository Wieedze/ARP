# 0115 — Agents and people may add a category, by the same rules, reviewed after the fact

**Status:** Accepted
**Date:** 2026-11-02
**Triggered by:** user request (« si un skill n'est pas dans les catégories on puisse créer la
catégorie […] qui répond au même prérequis que les autres et a le même schéma de liaison »), then
the user's choice between the two options put to them, and « faudra le nommer dans une doc ».

## Context

The tree is 21 categories under `tool`. 61 of 662 skills carry no category, because no keyword
matched (`docs/20`). The rules a category obeys (plain string, normalisation, one word, a parent,
one tag at the deepest level) live only in `scripts/seed/`, which nothing but a session at a
terminal runs. And the index reads only the filings of one attestor (`ARP_DOMAIN_ATTESTOR`), so a
category anyone else writes exists on the chain and stays out of search.

The user wants the graph traversable, and so every category held to the same conditions and links.

## Decision

1. **The rules move into `packages/protocol`**, one implementation that the MCP server, the web app
   and the sponsor all call. `docs/25` §8 lists them.
2. **Agents and people may propose a category.** The proposer is shown the existing categories and
   states why none fits; the reason is kept.
3. **On testnet the sponsor writes an accepted proposal as the attestor**, within a daily limit, so
   it is in the index at once.
4. **The user reviews after the fact.** A category that duplicates another leaves the index when the
   attestor withdraws its position. Nothing is deleted from the chain.

## Alternatives considered

- **The user approves each category before it enters the index:** rejected. It makes the user the
  bottleneck, leaves skills uncategorised while they wait, and reads as a registry ARP curates,
  which `docs/12` excludes.
- **People only, no agents:** rejected. Almost nobody comes back to categorise by hand, and the 61
  uncategorised skills would stay so.

## Consequences

**Positive:**
- An agent that finds a skill outside the tree can place it, and the graph stays traversable to
  `tool`.

**Negative:**
- The rules do not see meaning. Near-synonyms will get through and cost a review. A bad category is
  on the chain for good, retired from the index, not erased.

**Neutral (worth knowing):**
- Mainnet needs a new ADR: the sponsor writing as attestor is a testnet licence (ADR `0092`).

## References

- `docs/25_THE_DOMAIN_TREE.md` §8, `docs/tasks/59-a-category-anyone-can-add.md`
- Related ADR: `0053`, `0074`, `0088`, `0092`, `0094`
