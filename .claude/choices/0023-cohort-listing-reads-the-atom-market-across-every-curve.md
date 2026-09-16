# 0023 — The cohort listing reads the atom market across every curve

**Status:** Accepted
**Date:** 2026-09-16
**Triggered by:** `tasks/10-agent-directory-full-cohort.md`

## Context

Task 10 specifies that every market cap on `/agents` must carry a position count beside it, because
these vaults hold one or two positions and a lone number misrepresents them. The task, and the query
verified live before the work started, selected the two figures from different places:

```graphql
term {
  total_market_cap                                          # every bonding curve
  vaults(where: {curve_id: {_eq: $curveId}}, limit: 1) {    # one curve
    position_count
  }
}
```

Reading a real row exposed the mismatch. Captain Dackie's atom
(`0x45078ae5…`) holds two vaults on mainnet:

| curve | market cap (wei)          | positions |
| ----- | ------------------------- | --------- |
| 1     | 1 000 000                 | 0         |
| 2     | 6 336 930 209 821 752 561 | 1         |

`term.total_market_cap` sums both and reports 6.34 TRUST. `vaults(curve_id: 1).position_count`
reports 0. Rendering them side by side prints **"6.3369302 TRUST · 0 positions"** for an agent whose
stake is real and simply sits on curve 2 — the exact failure the position-count requirement exists to
prevent, produced by the mechanism meant to prevent it.

A separate constraint applies: ADR 0009's successor work made the bonding curve a parameter rather
than a literal (`IntuitionSourceConfig.curveId`), and any new market read is required to thread that
variable rather than pinning `"1"`.

## Decision

The cohort listing reads both figures at the **same scope — summed across every bonding curve**:

```graphql
term {
  total_market_cap
  vaults_aggregate { aggregate { count sum { position_count } } }
}
```

`AgentAtomMarket` therefore carries `totalMarketCap`, `positionCount` and `vaultCount`, and its
doc comment states outright that this `positionCount` is a count of **positions, not of distinct
stakers** — an account staked on two curves is counted twice. `MarketSide.positionCount`, which is
scoped to a single vault, remains the one that equals the distinct-staker count, and the panel keeps
using it.

The consequence for the curve parameter is that the cohort read takes no curve at all. It makes no
curve-scoped read, so it pins no curve literal and needs no curve variable. The trust panel, which
does read one curve because a stake lands in one vault, continues to pass the curve
`getBondingCurveConfig()` reports.

The UI states the scope where the numbers appear: `1 position · 2 curves`.

## Alternatives considered

- **Display the curve-scoped pair (`vaults(curve_id).market_cap` + its `position_count`)** — internally
  consistent, but the list is _ordered_ by `term.total_market_cap`, so the displayed number would not
  be the number the rows are sorted on. AsterPay's 13.02 TRUST would vanish from the top of the
  "most staked" order while still occupying its first row. An order whose column does not descend is
  a worse lie than a scope note.
- **Display both pairs** — four numbers in a row of a dense list, for a distinction that matters to
  perhaps a dozen agents in 28,648. Rejected on `ui.md` grounds.
- **Keep the mismatched pair and footnote it** — a footnote does not undo "6.34 TRUST · 0 positions"
  read at a glance, and the glance is what a list is for.
- **Sum only the curves with a non-zero position** — arithmetic nobody asked for, producing a figure
  that matches no field in the graph and cannot be checked against it.

## Consequences

**Positive:**

- The two figures in a row describe the same thing, and the row's market cap is the value its
  position in the order was decided by.
- No curve literal enters the cohort query, and no curve variable has to be threaded through a read
  that does not need one.
- The distinct-staker claim is not made where it cannot be supported. It is still made on the panel,
  where it can.

**Negative:**

- `AgentAtomMarket.positionCount` and `MarketSide.positionCount` mean subtly different things. The
  types say so and the two describe helpers (`describeAtomPositions`, `describeStakers`) are
  deliberately worded apart, but it is a trap for whoever reaches for the wrong one.
- A reader moving from the directory to the panel sees a market cap that summed every curve replaced
  by one scoped to a single vault, with no on-screen bridge between them. Not wrong on either page;
  unexplained across the pair.

**Neutral (worth knowing):**

- `vaults_aggregate.aggregate.count` is the curve count, which is what makes the scope statable in
  the UI rather than merely true.
- Two curves exist on mainnet today. If the MultiVault gains more, the listing absorbs it with no
  change; the panel would need the curve it is told to read, which it already takes as a parameter.

## References

- Related rule: `.claude/rules/ui.md`, `.claude/rules/code.md`
- Related doc: `docs/08_ERC8004_AGENT_LAYER_OPPORTUNITY.md`
- Related ADR: `.claude/choices/0018-trust-panel-design-and-join.md`,
  `.claude/choices/0019-erc8004-connector-surface-deviations.md`
- Task: `tasks/10-agent-directory-full-cohort.md`
