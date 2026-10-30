# 0042 — A vault's assets are not evidence of a stake; its position count is

**Status:** Accepted
**Date:** 2026-10-19
**Triggered by:** `docs/tasks/23` — caught by its own gate, on the fixture the task file named in advance

## Context

`docs/tasks/23` wrote the test before the code existed:

> "**one tool demonstrates the whole ladder at once.** IPFS's seven incoming edges include
> `(Infura, uses, IPFS)`, `(Fleek, …)` and `(Pinata, …)` with **zero** stake — free assertions,
> which `docs/14` puts at the bottom as _nothing_ — beside `(Relics by Intuition, …)` at 0.08 across
> 8 positions, with a counter side. Use it as the design fixture: **if those three render like the
> fourth, the page has failed.**"

They did. The first run of the page's read against live mainnet put all seven edges on
`priced-assertion` and marked all seven contested.

The cause is a protocol fact nothing in this repo had written down. Measured on Intuition mainnet
1155, 2026-10-19, IPFS's incoming `uses` edges:

```
Infura   term 1000000            vaults [(curve 1, 0 positions, 1000000)]
         counter_term 1000000    vaults [(curve 1, 0 positions, 1000000)]
Fleek    term 1000000            vaults [(curve 1, 0 positions, 1000000)]
Relics   term 80000000001000000  vaults [(curve 1, 8 positions, 80000000001000000)]
         counter_term 30000000001000000  vaults [(curve 1, 3 positions, …)]
MetaMask term 10000000001000000  vaults [(curve 1, 1 position, …)]
```

`1000000` wei is `getGeneralConfig().minShare`, and it is in **every** vault of **every** created
term, on both the triple and its counter-triple. It is there because the term was created, not
because anyone backed it. The arithmetic was already in the repo and nobody joined it up:
`getTripleCost()` is `1e17 + 2 × minShare` (ADR `0038`'s cost table), and those two `minShare`s are
exactly this dust.

So **`totalAssets > 0n` is true for every edge that exists.** It does not mean "somebody staked". It
means "this term was created".

## Decision

**A deposit is evidenced by a position, not by assets.** Every "is there stake behind this?" check
reads `positionCount > 0`.

In the MultiVault an account holds at most one position per vault, so a **per-vault** position count
is a distinct backer count — which is what `StakerCount` says and what ADR `0023:51-52` states
outright. The dust has no position, because nobody opened one.

**A sum across vaults is not a distinct backer count**, and getting that wrong was the second defect
of this task. `ToolUsage.totals.supportPositions` adds the counts of several edges, so one account
backing two tools is counted twice — and ADR `0023:90-92` lists exactly this as a hazard: _"it is a
trap for whoever reaches for the wrong one."_ The page's first version rendered that sum through
`StakerCount`, whose accessible name is "N distinct stakers", and so claimed a distinctness the sum
does not have. The per-edge rows keep `StakerCount` because each is one vault; the totals say
"across N positions".

Four sites were wrong and are corrected:

| site                                                | was                               | consequence                                                                               |
| --------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------- |
| `app/src/services/tool-usage-view.ts` `tierForEdge` | `totalAssets > 0n`                | every edge rendered as a priced assertion, and every edge as contested                    |
| `scripts/arp-mcp-server.ts` `staked`                | `(totalAssets ?? 0n) > 0n`        | **`staked: true` for all 7 of IPFS's edges**, on the third-party MCP surface              |
| `app/src/components/ModuleList.tsx` `hasStake`      | `metric.totalAssets > 0n`         | every created atom shown as staked (`getAtomCost` carries one `minShare` too)             |
| `app/src/pages/ToolUsagePanel.tsx` `Totals`         | `StakerCount` on a cross-edge sum | claimed "N distinct stakers" for a figure that double-counts an account backing two tools |

The MCP one is the serious one. That surface exists for other agents to read, its response carries
the caveat _"an edge with `staked=false` carries no weight at all"_, and the flag was **never
false** — so the caveat was inert and the field reported `docs/14`'s **nothing** as evidence. Shipped
in `docs/tasks/16` and passed four verifier rounds, because every round tested the shape and none ran it
against a tool with free edges.

A rendered amount is also suppressed when no position exists. `<0.00000001 TRUST` beside a free
assertion invents a tiny market where there is none, which is worse than the bare figure ADR `0023`
is about: it is a figure for capital that does not exist. The page says "Nothing staked." instead.

## A third state, because two were not enough

The same read pairs an **all-curve** `totalAssets` with a `positionCount` scoped to one vault
(`packages/protocol/src/sources/intuition/map.ts:126-137`). Measured on 1155 over the 185 `uses`
edges: **26.232648 TRUST on curve 1 against 219.543848 on curve 2** — **89.33%** of it off the curve
the counts read, now printed by `scripts/measure/stake-vault-placement.ts` rather than asserted. An
earlier version said 91.6%, which neither its own two inputs nor any script produces, while
`packages/protocol/src/tool-usage.ts:22` already carried 89% for the same quantity. So an edge can hold real capital and report zero positions here.

Keying the tier on positions alone would then print _"This is not evidence"_ over a term holding
TRUST. **Live on 1 of 185 edges today** — `2026 FIFA World Cup uses upgraded semi-automated offside
technology`, 4.94 TRUST in the term, no curve-1 position. Reachability before blast radius: live,
n=1, not 91%.

So the page carries an `off-curve` state, which is **not** one of `docs/14`'s five rungs — it is a
statement about the reader, not about the edge. It says capital is behind the claim, on a curve this
page does not read, and shows no figure. Its threshold rests on a **governance floor, not an
observation**: dust is `minShare` per touched vault, ~4e6 wei at most, and the smallest deposit the
protocol _accepts_ is `getGeneralConfig().minDeposit` — 1e16 on mainnet, 1e15 on testnet
(`docs/15_ROADMAP.md:56`). So 1e9 sits 250× above the dust, which is **2.4 orders and not three**,
and seven orders below anything the protocol will take.

This paragraph first argued from "the smallest real stake observed is 1e16". An observation can be
beaten by the next deposit; a protocol floor cannot without governance moving. The code was
corrected and this record was not, so for one commit the reasoning existed only in a commit
message — which is the failure mode an append-only record exists to prevent.

**The real fix is to read `defaultCurveId` from the chain**, which `packages/protocol/src/tool-usage.ts:26`
already assigns to this task and `rules/portability.md` lists under "read it from the chain, not from
a copy". It is deliberately **not** done here, and the page states the mismatch on screen instead.

> ~~It changes the connector's read contract, which the trust panel shares, and that is a connector
> change rather than a page change.~~
>
> **That reason was false, corrected 2026-10-19.** `getToolUsage` already accepts `curveId` in its
> config (`packages/protocol/src/tool-usage.ts:164`, consumed at `:201`), so a caller can hand it a
> chain-read curve with **no** contract change; and the trust panel has its own independent
> `DEFAULT_CURVE_ID` (`packages/protocol/src/sources/intuition/index.ts:52`) rather than sharing
> this one. Every piece of the cheap path is already in the repo.
>
> The real reasons are design ones, and smaller: an extra chain round trip per page load; a cache
> key that currently argues in writing against carrying a curve (`app/src/hooks/use-tool-usage.ts`);
> and **no designed behaviour when the chain's curve differs from the one the positions were read
> on** — which is the case the `off-curve` state papers over. `docs/tasks/23` carries the full version
> and the cost ledger: that deferral has produced one live sort defect, one live counts defect and
> one latent caption defect across three review rounds.
>
> Struck through rather than deleted, because this ADR is the record two other sites point at, and
> because it is the second time in two commits that a correction landed in the code and not here.

## Alternatives considered

- **Threshold the assets above `minShare`.** Rejected: `minShare` is governance-configurable, it
  would have to be read per chain and per plan, and the comparison gets wrong the moment a real
  deposit is smaller than the dust. The position count needs no threshold.
- **Subtract the dust from displayed amounts.** Rejected for the first version. It is defensible —
  the displayed 0.08 is really `0.080000000001` — but the correction is below the rendered precision
  and introduces arithmetic between the chain and the screen for no visible gain. The totals carry
  what the graph reports, and the page's job is not to render an amount nobody staked.
- **Leave the MCP flag and document it.** Rejected. A flag whose documented meaning is the opposite
  of its behaviour is worse than no flag.

## Consequences

**Positive:**

- The ladder renders at different weights, which is `docs/14:156`'s one requirement of this surface.
- The MCP surface stops reporting free assertions as staked. Verified live after the fix: 3 of
  IPFS's 7 edges, which is the true figure.
- `docs/tasks/23`'s gate did the job it was specified to do, against the fixture named for it, a month
  before the code existed. That is the strongest argument in this repo for writing the gate into the
  task file.

**Negative:**

- A fully redeemed position disappears from the count, so an edge that was backed and then abandoned
  reads as free. That is arguably right — nothing is behind it now — but it is a different claim from
  "never backed", and this surface cannot tell them apart.
- Three call sites now encode the same rule. There is no shared helper, because two of them are in
  different workspaces and one is in `scripts/`; the rule is in this ADR instead.

**Neutral (worth knowing):**

- The dust is on **both** vaults, so a counter-triple nobody opposed still reports assets against.
  Every "is it contested?" read has the same hazard.
- It appears on every curve a term has been touched on: Relics' edge carries `(curve 2, 0 positions,
3000002)` as well.
- Atoms have it too, with one `minShare` rather than two — `getAtomCost()` is `1e17 + 1 × minShare`.

## References

- Script: `scripts/measure/stake-vault-placement.ts` reads these vaults across every curve
- Related ADR: `.claude/choices/0023-cohort-listing-reads-the-atom-market-across-every-curve.md` —
  line 9 for "every market cap must carry a position count beside it", lines 51-52 for which
  position count equals a distinct-staker count, and lines 90-92 for the trap this task fell into
- Related ADR: `.claude/choices/0038-the-write-path-is-a-plan-not-a-transaction.md` — the cost table
  the `2 × minShare` comes from
- Related doc: `docs/14_THE_WITNESS_PROBLEM.md:154-165` — the ladder, and the bottom row that "gets
  mistaken for data"
- Related task: `docs/tasks/23-the-tool-surface.md` — the gate, and the fixture it named
