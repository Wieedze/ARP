# Task 23 — The tool surface

> **Status: COMPLETE** 2026-10-19 · commits `94184c4`, `9f7aaab`, `a808c27`, `7b6b2d5` ·
> post-mortem `.claude/learning/18-the-tool-surface.md` · `ui-reviewer` PASS round 2,
> `task-verifier` PASS round 4.
>
> Five review rounds in all, and the page's logic was right from the first commit. What failed was
> the step from a measurement to a sentence — a percentage the repo already held correctly four
> lines away, a superlative that rotted in three days, a deferral reason that was false, and three
> corrections that each landed at one site out of two or four. That last pattern became
> `claims.md` check 5 and ADR `0043`. **This is the thing `docs/12` describes**,
> and the reason the `uses` edges are worth writing at all.
>
> The page is `app/src/pages/ToolUsagePanel.tsx` at `/tool/atom/:atomId`, with
> `services/tool-usage-view.ts`, `hooks/use-tool-usage.ts`, `components/tool/` and 26 tests (18 on the view, 8 on the hook's contract).
>
> **The dependency line was wrong and is removed.** It said "depends on `tasks/19` steps 2–5" — the
> write path. The page reads edges that already exist, and this file's own measurement says so (84
> atoms, 64 with positions). Nothing was blocked.
>
> **The gate found the defect this file predicted a month earlier**, in its own words: _"if those
> three render like the fourth, the page has failed."_ It did. Creating a triple seeds both of its
> vaults with `minShare`, so `totalAssets > 0` is true of every edge that exists, and all seven of
> IPFS's rendered as priced. Keyed on the position count now — live: 3 priced, 4 free. ADR `0042`,
> which also fixes the same defect in `scripts/arp-mcp-server.ts` (it answered `staked: true` for
> all seven, on the surface other agents read) and in `ModuleList.tsx`.
>
> A review then found the same defect surviving in the sidebar, where **20 of the 84 live tool pages
> printed a figure beside a banner saying nobody had staked anything**. Gated, verified against one
> of the twenty, and the figure is now produced by `scripts/measure-tool-page-states.ts` rather than
> asserted — it reports 64 rendering, 19 free-only and 1 off-curve, and names the off-curve atom so
> the n=1 claim is checkable.

## The gap

`docs/12_THE_IDEA.md`: an agent is composed of modules; after it runs it stakes TRUST on the modules
it used, which builds reputation **for the tool and for the agent at once**.

Half of that does not exist. The app shows agents and their trust providers. **Nothing shows a tool
with its weight** — no page, no list, no number. There is no surface that says:

> this tool was used by these agents, who put this much behind it, and this much against

Without it the `uses` edges are a write path with no reader, and nobody can act on them.

## What bounds it

**Corrected 2026-10-16.** An earlier version of this file said the surface does not exist. That was
the _agent_-side figure — 194 `use` triples against 88,243 agents, and `use` is the other predicate — so it is the wrong number for
this task. Measured on the **tool** side, by walking the objects of those edges:

|                                                     |                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| distinct atoms that are the object of a `uses` edge | **84**                                                               |
| of those, carrying at least one position            | **64**                                                               |
| largest support on one tool                         | **superlative removed** — see below                                  |
| a tool with real opposition                         | IPFS — 0.10 TRUST for across 10 positions, **0.03 against across 3** |

So the surface exists in miniature, and the disagreement mechanism has already been used at least
once. The first version has real data to show.

**The "largest support" superlative is gone rather than updated, and that is the lesson.** It said
22.69 TRUST (Obsidian) and was dated "Corrected 2026-10-16" with no script named. Re-measured three
days later: Obsidian is third by one method and not in the top four by another — and the two methods
disagree because one sums every bonding curve and the other reads the curve the positions are scoped
to, which is this task's own central finding. A superlative needs a method as well as a date, and a
leaderboard in a task file rots while every structural figure around it holds. The structural ones
do hold, re-measured: **84** atoms are the object of a `uses` edge and **64** carry at least one
position (the complement, 20 of 84, is what gates the page's sidebar).

**Concentration is the thing to design for, not emptiness.** GitHub shows 22.59 TRUST across 6
positions — **of which one position is 22.44**. The figure alone reads as a market when it is one
account's conviction. So a weight never renders without its position count, and ideally not without
its spread.

**And one tool demonstrates the whole ladder at once.** IPFS's seven incoming edges include
`(Infura, uses, IPFS)`, `(Fleek, …)` and `(Pinata, …)` with **zero** stake — free assertions, which
`docs/14` puts at the bottom as _nothing_ — beside `(Relics by Intuition, …)` at 0.08 across 8
positions, with a counter side. Use it as the design fixture: if those three render like the fourth,
the page has failed.

An empty state is still needed for the other ~88,000 atoms nobody has declared, per `rules/ui.md`:
it explains what would be there and how to make it appear, and is not a marketing pitch.

## What a tool is, mechanically

No new namespace (`docs/14`, and ADR `0025` was right for this reason): in ERC-8004 plus MCP the tool
layer and the agent layer are the same layer.

- a tool is an atom — usually one that **already exists**, because the tool is a registered agent
- `(agent, uses, tool)` is a triple, which gets a stakeable vault **and** a counter-triple for free
- the tool's weight = deposits across its incoming `uses` edges
- its effectiveness = support against counter on those edges

So the read is: for a tool atom, walk `as_object_triples` filtered on the `uses` predicate, and for
each edge read both vaults.

## Do

1. ~~A service that, given a tool's atom id, returns its incoming `uses` edges with each edge's
   subject (the agent), its vault and its counter-vault.~~ **DONE** — `getToolUsage` in
   `packages/protocol/src/tool-usage.ts`, exported from the connector, 10 tests, verified against live mainnet
   on Obsidian, GitHub and IPFS.
2. ~~A route and a page. Two columns per `rules/ui.md`: identity left, the edges right. Dense list,
   mono for ids and amounts, hairline borders.~~ **DONE** — `/tool/atom/:atomId`, lazy-loaded like
   the other mainnet routes (measured: static import grew the entry chunk 16 kB and dissolved the
   connector's own chunk into it).
3. ~~**Render the provenance tier of each edge**~~ **DONE, with two of the five rungs and the other
   three named.** Only `priced-assertion` and `free-assertion` are derivable from an edge and its
   vaults; `fact`, `confirmed-by-both` and `tool-declared` need data nothing reads yet and are struck
   through on the page with the reason. A sixth state, `off-curve`, is **not** a rung — it is a
   statement about the reader, for the 1 of 185 live edges holding TRUST on a curve the counts are
   not scoped to (ADR `0042`). Original spec below.

   **Render the provenance tier of each edge**, from `docs/14`'s ladder: a payment or an on-chain call
   is a fact; both parties agreeing is confirmed; the tool alone is a third party's word; the agent
   alone with stake is a priced assertion; the agent alone for free is **nothing**. A page that
   renders the bottom row like the others has made things worse than before it existed.

4. ~~Link it from the agent panel~~ **DONE** — `CapabilitySection.tsx`, `uses-tool` entries link to
   `/tool/atom/${sourceHandle}`. The internal link wins over the object's own external URL, because
   the tool's standing is what the panel cannot otherwise show.
5. ~~The empty state~~ **DONE.** Not "~88,000 atoms", which is a count of ERC-8004 identities on
   **Base** (`docs/12:10`) and not of Intuition-mainnet atoms — that population has not been
   measured. 84 atoms are the object of a `uses` edge on 1155. The copy carries no measured figure
   at all: a number on screen rots where nobody can re-run it.

## Out of scope

- A ranking or a score. Composing edges into one number is a separate decision and needs its own ADR.
- Writing edges — that is `tasks/19` steps 2–4.
- Any staking control on this page in the first version. Reading first; `ADR 0017`'s seven safeguards
  apply the moment a deposit becomes possible, and they are acceptance criteria, not advice.

## Do not do in this task

- Do not invent a tool namespace. Resolve the atom through the existing identity path.
- Do not show a weight without its position count. ADR `0023` and the `StakerCount` precedent: these
  vaults hold one or two positions, and a bare TRUST figure suggests a depth of opinion that is not
  there.
- Do not fill an empty page with example data presented as real.

## Gate

One tool page, rendered from live mainnet data, showing at least one real incoming `uses` edge with
its two vaults and its provenance tier — plus the empty state for a tool with none.

## Gate — met 2026-10-19

Run read-only against live mainnet 1155, nothing signed:

```
IPFS   0x6cf977f2…  7 edges   3 priced · 4 free   sidebar: 0.1 TRUST across 10 positions
Colony 0x014f7789…  1 edge    1 free              sidebar: gated, shows nothing
0xdede…             no edges                      the empty state
```

IPFS is the fixture this file named: `Relics by Intuition` priced at 0.08 across 8 positions with
0.03 against across 3, beside `Infura`, `Fleek`, `Pinata` and `AnyType` at nothing. They render at
different weight, which is `docs/14:156`'s one requirement of this surface.

## Still open, with owners

- **Read `defaultCurveId` from the chain** in `getToolUsage`. `packages/protocol/src/tool-usage.ts:26`
  assigns it here. Deferred, and **the reason first written down was false**: it said the fix
  "changes the connector's read contract, which the trust panel shares". Neither half holds —
  `getToolUsage` already accepts `curveId` in its config (`tool-usage.ts:164`, consumed at `:201`),
  so a caller can hand it a chain-read curve with no contract change, and the trust panel has its
  own independent constant (`sources/intuition/index.ts:52`) rather than sharing this one. Every
  piece is already in the repo: `declare/multivault.ts` reads `defaultCurveId()` from the chain and
  `app/src/lib/intuition-mainnet.ts` exports a mainnet client.

  **The real reasons are design ones, and they are smaller but sharper**: an extra chain round trip
  per page load; a cache key that currently argues in writing against carrying a curve
  (`use-tool-usage.ts:24`); and **no designed behaviour when the chain's curve differs from the one
  the positions were read on** — which is the case the `off-curve` state papers over. That state has
  now cost one live sort defect, one live counts defect and one latent caption defect across three
  review rounds, so the next reader should know the fix is small and the design question is the
  blocker. ADR `0042`.

- **No DOM test environment in `app/`** (ADR `0011`) — now **`tasks/26`**, which `tasks/13` has
  recorded as an open gap since September; both rows are in `STATE.md` and now cross-reference each
  other. `tasks/26` carries the eight defects three review rounds found on this one page as its
  case. Each was one render assertion away from being
  caught, and three were live on mainnet data.
- **`--color-fg-40` is 3.66:1, below AA** (`tasks/14`). This page uses `--color-fg-60` throughout
  rather than adding two new instances.

## What round 2 changed, and the design it corrected

The `off-curve` state was first carried as a sixth `ProvenanceTier` member. That was wrong, and the
file said so three lines down without noticing: `isContested` is documented as _"not a rung — an
orthogonal signal on the same edge"_, which is word for word what off-curve is. Carrying it as a
rung forced it to pick a tone in the rung table, put a non-rung in `DERIVABLE_TIERS`, made the
partition test carve it out — and made the sort rank it **above** the edges the page can read,
because it sorted on the all-curve figure the page is forbidden to display. Live on 1 of 84 pages.

It is `isOffCurve` now, beside `isContested`. `ProvenanceTier` is back to `docs/14`'s five rungs,
the sort groups by rung before weighing, and six comments that had drifted into describing a
two-state world became true again — which is the sign the refactor was the right shape rather than
a tidy-up.

Also closed: the counts line read `1 priced assertion · 1 staked off-curve · 3 free assertion`
(ungrammatical on the gate fixture itself); `DUST_CEILING`'s safety rested on "the smallest stake
observed" rather than on `minDeposit`, which is a governance floor and cannot be beaten by the next
deposit; a dead `<span>` left by the contrast fix; an unreachable null branch; and `OtherMarket`
opened with "Everything above…" while rendering on the empty state.

And the live `3 of 7` check on the MCP `staked` flag is now `scripts/measure-mcp-staked-flag.ts` —
it compares the server's flag against the graph's own position counts and exits non-zero on a
disagreement, so the figure is re-runnable rather than observed. That flag is one of the three sites
ADR `0042` had to fix, which makes it the one most likely to rot again.

## Which tier of the evidence ladder does this serve?

**Tier 3 (staked), and it is the first surface where the ladder is the subject rather than the
method.** The panel makes one provider's opinion of one agent checkable; this makes a tool's standing
legible, and legible specifically as _who paid what to say so_.
