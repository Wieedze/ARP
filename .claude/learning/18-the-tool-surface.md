# 18 — The tool surface

**Task:** `docs/tasks/23-the-tool-surface.md`
**Completed:** 2026-10-19
**Commit:** `94184c4` (the page), `9f7aaab` (`ui-reviewer` round 2), `a808c27` and `7b6b2d5`
(verifier punch lists), all on `feat/agent-panel-tabs`
**Verifier verdict:** PASS — third pass. Two FAILs first: one live render defect introduced by the
round that fixed its sibling, and five claims that had drifted from their sources.

## What shipped

- `app/src/pages/ToolUsagePanel.tsx` — `/tool/atom/:atomId`, lazy-loaded. Five states from one read:
  malformed id, loading, error, the edge list, the empty state. Keyed on an **atom** and a mainnet
  view, deliberately distinct from `/tool/:id` which is keyed on a `ModuleRegistry` id and is
  testnet-only (ADR `0025`).
- `app/src/services/tool-usage-view.ts` — the pure view mapping: the rung per edge, the sort, the
  counts line (`describeCounts`) and the caption predicate (`opensRun`).
- `app/src/hooks/use-tool-usage.ts` — react-query with the key and options exported separately, so
  the contract is testable without a DOM.
- `app/src/components/tool/{tier-scale.ts,UsageEdgeRow.tsx}` — the ladder as type weight; no amount
  renders without its position count, and no amount renders at all when nobody has staked.
- `app/src/components/agent/CapabilitySection.tsx` — `uses-tool` entries now link to the tool page.
  `docs/tasks/20` made that edge render; until now it went nowhere.
- `app/src/services/erc8004-connector.ts` — `fetchToolUsage`.
- Three new scripts: `measure/tool-atom-shape.ts`, `measure/mcp-staked-flag.ts` (exits non-zero on a
  disagreement), `measure/tool-page-states.ts`. `measure/stake-vault-placement.ts` gained the
  per-curve split it had been cited for without computing.
- 34 tests for this task (26 on the view, 8 on the hook's contract). ADRs `0042` and `0043`.
- `docs/tasks/26` — the DOM test environment, with eight itemised defects as its case.

Measured at `7b6b2d5`: app `tsc -b` 0, `eslint .` 0, **239 passed / 2 skipped**, prettier clean on
every touched file, the new script bundles. `packages/protocol` `tsc --noEmit` 0 and **292 passed /
4 skipped** measured at `a808c27` — `7b6b2d5` touches no protocol file, so that gate's scope still
covers the change. **Nothing was signed or sent on any chain**; every measurement was a read-only
GraphQL query.

## Surprises

**The task file's own gate found the defect the task file predicted, a month before the code
existed.** `docs/tasks/23` named IPFS as the design fixture and wrote "if those three render like the
fourth, the page has failed." They did: creating a triple seeds **both** of its vaults with
`minShare`, so `totalAssets > 0n` is true of every edge that exists, and the first live run put all
seven of IPFS's edges on `priced-assertion` and marked all seven contested. This is the strongest
argument in the repo for writing the fixture into the task file rather than into the test: a test
written after the code would have used the code's own assumption.

**The same defect was live on the surface other agents read, and had passed four verifier rounds.**
`scripts/arp-mcp-server.ts` answered `staked: true` for all seven, while its own response carried the
caveat "an edge with `staked=false` carries no weight at all". The flag was never false, so the
caveat was inert. Four rounds tested the shape; none ran it against a tool with free edges. ADR
`0042`.

**The round-2 refactor was right and its consumers were not.** Moving `off-curve` from a sixth
`ProvenanceTier` member to a flag beside `isContested` was the correct shape — and it left two
consumers keyed on the old axis. `describeCounts` counted rungs from `tierCounts`, where an
off-curve edge still carries `free-assertion`, so one edge was counted twice: on the one live
off-curve page the line read `1 free assertion · 1 staked off-curve` above a single row labelled
`Staked off-curve`. `isFirstOfTier` compared `tier` alone, while the row renders from `tier` **and**
`isOffCurve`, so the first genuinely free row after an off-curve one lost its caption — the one
carrying `docs/14`'s _nothing_. **The consumers of a discriminated field are not only its callers**:
grep for every read of the field you re-axed, including the derived ones.

**Both were pure functions sitting in a `.tsx`, which is the only reason they shipped.** Moving them
into `tool-usage-view.ts` closed both with eight tests in the environment that already exists — no
jsdom needed. That is now the first thing to try when a render defect is a pure function of the
view, and it is why two of `docs/tasks/26`'s eight rows are already covered.

**A number can be wrong while every measurement behind it is right, for the fourth recorded time.**
`91.6%` was asserted in two files for the share of `uses`-edge TRUST on curve 2. The real figure is
**89.33%** (219.543848 of 245.776495 TRUST on 1155, 2026-10-19); the ADR's own two inputs could not
produce 91.6% either; and `packages/protocol/src/tool-usage.ts:22` already carried **89%** for the
same quantity, four lines above the line the deferral cites. It survived because the script it was
attributed to did not compute a curve split — the figures lived in that script's own docstring. Same
lesson as `docs/tasks/16`: a number no reader can re-run gets settled against another copy of itself.

**A superlative rots faster than a structural figure, and needs a method as well as a date.** "Largest
support on one tool: 22.69 TRUST (Obsidian)" was three days old and already false — Cursor holds
63.60 by the same method — and the two plausible methods disagree precisely over the curve question
that is this task's central finding. Removed rather than updated. The structural figures from the
same table both held on re-measurement: **84** atoms are the object of a `uses` edge, **64** carry a
position.

**A false reason for a deferral costs more than the deferral.** The recorded reason for not reading
`defaultCurveId` from the chain was "it changes the connector's read contract, which the trust panel
shares." Neither half held: `getToolUsage` already accepts `curveId` in its config
(`tool-usage.ts:164`, consumed at `:201`), and the panel has its own independent constant
(`sources/intuition/index.ts:52`). Every piece of the cheap path was already in the repo. The false
reason made a small fix look structural, which is the opposite of what a deferral note is for. The
true reasons — one extra round trip, a cache key that argues in writing against carrying a curve, and
no designed behaviour when the chain's curve differs from the read one — are smaller and sharper, and
are now recorded with the cost ledger: that deferral's `off-curve` state has produced one live sort
defect, one live counts defect and one latent caption defect across three review rounds.

**Three corrections in two rounds each landed at one site out of two or four**, and the surviving copy
was each time the one other files pointed at. That became `claims.md` check 5 and ADR `0043`, and the
rule caught a fifth instance on itself immediately: `claims.md`'s closing line still said "three of
the four checks" after it had five.

## Decisions made

- **A vault's assets are not evidence of a stake; its position count is.** Four sites corrected,
  including the MCP `staked` flag. ADR `.claude/choices/0042-a-vault-s-assets-are-not-evidence-of-a-stake.md`
- **`off-curve` is a flag, not a rung.** It is a statement about the reader, not about the edge —
  word for word what the same file already said about `isContested`. Carrying it as a rung made the
  sort rank it above the edges the page can read. ADR `0042`.
- **A retraction is greppable, or it is partial.** `claims.md` gains a fifth check. ADR
  `.claude/choices/0043-a-retraction-is-greppable-or-it-is-partial.md`
- **`defaultCurveId` from the chain is deferred, with the true reasons recorded** and the mismatch
  stated on screen. `docs/tasks/23` "Still open, with owners"; ADR `0042` strikes the false reason through
  in place rather than deleting it.
- **No staking control on this page in v1** — ADR `0017`'s seven safeguards are acceptance criteria,
  so they apply the moment a deposit is possible, and this version reads.

## Rules touched

- `.claude/rules/claims.md` — **was missing a check**, now has five. ADR `0043`. The four it had are
  about the step from a measurement to a sentence; this one is about the step from a corrected
  sentence to its copies.
- `.claude/rules/portability.md` — sufficient, but it was **mis-cited**: the `minDeposit` values
  (1e16 / 1e15) are not in it. Its point 3 was rewritten under ADR `0040` and now cites
  `getTripleCost()` and `getAtomCost()`; `minDeposit` appears only in the "read it from the chain"
  list. The values are in `docs/15_ROADMAP.md:56`, which is where the code now points.
- `.claude/rules/ui.md` — sufficient. The dense list, hairline borders, mono for ids and amounts, and
  the empty state that explains rather than pitches all came from it. The page uses `--color-fg-60`
  throughout rather than adding instances of `--color-fg-40`, which `docs/tasks/14` has open at 3.66:1.
- `.claude/rules/code.md` — its component-testing clause (`:86`) is still unsatisfiable. `docs/tasks/13`
  has recorded that since September and `docs/tasks/26` is now its evidence; the two cross-reference in
  `STATE.md`.

## Suggestions for future tasks

- **When a defect is a pure function of the view, move the function before adding an environment.**
  Two of the eight defects on this page closed that way, in the test runner that already exists.
- **Grep every read of a field you change the meaning of**, not only its callers. Both round-3
  defects were derived reads (`tierCounts`, `tier`) of a field whose axis had moved.
- **A figure cited to a script must be printed by that script**, not described in its docstring. The
  docstring is where `91.6%` hid for a commit.
- **Run the gate against the fixture that is hostile to your assumption.** Four rounds of `docs/tasks/16`
  tested the MCP shape; one run against a tool with free edges would have caught the flag.
- **The next page on this surface should not inherit `off-curve`.** Read the curve from the chain
  first — the pieces are in `declare/multivault.ts` and `app/src/lib/intuition-mainnet.ts` — or the
  next reader pays the same three defects.

## Which tier of the evidence ladder does this serve?

**Tier 3, staked** (`docs/09:50-56`), and it serves it by making tier-3 evidence legible rather than
by producing more of it: a tool's standing, as who paid what to say so. It does not move ARP up the
ladder and does not claim to — the three rungs above are struck through on the page with the reason
each is unreadable, which is the same honesty applied upward. What it does move is the ladder's
usability: before this page the `uses` edges were a write path with no reader, so tier 3 existed in
the graph and nowhere a human could act on it.
