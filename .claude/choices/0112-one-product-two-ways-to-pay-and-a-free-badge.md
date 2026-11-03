# 0112 — One product, two ways to pay, a data licence for aggregators, and a free badge

**Status:** Accepted
**Date:** 2026-11-02
**Triggered by:** user decision, 2026-11-02: _« oui je valide »_, on the two ways to pay and the
free badge; the data licence was the user's own pick from the same exchange (_« ça peut être un
super argumentaire »_).

## Context

ADR `0094` says agents pay to consult ARP, in USDC over x402, and tools never pay. That covers a
payer that is an agent. It says nothing about a human or a team who wants the same reads with a
card, or about a registry that wants ARP's usage data in its own listings.

The business plan (`Wieedze/ARP-business-dev`, `plan/plan-de-demarrage.md` and `plan/next-steps.md`)
also scheduled a "badge test at 1 € per agent per month" for March 2027. Charged to a tool's author,
that contradicts "tools never pay".

## Decision

1. **One product, two ways to pay.** Agents pay per consult in x402 USDC, without an account. Humans
   and teams pay the same product by card subscription, with an API key and quotas. Neither rail
   buys a place in an answer.
2. **Aggregators buy a data licence.** Glama, Smithery, HOL, 8004scan or an enterprise registry get
   a ready-to-display feed per tool in their catalogue: how many agents use it, whether it answers,
   whether it changed. It comes with a service commitment. The data itself stays public on the
   graph and free to read. What is sold is not having to read, clean and maintain it.
3. **The badge stays free.** "Used by N agents" is distribution, as shields.io's badges were. The 1 €
   test is dropped.

ADR `0102` is unchanged: on testnet 13579 consulting ARP is free, and x402 waits for the mainnet
port. That makes the licence the one revenue line that does not depend on the port.

## Alternatives considered

- **x402 only** (ADR `0094` as it stood): rejected. A team with a card and no wallet has no way to pay.
- **Charging what arrives without the plugin**: rejected. Those agents are the third parties the
  plan's gate counts, so charging their first contact slows the one thing the plan must show.
- **A paid badge for tool authors**: rejected. It is a tool paying, which ADR `0094` forbids, and it
  removes the badge's reason to spread.

## Consequences

**Positive:**
- Two revenue lines that need no mainnet port: subscriptions and licences.
- Neutrality holds: every payer buys access or delivery, never a rank.

**Negative:**
- A card rail means accounts, billing and invoices, which x402 avoided. It is not built.
- The licence is an assumption. No aggregator has said it would pay, and the feed is worth little
  until third-party agents declare.

**Neutral (worth knowing):**
- Dune and The Graph are the comparison used in the plan: both sell convenient access to chain
  data that anyone can read. Neither was asked about ARP.

## References

- Related ADR: `.claude/choices/0094-arp-is-the-directory-and-the-verifier-never-the-relay.md`
- Related ADR: `.claude/choices/0102-x402-is-for-mainnet-testnet-is-free.md`
- Related ADR: `.claude/choices/0076-arp-plans-a-payment-and-never-holds-one.md` (money follows usage; ARP plans payments, never holds one)
- Business plan: `Wieedze/ARP-business-dev`, `plan/plan-de-demarrage.md` § Modèle économique
