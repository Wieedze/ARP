# 0032 — A `uses` edge is a claim about the identity, not a record of the account

**Status:** Accepted
**Date:** 2026-10-16
**Triggered by:** `docs/tasks/19` step 1b. Measuring before building on the join revealed the join does
not exist, and the user chose between the two options the measurement left open.

## Context

Fixing the predicate (ADR `0030`) was necessary and not sufficient. Three facts, measured
2026-10-16 on both chains:

1. ARP writes `(caip10 atom, uses, tool)` — all 21 stranded triples have a `caip10:` subject.
2. `getCapabilities` keys on `resolveSubject`, which returns the atom X satisfying
   `(X, same as, <CAIP-19 of the ERC-8004 token>)` — the registration-derived atom.
3. **Nothing links the two.** ADR `0026` specifies
   `(canonical agent atom, same as, CAIP-10 of the operating account)` and
   `app/src/services/agent-import.ts:397` implements it, but **zero edges of any predicate point at a
   `caip10:` atom** on either chain, over 20 such atoms on testnet. The import path passes its tests
   and has never written a real edge. `scripts/measure/caip10-join.ts` re-checks this.

So the subject was the other half of the problem, and the bridge it would have been crossed by was
never built. Since Intuition has no deletion, picking wrong is permanent.

**One fact that reframed the choice:** anyone can write `(X, uses, Y)` about any `X`. The subject of
a triple is data, not authorisation — writing it does not require controlling `X`. So the edge
carries **no authority at all**, and its weight comes entirely from who stakes on it. That makes the
subject a question of _who can read the edge_, not of who is entitled to assert it, and it is why
`docs/14` puts a free self-report at the bottom of the ladder.

## Decision

**Write `(agent, uses, tool)` with the registration-derived agent atom as the subject** — the atom
`resolveSubject` already returns.

The reasoning, in the terms the task demanded rather than by preference: a `uses` edge is **a claim
about the agent's identity**, not a record of an account's action. A consumer looks up an ERC-8004
agent, not a CAIP-10 account. The operating account is how an agent _acts_; it is not what the agent
_is_, and the account can change without the agent changing.

Consequences of that framing:

- The edge needs **no join**, and `getCapabilities` reads it with no connector change.
- A third party following `docs/07` sees it, which is the discoverability ADR `0030` had to give up
  on the predicate and gets back here.
- The staker is whoever deposits. A vault does not care which account funded it, so putting the edge
  on the identity costs nothing in provenance: the deposit itself records who paid.

## Consequences

**Positive**

- One write per edge instead of two, and no public connector change.
- `docs/tasks/19`'s step 1 gate becomes reachable: a triple written by the write path is returned by
  `getAgentProfile` for the same agent. Nothing in the repo passes that test today.
- ADR `0026`'s `same as` link stays worth writing for provenance, but **nothing depends on it**. An
  unexecuted write path is no longer load-bearing.

**Negative**

- **ARP's own agents cannot carry a `uses` edge yet.** `ARP Agent #1` and the two runtime accounts
  exist only as `caip10:` atoms with no ERC-8004 identity, so under this decision they must first be
  minted into the canonical registry — ADR `0027`'s path, at a real per-agent cost (0.1 TRUST for the
  atom plus the registry's own mint). This is a genuine cost of the decision and not a detail:
  the demo agents are the ones most likely to be wired up first.
- The 21 stranded triples stay stranded on a `caip10:` subject _as well as_ on an orphan predicate.
  Still not migrable, still testnet, still ~2.1 × 10⁻¹¹ tTRUST.
- An edge on the identity says nothing about which account did the work. Where that matters — a
  delegation receipt, an on-chain call (`docs/tasks/22`) — the evidence carries its own account and the
  edge is the index rather than the record.

**Neutral**

- Option B is not wrong, it is more expensive: two writes, a connector change, and third parties who
  do not follow `same as` still see nothing. It was rejected on cost and reach, not on correctness.
- This does not change ADR `0026`. The import's `same as` edge remains the right way to link an agent
  to its operating account; it simply stops being the thing a read depends on.
