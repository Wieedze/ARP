# 0088 — A label is one word, unless a compound is necessary

**Status:** Accepted. Amends the one-word rule of 2026-10-28 (`scripts/seed/seed-domain-tree.ts`,
`data/catalogue/domains.proposal.json` `_oneWordRule`).
**Date:** 2026-10-30
**Triggered by:** user decision, while settling ADR `0087` — _« non les double mots sont des fois
utiles »_, then _« oui je veux autoriser quand c'est nécessaire »_.

## Context

The rule of 2026-10-28 was one word, no hyphen, ever; where nothing fits, coin a new term. Every
compound it refused had a single word available (`browser`, `collaboration`, `development`,
`quality`, `card`). ADR `0087` needs a kind tag for a package, and `npm package` is the term people
use; `npm` alone names the registry, not the thing.

## Decision

- **One word by default.** A label with a space is refused unless `domains.proposal.json` lists it
  under `compounds` with the reason no single word fits. The list is the review: a compound costs
  one sentence of justification, readable without reading the script.
- **A hyphen or an underscore, never**, listed or not. A compound is written with a space.
  `card-payment` stays the one breach on 13579.
- **Inner whitespace collapses to one space** before hashing, because an atom is its bytes and
  `npm  package` would otherwise be a second node for ever.
- Enforced by `assertLabel` in `scripts/seed/seed-domain-tree.ts`, which refuses the plan before a
  single id is derived.

## Consequences

- `compounds` is empty today. Nothing on chain changes; re-running the seed plans 0 calls, as
  before (run 2026-10-30).
- A space-separated label is a new shape on ARP's graph: `has tag` and `is a sub-domain of`, the
  ecosystem's predicates, were already multi-word, so readers handle it.
- `assertLabel`'s refusals are checked by running the script, not by a test: the function exits the
  process, as `assertOneWord` did.
