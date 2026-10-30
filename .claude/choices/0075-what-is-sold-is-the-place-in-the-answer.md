# 0075 — What is sold is the place in the answer, and your place comes from others

**Status:** Accepted
**Date:** 2026-10-29
**Triggered by:** user decision, 2026-10-29, after a day of positioning work — « ok pour les 3 »

## Context

ARP had no statement of what it sells. The nearest thing was "a registry pointing at AI things",
which describes the shape and not the trade, and a day of work went into measuring why the obvious
candidates do not hold:

- **not verification.** A runtime is unobservable from outside and no protocol changes that
  (`docs/14`). 31 of the 53 catalogued tools are skill repositories, which touch no third party at
  all, so a usage claim about them can never be grounded.
- **not a prediction market.** Intuition never resolves, so there is no oracle and no settlement.
- **not a two-sided market on claims.** Measured on mainnet 1155, 2026-10-28: 968 of 286,064
  triples carry a contradiction — 0.34%. And that is a special case of nobody participating at all:
  6,410, or 2.24%, have a second position of any kind.

What remains, and what an independent study of the ERC-8004 ecosystem confirms is missing, is the
decision of **which agents and tools get called**. That study found 3% / 4% / 15% of registrations
expose a live endpoint and 73.5% / 59.2% / 90.6% of reviewers show coordinated Sybil behaviour,
concluding the registry "cannot function as a trust signal" (`docs/19`).

Today that decision is made by whoever wrote the config. At scale it is made by a search, and the
ranking of that search is the scarce thing.

## Decision

**What ARP sells is the place in the answer.** An agent names a need, receives an ordered list, and
that order is what participants compete for by depositing TRUST behind their claim.

**And a participant's place comes from other people's deposits, not from its own.** When ranking, a
deposit whose depositor and whose subject resolve to the same owner counts far less than a deposit
from a third party. The two are reported separately and never summed.

The second half is what keeps the first from being an advertising auction. Without it, the operator
with the most TRUST is first by construction.

## Alternatives considered

- **A directory.** Honest, and it is what the MCP registry already is with 11,582 entries and no
  field for what a server does. Nobody pays for a directory, and it gives no reason for anyone to
  deposit anything.
- **A reputation score.** Rejected previously by ADR `0046` and still rejected: ARP composes no
  score, and a badge granted by two metrics is two metrics somebody farms.
- **Rank by total stake alone.** This is the advertising auction. Measured cost of faking it: 100
  addresses holding `minDeposit` is 1 TRUST on mainnet 1155.
- **Rank by position count alone.** Same attack, same price. The count and the amount are each
  cheap to fake in one direction, which is why both are shown.

## Consequences

**Positive:**

- There is something to buy, and buying it is **refundable** — a position redeemed leaves the index
  the same block, and the stake comes back minus fees.
- It is **contestable** without anybody's permission: every triple is born with a counter-triple.
- The self-versus-third-party split is free to compute. `ownerOf` on each side, one `eth_call`.
- It gives the domain tree its purpose: the query an agent names is a domain, so the thing being
  competed for is position *within a need*, not a global ranking.

**Negative:**

- Money still buys **consideration**. It does not buy standing, but a well-funded newcomer is
  visible on day one and an unfunded good tool is not. That is the trade, and it is only acceptable
  because the ranking also reads things money cannot buy.
- Self-deposits still count for something, so the rule is a weighting and not an exclusion. An
  operator who funds ten addresses and has them back each other defeats a naive owner check; the
  answer to that is standing, which this ADR does not yet define.

**Neutral (worth knowing):**

- Nothing here requires agents to hire agents, a payment rail, or a supply of callable agents —
  ~~measured at 3–15%~~, that supply does not exist. It requires a search people use.

  **Corrected 2026-10-29.** "3–15%" reads as an interval and is not one. It welded a **count** to a
  **percentage** from a different measurement: ARP probed 122 parsed registration documents on Base
  and **3 answered — 2.5%, Wilson 95% CI 0.8–7.0%** (`docs/14`); the third-party study reports
  **15%** on a looser definition of callable. Two measurements, two numbers, and `claims.md` §2
  forbids summing them into one. The conclusion is unchanged and is the stronger for being stated
  as two: whichever is right, the supply is not there.
- The ranking must read at least one thing money cannot buy for the negative above to be bounded.
  Today that is `reachable`, which is why ~~ADR `0077`'s~~ that work comes first.

  **Corrected 2026-10-29.** This reserved `0077` for the `reachable` work and **`0077` is now
  "the unit is the skill, not the repository"** — a reader following the pointer lands on the wrong
  document. No ADR covers `reachable` yet; `packages/protocol/src/reachability.ts` and
  `docs/14_THE_WITNESS_PROBLEM.md` are what exist. Reserving a number in prose is how this happens,
  so: do not.

## References

- Related doc: `docs/19_THE_GAP_A_THIRD_PARTY_MEASURED.md`, `docs/14_THE_WITNESS_PROBLEM.md`
- Related ADR: `0046` (ARP composes no score), `0042` (positionCount, not assets),
  `0074` (one tag at the deepest domain)
- Measurements: `scripts/measure/counter-side-usage.ts`, `scripts/measure/curve-split.ts`
