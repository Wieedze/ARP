# 0048 — ARP does not mirror ERC-8004 feedback; it reads it beside its own claims

**Status:** Accepted
**Date:** 2026-10-20
**Triggered by:** user decision — _« ne pas miroiter du tout est surement la bonne idée »_, closing a
question raised by `arp_rate_agent` and sharpened by the user's own objection: _« miser sur 1 avis
c'est inutile »_.

## Context

ERC-8004's Reputation Registry holds **569,148** feedback entries on Base 8453 (8004scan.io,
2026-10-20, `scripts/measure-erc8004-feedback.ts`), and it is where the ecosystem looks. The question
was whether ARP should bring them onto Intuition so they can be staked on.

**The user's objection is the documented anti-pattern, independently re-derived.** `docs/07:71`:
_"do not write mutable scores as direct Triples. Creating a new `(agent, has score, 87)` Triple every
time a score updates **fragments the staking surface** and forces consumers to migrate."_ One triple
per opinion turns 569,148 opinions into 569,148 vaults with nothing on any of them.

Two further facts settled it:

- **There is no feedback predicate in the canon.** `docs/07` Appendix B has none, so mirroring would
  mean minting one — ADR `0030`'s exact cost, which this project already paid with 21 permanently
  stranded triples.
- **The feedback carries no exposure.** It is free, and the mean score across every chain 8004scan
  indexes is **95.09 / 100**. Importing it into a market would price noise.

And a framing that had never been written down, which is what made the answer clear. **ARP writes in
the capability vocabulary, not the trust vocabulary:**

| family     | predicates                                                                                               | ARP        |
| ---------- | -------------------------------------------------------------------------------------------------------- | ---------- |
| capability | `has type`, `implement`, `use`, **`uses`**, `compatible with`, `available on`, `has tag`, `has category` | **writes** |
| trust      | `has trust provider`, `has trust assessment`                                                             | reads only |

So what ARP writes is a claim about **composition**, not about reputation. Reputation is not written;
it **emerges** when money sits on a composition claim. That is why ARP is not competing with Deep3 —
they write in the trust vocabulary, ARP writes in the capability one. Different parts of the graph.

## Decision

**ARP does not mirror ERC-8004 feedback onto Intuition.** No triple per opinion, no triple per
rater, no invented predicate. The feedback stays in the registry the ecosystem already reads.

What ARP does instead is **read both surfaces and render them at different weights, never summed**:

| surface                           | what it is                | weight                                      |
| --------------------------------- | ------------------------- | ------------------------------------------- |
| `(agent, uses, tool)` + its vault | ARP's own, **priced**     | a deposit under a cap someone signed        |
| ERC-8004 feedback                 | the ecosystem's, **free** | rung 5 of `docs/14:159` — nothing by itself |

`docs/14:156` already forbids the alternative: _"what the interface must never do is render these at
the same weight."_

**Consequently `arp_rate_agent` is not built.** With no mirror, preparing a free `giveFeedback` call
is a trivial contract call any ERC-8004 library already makes, carries no weight, and is not ARP's
surface. A read that shows the two side by side is the useful tool, and it needs no new predicate and
no second chain to write to.

## Alternatives considered

- **One vault per (rater, agent) pair**, via the canonical four-triple trust pattern with the
  counterparty as provider. Non-fragmenting and needs no new predicate. Declined because it puts an
  ordinary agent into a slot that three dedicated scoring companies occupy — measured 2026-10-20,
  `has trust provider` carries 28,683 edges over **three** objects, Deep3 at 99.86%
  (`scripts/measure-trust-provider-objects.ts`) — so readers filter on known providers and the claim
  would be written where nobody looks for it.
- **One claim per agent** (`agent is trustworthy`, feedback as evidence behind it). Rejected: no
  falsifiable subject, which is `docs/12`'s drift signal.
- **Stake on the rater, not the rating** — one vault per account whose feedback is worth reading.
  Genuinely non-fragmenting, and `docs/12` already declines it: _"weight sentiment by staker track
  record → interesting, and not this. It has no falsifiable subject."_ Left declined, but note it was
  declined **without measurement**; the figure that would inform it is the number of distinct raters
  behind the 569,148 entries, which nobody has counted.

## Consequences

**Positive:**

- No new predicate, so none of ADR `0030`'s failure mode is available here.
- No second chain to write to. Everything ARP writes stays on Intuition; the feedback stays on Base.
  `rules/portability.md` rule 2's cross-chain join is not widened.
- The two surfaces stay legible as two. A consumer can see that an agent has 40 free reviews and
  nobody has paid a cent behind any claim about it, which is a finding and not a gap.

**Negative:**

- **Reading the feedback has a third-party dependency.** The Reputation Registry exposes no counter,
  and `eth_getLogs` over its history is refused by every free RPC (checked 2026-10-20), so today the
  only way to read it at scale is 8004scan.io — an index ARP does not control and cannot verify.
  A paid archive RPC or our own indexer removes that; neither exists.
- ARP contributes nothing to the 8004 reputation surface. That is deliberate, and it means an
  ecosystem participant who looks only there sees nothing of ARP.

**Neutral (worth knowing):**

- This does not forbid _reading_ the Reputation Registry, and the side-by-side view is the first
  thing that would use it.
- It also does not forbid an agent writing feedback there. It says ARP neither mirrors it nor
  provides the tool to write it.

## References

- Related ADR: `0046` (ARP scores nobody — this is the same principle applied to someone else's
  score), `0030` (a predicate is chosen on meaning; 21 triples stranded by getting it wrong),
  `0042` (what a vault's figures do and do not prove)
- Related doc: `docs/07_INTUITION_ERC8004_PARTNER_GUIDE.md:71` (the fragmentation anti-pattern),
  `docs/12_THE_IDEA.md` (the drift list), `docs/14_THE_WITNESS_PROBLEM.md:156` and `:159` (never at
  the same weight; the ladder)
- Measurements: `scripts/measure-erc8004-feedback.ts`, `scripts/measure-trust-provider-objects.ts`
