# 0136 — The product is the search

**Status:** Accepted
**Date:** 2026-11-05
**Triggered by:** the user, after the second comparison of `docs/tasks/63` §10, who asked for this to be kept as important

## Context

Until now the deposit, then the declaration, was treated as the signal and the sheet as the product. The second
comparison's one separation came from ordering, and the user read the system as empirical: agents gain relevance
from what earlier agents did, and the semantics and declarations exist to give an agent a very simple, dynamic,
contextual search.

## Decision

**Le produit, c'est la recherche. La déclaration en est le carburant, et la sémantique sert à la faire tomber au bon
endroit.**

A feature is judged by whether it improves the next search. A word enters the ontology only if it does. The sheet is
what the search shows on a result. Reputation still comes from declarations, second.

## Alternatives considered

- **The sheet as the product**: it informs a choice among what the search already returned, and it cannot surface what the
  search missed.
- **The declaration as the product**: nobody searches for a declaration, and it gives no reason to read.

## Consequences

**Positive:** one test for what to build next and for each word in the ontology.

**Negative:** the learning is not shown: declarations have come from ARP's own wallets, and 5 runs reading one line is not a
system improving over time. Ordering on declarations favours what is already declared, so it needs room for discovery, and the more
it weighs, the more it pays to cheat. Ordering stays on one visible fact, or it becomes the score ADR `0046` refuses.

**Neutral (worth knowing):** `docs/12` still states the mechanism as a deposit that is the signal. It is not edited by this ADR.
