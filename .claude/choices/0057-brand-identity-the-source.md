# 0057 — Brand identity v0.3: The Source, Saffron, Archivo + Geist Mono

**Status:** Proposed
**Date:** 2026-10-21
**Triggered by:** user request — art direction for the MVP, built in the "ARP · Brand identity" design canvas (pages v0.3 Identity and v0.4 Components).

> **Renumbered from 0032 on arrival, 2026-10-22.** `0032` is taken by *the `use` edge is a claim
> about the identity* — the ADR that fixes the subject of every triple ARP writes, cited from eight
> places. The handoff drafted this as `0032` and `HANDOFF.md` step 0 says to copy it there, which
> would have overwritten it. Nothing else about the decision changed.
>
> **Four of the handoff's assumptions about this repo are stale**, because it was written against the
> tree before 2026-10-21's deletions. Recorded here so nobody re-derives them:
>
> | the handoff says | actually |
> | --- | --- |
> | `ModuleList` moves to `/modules`; `/tool/:id`, `/modules/new` need the new pattern | all three pages are **deleted** — `ModuleRegistry` went with ADR `0025`/`0051`/`0055`. There is no module surface to restyle. `/tools` and `/tool/atom/:atomId` are the live equivalents |
> | domain tabs come "from the seed manifest domains" | `scripts/manifest-modules.json` is **deleted**. Tool domains have no seed source; the catalogue reads the graph |
> | the profile page is new, at `/profile` | it **exists**, at `/me`, built 2026-10-21. The user asked for the route to be `/profile`, which is the rename this ADR's work carries |
> | "Never shown: … shares" | a **redeem is denominated in shares** and cannot be stated in TRUST without inverting the bonding curve in the browser (ADR `0056`). The rule holds for a *holding* figure; a redeem form names its unit or it lies about what it takes. Flagged rather than resolved by fiat |

## Context

`docs/05_UI_DESIGN.md` and `.claude/rules/ui.md` were written for a monochrome, cyan-accented, Inter + JetBrains Mono UI with corners of 4px or less. The user commissioned a full identity redo and chose, explicitly and in order: a technical-plate theme (graphite, grid paper, figure labels), a dot grammar for agent sigils, the logo "The Source", Saffron as the accent, Geist Mono for data and labels, and corners "between square and round". Four of those contradict the written rules, and `CLAUDE.md` says rules do not change silently.

## Decision

Adopt the v0.3 identity and amend `docs/05` and `ui.md` to match:

1. **Logo — The Source.** A Saffron core and three rings of 6 / 12 / 18 dots at radii 18 / 33 / 47 (viewBox 108). The rings encode the evidence ladder by distance: proven next to the source, staked around it, asserted at the edge. Rings drop from the outside in below 64px and 24px; the core never drops. Wordmark: Archivo 800 at width 125%.
2. **Colour.** Cool graphite neutrals (`#121314` to `#E6E8E6`, eight steps). One accent, **Saffron `#FFB020`** (10.2:1), replacing cyan, spent on primary actions, the selected state and the viewer's own position. The ADR 0018 exception is kept unchanged in substance: `--alarm` (`#FF4D6D`, 5.8:1) is for `mismatch` only. The inverted monochrome "real TRUST" bar is dropped from the stake flow at the user's request; this reopens ADR 0017 safeguard 4 and ADR 0029's "the mainnet warning moves to the confirmation", which need a decision of their own. Verified and not verified are separated by weight, not hue. No green.
3. **Type.** Archivo (expanded 800 for titles and the wordmark; normal width 400/500/700 for prose and UI) and Geist Mono (400/500/600) for addresses, hashes, amounts, timestamps, labels. Replaces Inter + JetBrains Mono. A provider's score keeps the ADR 0018 rule: size set by the reviewers under it.
4. **Corners.** 6px tags, 8px small controls, 10px buttons and fields, 12px cards and panels. Full circles only for dots and agent avatars, so a circle always means "an agent". Replaces "no rounded corners above 4px".
5. **Sigils.** Every agent gets a generated 7 × 7 dot glyph, mirrored on the vertical axis, drawn without a container or connecting lines. Cell = a declared tool (a `uses` triple). Size = TRUST tier the agent staked on it. **Hollow = declared only; filled = proven by a third party** (a redeemed delegation, a payment, an on-chain call), per `docs/14`. Saffron centre = the viewer holds a stake. Generated from chain data, never drawn by hand.

6. **Explanations live in hints.** No explanatory sentence in a card or panel. A 20px "?" circle opens a one-sentence tooltip on hover and on keyboard focus.
7. **Loaders are The Source.** Ripple (tx pending), Orbit (waiting on the wallet), Steps (known confirmations), Breath and Sweep (reading data), plus the in-button dots. One loader per wait; static under reduced motion.

Unchanged and restated, because the first component drafts broke them: ARP shows no score of its own (`docs/09` §3, tier 2 is not ARP's position); the index is not a ranking or a marketplace (`docs/12`); pages state facts and stop explaining them (ADR 0029); staker counts are a glyph and a number.

## Alternatives considered

- **Keep `docs/05` verbatim and treat the canvas as exploration** — rejected; the user chose the identity, and a codebase whose rules contradict its own design system produces reviewer rejections on every UI task.
- **Cyan kept as accent** — rejected by the user in favour of a warm accent; Saffron chosen over Coral (too close to the alarm), Copper (quieter on screen) and Brass.
- **Fully round (pill) buttons** — tried and rejected by the user. **Square buttons** — rejected by the user. 10px is the compromise asked for.
- **Variable-weight typography carrying stake ("Weight" direction)** — explored and rejected by the user.
- **Arch / keystone logo** — explored; the user chose The Source.

## Consequences

**Positive:**
- The logo, the sigils and the icons share one grammar, and the logo itself states the evidence ladder.
- The hollow / filled sigil makes declared versus proven legible at 24px, which is the distinction `docs/14` says matters.

**Negative:**
- `app/src/index.css` tokens, fonts and every hand-tuned radius must change; the ADR 0028 cascade notes on button borders still apply.
- Rounded corners move ARP closer to the "universally rounded" template signal `ui.md` warns about. Mitigated by keeping radii small and tiered, never `rounded-xl` everywhere.
- The `Statements` / `Weight unknown.` losses recorded in ADR 0029 are not addressed here.

**Neutral (worth knowing):**
- All agent names, numbers and hashes on the canvas are invented sample data; `[PROVIDER]`, `[QUOTE]` and `[CEILING]` mark values only the app can supply.
- Geist Mono and Archivo are both on Google Fonts; replacing two families with two keeps the bundle budget flat.

## References

- Related rule: `.claude/rules/ui.md`, `.claude/rules/claims.md`
- Related doc: `docs/05_UI_DESIGN.md`, `docs/09_POSITIONING_AND_PLAN.md` §3, `docs/12_THE_IDEA.md`, `docs/14_THE_WITNESS_PROBLEM.md`
- Related ADR: `0018`, `0028`, `0029`, `0056` (the market and its exit — the shares conflict above),
  `0032` (whose number this draft claimed), `0050` (the token gate that polices §1), `0051`/`0055`
  (why the module surface in the handoff's route table no longer exists)
- Source package: `arp-design-handoff/` — `HANDOFF.md` is the build contract, `reference/*.html` the
  visual truth, `components/SourceField.tsx` the one component delivered ready
