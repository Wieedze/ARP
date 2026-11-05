# 0137 — ARP will compute a score

**Status:** Accepted. Its design is open.
**Date:** 2026-11-05
**Supersedes:** the rule of ADR `0046`, « ARP ne note personne »
**Triggered by:** the user, verbatim — _« je veux créer un score, on arrête avec ça »_, while discussing how the search
starts on existing rankings. ADR `0136` makes the search the product.

## Context

ADR `0046` ruled out any score, and every surface of ARP says so. The order of `arp_pulse` was held to one visible fact to stay
within it. A search that learns from what agents did, starting on existing rankings, has several signals to weigh.

## Decision

**ARP will compute and publish a score.** Nothing about it is built yet. What it scores, from what and how are decisions still to
make, in a task of their own.

## Alternatives considered

- **Keep one visible fact as the order**: the user chose otherwise.

## Consequences

**Positive:** several signals can be weighed, so a new domain can move gradually from an existing ranking to observed use.

**Negative:** ADR `0046` said ARP cannot be wrong about an agent, only the market can. **Now it can be wrong**, and it is the party to
blame or to game: the more a score decides, the more it pays to cheat. `docs/12` called this a drift signal in one case, a score
built from other providers' assessments; that case still needs an answer in the design.

**Neutral (worth knowing):** the sentences that say ARP composes no score stay **true until a score ships** and are not edited now:
`apps/mcp/src/server.ts`, `apps/mcp/src/tools.ts`, `skills/arp/SKILL.md` and code comments citing `0046`. A count of the sites comes from
`grep -rIl "no score" apps packages skills docs .claude/rules`. They change with the task that ships it, and that task greps them.
