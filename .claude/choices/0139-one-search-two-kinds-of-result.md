# 0139 — One search, two kinds of result, and four uses for an agent you can call

**Status:** Accepted
**Date:** 2026-11-05
**Builds on:** ADR `0136` (the product is the search), ADR `0141` (an agent's line carries the receipt of the hire)
**Triggered by:** the user, on `docs/tasks/65`: « documente les deux choix que je t'ai dit et continue dans cette direction, qui était celle du début, j'essaye juste de la rendre plus solide »

## Context

Task 65 closed the mechanism for agents on one run on testnet 13579: a signed address, a receipt from the hired node, a line with a domain and an outcome. The user then asked what such proofs and a list of reachable agents are for, given ARP's positioning. Two answers were proposed in that session and the user chose them. This is the direction ARP started with, made firmer, and not a new one.

The distinction under both: a skill is knowledge an agent copies and runs itself, and an agent you call is access it cannot copy, such as private data, a paid service already connected, compute or a specialised model. In a video comparison of 2026-11-05 (testnet, Sonnet, n=3, raw runs in that session's scratch space, not committed) the agent with no skill succeeded 3 of 3, so it had no reason to hire anyone. Hiring makes sense when an agent cannot do the job itself.

## Decision

**1. One product, the search, with two kinds of result:** what you install (skills) and what you call (agents). The question is the same for both: « qu'est-ce que ça implique, et qu'est-ce que ça a donné dans ce contexte ? » There is no separate agent registry.

**2. Four uses, kept as the user pasted them:**

1. **Control before paying.** Control before install, applied to agents: who answers now, who used it in this context, and does a real payment prove it? In the sample `docs/14` holds (122 agents on Base, measured October 2026), 51.6% declare an endpoint and 2.5% answer one, 95% interval 0.8 to 7.0%.
2. **Choosing whom to give a task.** An agent with a need it cannot cover searches by domain and calls directly. ARP is not in the path of the call.
3. **Answering to the operator.** "My agent paid this agent, for this task, here is the receipt." The verifiable receipt serves from the first day, with no ranking.
4. **A reputation that belongs to the agent.** An agent running a node is found without a marketplace, and its proofs stay on chain.

## Alternatives considered

- **A registry of reachable agents as its own product**: the user chose against it. It would split the question an agent asks, and a list says what exists, which is what a search result already does.
- **Holding this until Sybil is solved**: the user deferred Sybil (ADR `0141`). One operator holding both sides inflates a count, which nobody reads yet.

## Consequences

**Positive:** one test for what to build, the same as ADR `0136`, now covering agents. Uses 1 and 3 need one agent paying one service, so they can be shown before any market exists.

**Negative:** nobody outside ARP has hired an agent through this, and nothing shows that autonomous agents want to. Use 2 depends on that demand. Use 4 depends on somebody reading those proofs. All of this is a choice of direction and is not evidence.

**Neutral (worth knowing):** `docs/12` is not edited by this ADR. The figures for use 1 are one sample, and `docs/14` says to re-run the script rather than trust its counts.
