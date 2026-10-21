# 0049 — ARP does not calibrate, and the positioning says what it does instead

**Status:** Accepted
**Date:** 2026-10-20
**Triggered by:** user decision — _« on ne peut pas calibrer ou noter la calibration de notre
côté »_ — closing the conflict flagged in `docs/01` earlier the same day.

## Context

`docs/01` opened with _"Domain-dimensional calibration is ARP"_ and called _"calibration over volume"_
the core innovation: an agent's weight in a domain determined by **the accuracy of its past
attestations**. `docs/02`, the locked architecture, carried it as component 4 (a forked indexer
outputting calibrated scores) and named the calibration algorithm _"the differentiation"_.

ADR `0046` had already decided ARP publishes no score. Calibration is a score — and a harder one,
because measuring whether an attestation was _right_ needs **ground truth**, which is why `docs/12`'s
very first drift signal is proposing it. The two could not both stand, and the document that had to
change was the older one.

`docs/12` had been deferring the collision rather than resolving it: calibration was "a **later
layer** on top of this one". That reading is no longer available, because the user's decision is not
about sequencing.

## Decision

**ARP does not calibrate, and does not score anyone's calibration.** Not later, not as a layer
above. It is removed from the positioning, from the locked architecture's component list, and from
the differentiation claims.

**What replaces it** — four properties, each built and measurable, none of which is a score:

1. **The input is priced, not free.** A deposit on a claim about use, bounded by a cap its operator
   signed. `docs/12` points 3 and 5.
2. **It is written in the capability vocabulary, not the trust vocabulary.** `uses`, `has tag`,
   `implement` — so what ARP writes is a claim about **composition**, and reputation is what emerges
   when money sits on one. Trust providers write elsewhere in the graph (ADR `0048`), which is why
   Deep3 is not a competitor rather than a better-resourced one.
3. **ARP holds nothing** — no key (ADR `0038`), no request path (ADR `0045`), and no data: the
   reputation is atoms, triples and positions on a public graph, so an operator adopting ARP is not
   betting on ARP surviving.
4. **The position is the measure, so the signal is live.** It can be withdrawn ~~and the counter-claim
   staked~~, which is what separates it from an accumulated total (ADR `0046`).

   **Amended by ADR `0056`, 2026-10-21.** The withdrawal half carries this on its own: measured on
   mainnet 1155, 1 of the 185 `uses` edges has ever had its counter-claim staked, and 969 of 285,775
   triples chain-wide (`scripts/measure/counter-side-usage.ts`). The fourth ADR to carry this premise
   and the last to be found — `rules/claims.md` §5.

The one-liner becomes: _identity is ERC-8004, the trust graph is Intuition, **the priced declaration
of use is ARP**._

## Alternatives considered

- **Keep calibration as a far-future layer.** What `docs/12` already said, and it is what the user
  overruled. It also has a cost while it sits there: it is the answer the project reaches for when
  asked what makes it different, and it is the one thing it cannot deliver — so every positioning
  conversation ends on an unbuilt differentiator instead of four built ones.
- **Keep it and drop ADR `0046`.** Coherent, and it makes ARP a scoring platform competing with
  Deep3 on Deep3's own surface, from 28,644 edges behind, with a ground-truth problem nobody has
  solved. Rejected on both counts.

## Consequences

**Positive:**

- The positioning now describes what exists. Every one of the four replacements is running code with
  a measurement behind it.
- `docs/02`'s component 4 (forked indexer) and the Merkle-checkpoint plan built on it fall away with
  it — infrastructure that was never built and is no longer wanted.
- The ground-truth problem leaves the project. `docs/04`'s seed modules name "aggregated consensus
  from high-calibration agents" as a ground-truth source; that circularity is no longer anyone's
  problem to solve.

**Negative:**

- **ARP gives up the claim that it can tell a good agent from a lucky one.** Nothing in the mechanism
  measures correctness, and that is now a stated limit rather than a deferred feature. A buyer who
  wants calibrated accuracy will not find it here, and should not be told it is coming.
- `docs/11_CALIBRATION_PLAN.md` is a whole document arguing the opposite. It is marked historical
  rather than deleted — the router already classes `08`, `09` and `11` as analysis and not
  commitment, and its measurements stand.

**Neutral (worth knowing):**

- Reading someone else's calibration is a separate question and still refused for a separate reason:
  `docs/12`'s drift list calls scoring agents from other providers' assessments "distribution, not
  the product".
- `docs/03`'s out-of-scope list already contained the calibration algorithm and the indexer. It said
  "deferred to later milestones"; for these two items it is now removal, and the list says so.

## References

- Related ADR: `0046` (ARP scores nobody — this applies it to the oldest positioning claim), `0048`
  (the capability vocabulary versus the trust vocabulary), `0038`, `0045`
- Related doc: `docs/01_PROJECT_CONTEXT.md` (one-liner, "What ARP is", differentiation),
  `docs/02_ARCHITECTURE.md` (component 4 and the storage table), `docs/12_THE_IDEA.md` (the first
  drift signal), `docs/03_MVP_SCOPE.md`, `docs/11_CALIBRATION_PLAN.md` (historical)
