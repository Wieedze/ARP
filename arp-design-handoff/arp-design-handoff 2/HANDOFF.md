# ARP front: design handoff for Claude Code

Read this file first, then `choices/0032-brand-identity-the-source.md` (if the repo already numbered this ADR, for example 0057, use that number and merge), then open the three files in `reference/` in a browser. The reference pages are the visual truth; this file is the contract.

The user (Maxime) approved every decision below in a design session on 2026-10-21. Where this file contradicts `docs/05_UI_DESIGN.md` or `.claude/rules/ui.md`, this file wins **only after ADR 0032 is accepted**. Step 0 is that ADR.

## Package contents

| Path | What it is |
|---|---|
| `HANDOFF.md` | This contract. |
| `choices/0032-brand-identity-the-source.md` | ADR draft, status Proposed. Goes to `.claude/choices/0032-brand-identity-the-source.md`. |
| `components/SourceField.tsx` | React Three Fiber hero field, typechecked, values frozen. Goes to `app/src/components/brand/SourceField.tsx`. |
| `reference/landing.html` | Landing, approved as final: "The reputation pulse for autonomous agents and tools." Build it to look exactly like this. |
| `reference/agent-page.html` | `/agent/:chainId/:tokenId`, per `docs/16_THE_AGENT_PAGE.md`: eleven sections ordered by what each claim cost. |
| `reference/agents.html` | Agent index: domain tabs, sort, search, sigil rows, agent drawer with stake flow. |
| `reference/profile.html` | Profile: positions with redeem, ERC-7710 delegations with caveats and cap, activity. |
| `reference/source-field-tuner.html` | Slider tool used to tune the field. Not to ship. |

All names and numbers in the references are invented sample data. Never copy them into the app.

## Step 0: rules first

1. Copy the ADR to `.claude/choices/0032-brand-identity-the-source.md`. Ask Maxime to flip it to Accepted.
2. Amend `docs/05_UI_DESIGN.md` and `.claude/rules/ui.md` to match sections 1 to 6 below (accent, fonts, radii, sigils, hints, loaders). Keep every other rule.
3. The ADR flags an open point: the "real TRUST" mainnet warning bar was removed from the stake flow by the user. That touches ADR 0017 safeguard 4 and ADR 0029. **Do not delete the mainnet warning in code.** Ask Maxime before touching it.

## 1. Tokens

Replace the `@theme` colour, font and radius tokens in `app/src/index.css`. Keep the existing motion tokens and score sizes (ADR 0018).

```css
@theme {
  /* graphite neutrals */
  --color-ground: #0E0F10;      /* page background */
  --color-bg: #121314;          /* panels, code blocks */
  --color-raised: #1B1D1F;      /* selected rows, drawers, tooltips */
  --color-raised-2: #232629;
  --color-rule: #2E3134;        /* hairlines */
  --color-rule-strong: #43474B; /* control borders, table head rule */
  --color-grey: #6B7075;        /* dim display text only; 3.8:1 */
  --color-steel: #8A9096;       /* labels, secondary text; 5.9:1 */
  --color-silver: #A9AEB2;      /* body secondary; 8.5:1 */
  --color-fg: #E6E8E6;          /* paper, primary text; 15.5:1 */

  /* one accent */
  --color-accent: #FFB020;      /* Saffron; 10.4:1; ink on it is #121314 */

  /* semantic exception, ADR 0018: mismatch only, nothing decorative */
  --color-alarm: #FF4D6D;       /* 5.9:1 */

  --font-display: "Archivo", "Arial Narrow", system-ui, sans-serif;
  --font-sans: "Archivo", system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;

  --radius-tag: 6px;
  --radius-control: 8px;
  --radius-button: 10px;
  --radius-card: 12px;
}
```

Notes:

* The references use `#5A5F64` for the dim second line of headings. It fails AA (2.97:1). Use `--color-grey` `#6B7075` in the app.
* Fonts load in `app/index.html` with one `<link>`: `https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Geist+Mono:wght@400;500;600&display=swap`. Remove Inter and JetBrains Mono.
* Display type: Archivo 800, `font-stretch: 125%`, letter-spacing `-0.02em` to `-0.03em`, line-height `0.92` to `1`. Prose and UI: Archivo normal width, 400/500/700. Mono for every address, id, hash, amount, timestamp and label. Labels are mono 10 to 12px, uppercase, letter-spacing `0.06em` to `0.12em`.
* Circles (`border-radius: 999px`) are reserved for dots and agent sigils. Nothing else is round.
* No gradients, no shadows, no glow. Hairlines separate.

## 2. Logo: The Source

ViewBox `0 0 108 108`. A Saffron core `r=6` at the centre, then three rings of paper dots, first dot at 12 o'clock:

| Ring | Radius | Dots | Dot r | Fill |
|---|---|---|---|---|
| 1 | 18 | 6 | 4.4 | `#E6E8E6` |
| 2 | 33 | 12 | 3.4 | `#E6E8E6` |
| 3 | 47 | 18 | 2.2 | `#8A9096` |

Dot k of a ring of n sits at angle `2πk/n − π/2`. Build it as a `<SourceMark size />` component that generates the SVG; do not hand-write paths. Below 64px drop ring 3; below 24px keep only ring 1 and the core. The core never drops. Wordmark: "ARP" in Archivo 800, width 125%.

## 3. Nav

Split nav, logo centred, 88px tall, hairline below. Grid `1fr auto 1fr`; the left links align right, the right links align left. The mark is 56px.

* Left: AGENTS (`/agents`), TOOLS (`/tools`). Right: REGISTER (`/register`), then CONNECT when disconnected, or YOU (`/me`) once a wallet is connected, matching `Layout.tsx` on `feat/agent-panel-tabs`. MODULES and SDK are gone: `ModuleRegistry` is legacy (ADR 0051) and the SDK is now `@arp-protocol/core`.
* Each link: mono 12px, letter-spacing `.12em`, steel; a 6px hollow dot before it. Hover: paper text, filled paper dot. Current page (`aria-current="page"`): paper text, **Saffron filled dot**.
* No ruler, no tick marks, no decoration under the nav. The user rejected it.

## 4. Sigils

Every agent gets a generated glyph. Same agent, same sigil, everywhere. Port `sigil()` from `reference/agents.html` (search `function sigil`) into `app/src/components/brand/Sigil.tsx` as a pure SVG component. **No container, no background, no connecting lines.** The user tried all three and rejected them.

Rules, exactly as implemented:

* Grid 7 × 7 in viewBox `0 0 60 60`, step 8.5, origin 4.5, mirrored on the vertical axis. The candidate cells are columns 0 to 3 and rows 0 to 6, minus the centre (3,3): 27 cells.
* Each module claims `max(3, ceil(12 / moduleCount))` cells. Cell index = FNV-1a hash of `moduleName + agentId` modulo 27, then linear probing past taken cells; the next cell re-hashes the previous hash. Columns 0 to 2 are drawn twice (mirrored), column 3 once.
* Dot state per module: **filled paper = proven** (at least one receipt), **hollow steel ring = declared only**, **filled alarm = used but not declared** (the only place the alarm appears on a sigil).
* Size: three tiers, picked from the hash. Large (≥ 64px): `1.3 / 2.2 / 3.2`. Small (< 64px): `2.2 / 3.1 / 3.9`, because the smallest tier vanishes at row size.
* A faint 7 × 7 trame of `#2E3134` dots (r `.6` large, `.9` small) sits under the glyph.
* Centre dot: paper by default, **Saffron when the connected wallet holds a stake on this agent**. That is the only warm dot on a sigil.
* Props: `{ agentId, modules: {name, state: "proven" | "declared" | "mismatch"}[], viewerStaked: boolean, size }`. Sizes in use: 48 (rows), 104 (drawer or detail).

In the real app, the modules come from the agent's `uses` triples (declared) and its receipts (proven). The sample hashing only needs a stable string; use the module atom id when it exists, otherwise the name.

## 5. Hints and copy

* No explanatory sentence inside a card, row or panel. Explanations live in a hint: a 15px circle with "?", mono 9px, `rule-strong` border. On hover **and keyboard focus** it shows a one-sentence tooltip (`raised` background, `rule-strong` border, 8px radius, 220px wide). It is a `<button type="button">` with an `aria-label`.
* Facts only (ADR 0029). ARP shows no score of its own. The index is not a ranking or a marketplace: sort keys are facts (staked, stakers, receipts).
* Staker counts are a person glyph plus a number.
* Never shown: a "real TRUST" bar, a vault address, shares. Position count is shown.

## 6. Loaders and motion

* **Ring loader.** The Source with three rings (r 20/36/50, 6/12/18 dots, dot r 5/3.6/2.4) in `#2E3134`; each ring animates `fill` to Saffron and back over 1.2s, ring delays 0 / .18 / .36s. Used over a table while data reloads (520ms minimum so it does not flash) and inline at 16px in a pending button.
* **Stake pulse.** On a confirmed stake, a Saffron ring expands from the sigil centre (r 2 to 40, 1.1s ease-out, fades out), and the centre turns Saffron.
* **Ticker.** The landing activity strip scrolls linearly (56s loop, duplicated track).
* Everything goes static under `prefers-reduced-motion`.
* **No mouse-reactive effects.** No parallax, no repulsion, no hover tilt, no cursor trails. The user rejected them. Row hover is a background change only.

## 7. Hero: the Source Field

`components/SourceField.tsx` is ready. Values frozen by the user: rings 22, ratio 8, first ring 0.52, wave width 0.20, wave every 10s. Tilt `-0.35` rad, offset `[1.6, 0]`, scale 0.84 on desktop; on narrow screens use offset `[0, -1.2]` and scale 0.7.

* Dependencies, to justify in the PR as the UI rules require: `bun add three @react-three/fiber` and `bun add -d @types/three`. Load the landing hero with `React.lazy` so three never enters the main bundle.
* Pass `waveKey` (increment it) when a stake confirms, so the field answers the real event.
* The field sits inside a 14px-radius frame, 760px tall (`max-height: calc(100svh - 140px)`), with the copy low left and an event card low right (latest stake, Saffron amount).

## 8. Screens and routes

Map the references onto the existing routes in `app/src/App.tsx`. Keep the data layer, hooks and services; restyle and restructure the views.

| Reference | Route | Current file | What changes |
|---|---|---|---|
| `landing.html` | `/` | the tool catalogue moves to `/tools` only | Approved as final, match it exactly: hero "The reputation pulse for autonomous agents and tools." with the Source Field (each wave is one paid claim, the event card and the beat counter update with it), ticker, "Free claims go down. Paid claims go up." split, the four rungs, "Three ways to add a beat", the "No score. No grade. No stars." statement, the build block with the real `@arp-protocol/core` calls (`createErc8004Client`, `listAgents`, `getToolUsage`, `prepareDeclareUsed`) and the skill link, footer. The ticker and event card read real declarations; if there are none, they say so, never sample data. |
| `agents.html` | `/agents` | `pages/AgentDirectory.tsx` | Big heading, three totals, domain tabs from the seed manifest domains, search, sort segmented control, dense rows (rank, sigil, name and id, domain tag, staked, stakers, receipts), "undeclared module" alarm flag. A row opens a right drawer (520px, Escape closes, focus returns to the row) with modules list, latest receipts and the stake control. |
| `agent-page.html` | `/agent/:chainId/:tokenId` | `pages/AgentTrustPanel.tsx` | `docs/16` wins over this table. Cost rail on the left of each section (PAID, FACT, FREE, YOU), paid sections loud and free sections dim, "Paid to say / Said for free" ledger in the header. The DOCUMENTED / BARE and network switches in the reference are design tools; the network switch maps to the app's real one. |
| `profile.html` | `/profile` (new) | none | Positions (sigil with Saffron centre, your stake, since, receipts since, Redeem with inline confirm), Delegations (state, cap used as 10 dots filling Saffron, caveats: domain, targets, methods, expiry, Revoke with inline confirm), Activity. |
| not designed yet | `/modules`, `/tool/:id`, `/modules/new` | `ModuleList`, `ToolDetail`, `RegisterModule` | Apply the nav, tokens and table pattern of `agents.html`. Ask Maxime before inventing new patterns. |

Stake control, as in the drawer: amount chips 10 / 25 / 100 (selected chip has a Saffron border and text), a Saffron primary button "Stake 25 TRUST", a mono status line under it. States: idle, pending (ring loader in the button, "Confirming", line says "Redeeming delegation, one signature."), done (outline Saffron button "Staked 25 TRUST", line shows the receipt hash). The cap line ("Within your delegation cap of N TRUST") reads from the real delegation.

Irreversible actions (redeem, revoke) always use an inline two-step confirm: Cancel (quiet) and a Saffron outline button naming the action and amount.

## 9. Components to build

Under `app/src/components/brand/`:

`SourceMark`, `SourceField` (given), `Sigil`, `RingLoader`, `Hint`, `NavSplit`, `Tag`, `FactStrip` (the bordered totals), `DotMeter` (cap used), `StakeControl`, `ConfirmInline`, `Drawer`, `Ticker`.

Every one: TS strict, keyboard reachable, visible focus ring (`2px solid` paper, offset 3px), accessible names on icon buttons, static under reduced motion.

## 10. Done means

* `bun run lint`, `bun run test` and `bun run build` pass in `app/`.
* Each screen checked in dark at 1440px and 390px wide: no horizontal scroll, AA contrast, keyboard path through tabs, rows, drawer, stake, redeem and revoke.
* The `ui-reviewer` agent has passed it (`.claude/agents/ui-reviewer.md`).
* No sample data from the references in the app. Testnet only; never point anything at mainnet without Maxime's explicit confirmation.
