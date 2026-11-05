# 0142 — The public message is not the internal argument

**Status:** Accepted
**Date:** 2026-11-05
**Amended:** 2026-11-05, the user: « cétait beaucoup plus vendeur », then « ok vazy ». The signature is the title on the landing and the README, and the message the line beside it. The two texts are unchanged.
**Triggered by:** the user, 2026-11-05: « on doit avoir un positionnement marketing différent » and « c'est plus notre argumentaire » (spelling corrected), then « ok go » on the plan. `docs/tasks/69`.

**Amended 2026-11-05, same day, by the user:** « on ne doit pas tout changer ou effacer, on doit ajouter et affiner progressivement » (spelling corrected). The first pass replaced too much. The README's Find, Use and Vouch and `docs/01`'s one-liner came back, and only what is false was corrected. So the 40 of 42 figure stays in the README, beside the 26 of 42 that qualifies it, and the "Negative" below no longer holds on that point.

## Context

The README promised "ranked by real use" and "ARP shows who used it", while no third party has reported a result on a skill (`scripts/measure/line-writers.ts`). It also said a fee makes a declaration mean something, against ADR `0138`, and "No score", against ADR `0137`. The user wants what ARP says in public kept apart from the case made to partners.

## Decision

Two public texts and one internal text, kept apart. The message says what a user gets: **Check before your agent installs or pays.** The signature says what it is: **The public pulse for skills and autonomous agents.** `docs/30` is their reference, with what may be claimed today. The argument for partners stays out of this repository and out of `ARP-business-dev`, because both are public.

This does not change what a feature is judged by: the user's "the product is the search" stands until the user says otherwise.

The public wording is "a bigger deposit buys no rank", narrower than ADR `0138`'s "rank is not for sale", because several wallets can still buy several lines. The user can change it on reading.

## Alternatives considered

- **Print the argument.** It claims more than exists today, and it does not tell a reader what they get.
- **Keep "shows who used it" and qualify it.** The headline would still promise what does not exist.

## Consequences

**Positive:** each public sentence states its limit, and the one that will expire has a script that says when.

**Negative:** the message is easy to copy. The 40 of 42 figure leaves the README, since the same evaluation's blind judge preferred the answer without ARP in 26 of 42 pairs (`docs/01`), so it says less than it seemed to. The README grows a column, because each way of installing gets different tools.

**Neutral:** the sites still to do are listed in `docs/30`, and they keep the old wording until then.

## References

- Related doc: `docs/30_THE_POSITIONING.md`, `docs/12_THE_IDEA.md`, `docs/28_THE_SIGNAL.md`
- Related ADR: `0120`, `0137`, `0138`
