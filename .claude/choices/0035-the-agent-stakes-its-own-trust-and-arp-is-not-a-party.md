# 0035 — The agent stakes its own operator's TRUST, and ARP is not a party

**Status:** Accepted
**Date:** 2026-10-19
**Triggered by:** user correction — _"pourquoi c'est moi qui signe, moi je ne suis personne, je ne
dois pas exister dans cette boucle, je crée un outil pour les agents"_. Said after I had told them
three times that they would be the signer, and once that their design collided with
`rules/security.md`. Both wrong, for the same reason.

## Context

I conflated two signers that have nothing to do with each other.

| Who signs                        | What                                      | Governing decision                                    |
| -------------------------------- | ----------------------------------------- | ----------------------------------------------------- |
| A human in ARP's trust panel     | a deposit on a `has trust provider` claim | ADR `0017` — the UI never auto-stakes, a human clicks |
| An **external agent's operator** | one delegation, once                      | `docs/12` point 5                                     |

ADR `0017`'s phrase "every transaction is signed by the operator in their wallet" means _the panel
does not stake by itself_. In practice the operator is the project's author, because nobody else uses
the panel yet. That is a fact about today's user base, not a design property.

`docs/12`'s mechanism is the other case entirely:

> 3. The agent runs. It **deposits TRUST on the modules it actually used**.
> 4. The agent operates under a **signed delegation whose caveats are the guard rail**.

and under _What ARP is not_: ~~**"The only thing an operator adopts is a delegation they sign
once."**~~ — replaced 2026-10-20 by ADR `0045`: the operator also runs a node. **This ADR's
conclusion is unaffected**, because the node holds no key either (ADR `0038`), so ARP is still not a
party to the loop.

So the author of ARP appears nowhere in the live loop. They build the rail.

I also over-read `rules/security.md`'s "No agent, script or automated process may sign a mainnet
transaction" as a constraint on the protocol. It is not, and cannot be: a rule file cannot forbid the
canonical mechanism. Its own next sentence gives the scope — _"a passing test suite is not a reason
to spend real TRUST"_ — which is a safety rule for this repo's development, about **ARP's own funds**.
The rule has been scoped explicitly so the misreading is not available to the next reader.

## Decision

**The loop is:**

```
an agent's operator signs one delegation          ← not ARP, not ARP's author
the agent runs and uses tools
the agent deposits on those tools                 ← its own TRUST, under the signed cap
the tool gains reputation, and so does the agent  ← docs/12 point 4
```

**ARP is not a party to any of it.** It supplies the connector the agent declares through, the
enforcers that bound the spend, and the read surface that makes the result legible.

Three pieces close it, and they are `tasks/16`'s first half:

1. **The connector** an agent declares what it used through.
2. **The delegation** its operator signed, with `DomainScopeEnforcer` and `TrustStakeCapEnforcer` as
   the guard rail. Both are deployed on mainnet 1155 — `deployments/1155.json` — so `docs/12`'s
   second recorded gap, "the guard rail on the chain where the agents are", is closed.
3. **The deposit** on the tools.

**Agent-initiated staking is not yet authorised and is not forbidden.** ADR `0017` scopes itself away
from it in as many words — "it does not authorise … any automated or agent-initiated stake" — so it
needs its own authorisation. That is a smaller decision than ADR `0017` was: the TRUST is the agent
operator's, the bound is a caveat they signed, and ARP neither holds the funds nor signs.

## Consequences

**Positive**

- The blocker I had reported does not exist. `tasks/16` half 1 is unblocked and is the real next step.
- The risk shape is right: ARP cannot lose anyone's money by operating, because it never holds or
  signs for any. The caveats are the operator's own limit on their own agent.
- It settles who is on the hook for a bad stake — the operator who signed the cap. Not ARP.

**Negative**

- **Agent-initiated mainnet staking still needs its own ADR before a first real transaction.** This
  one says it is the mechanism; it does not authorise the first spend, and nothing should read it as
  doing so.
- `rules/security.md` is now longer and carries a table. Justified by the cost of the misreading, but
  it is the second-longest rule file and the router already warns against bloat.
- ADR `0017`'s "the operator" remains ambiguous in its own text. Left as written — amending a past ADR
  to read better in hindsight would hide that the ambiguity is what I tripped on.

**Neutral**

- Nothing in `docs/12` changes. This ADR restates its points 3 and 5 against a misreading of them,
  which is what `docs/12`'s drift-signal section exists to catch — and this is the fourth time.
- `tasks/16`'s hire half is unaffected.
