# 0129 — No per-agent deposit cap on testnet; the daily budget is the bound

**Status:** Accepted
**Date:** 2026-11-03
**Triggered by:** the three-arm skill test, which seeds support from one agent per measured run, ran
into ADR `0092`'s 2 sponsored deposits a day per agent. The user, 2026-11-03: _« enlève cette règle
de dépôt par jour ça me paraît ridicule »_.

## Context

ADR `0092` item 3, extended to deposits by ADR `0094` §3, set two bounds on the sponsoring service:
2 sponsored deposits (and, since ADR `0110`, 2 `uses` triple creations) a day per agent, and about
1 tTRUST a day overall. `limits.ts` already said which one protects the treasury: the global
budget. The per-agent count kept one operator from using all of it, and on testnet 13579 that
operator is us.

## Decision

**`depositsPerAgentPerDay` is `null`, off, unless `SPONSOR_DEPOSITS_PER_AGENT_PER_DAY` is set.**
With it off, `checkDepositLimits` and `checkCreateLimits` check the budget, and the withdrawal
threshold where it applies. Every other cap is unchanged: mint gas, listings, categories,
publications, and the global daily budget.

Testnet only. The service signs on 13579 and nowhere else (ADR `0092`); a mainnet service decides
this again, in its own ADR.

## Alternatives considered

- **Raise the default** — still a number to hit in the middle of a test, for no protection the
  budget does not already give.
- **Set the variable locally and leave the code** — the user asked for the rule to go, not for a
  workaround on one machine.

## Consequences

- One agent can spend the whole daily budget on deposits. That is accepted: the budget is ARP's own
  tTRUST, and the service's balance is the hard limit behind it.
- `GET /` reports `depositsPerAgentPerDay: "off"`.
