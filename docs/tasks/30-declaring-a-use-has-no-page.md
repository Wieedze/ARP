# Task 30 — declaring a use has no page

**Status:** **BUILT, REVIEWED TWICE, FIXED** 2026-10-28. Round 1 FAIL on seven findings, round 2
FAIL on five more — **four of the five introduced by the round-1 fixes**. All twelve are fixed and
re-measured in a browser. 485 app tests.
**Required skills:** none global. `.claude/rules/` — `code.md`, `ui.md`, `security.md`,
`portability.md`, `workflow.md`, `claims.md`.
**Reviewers:** `ui-reviewer`, then `task-verifier`.
**ADR:** `0071-owning-the-token-is-the-authority-to-declare.md`.

## Why

`docs/12` point 3 — _"the agent runs, it deposits TRUST on the modules it actually used"_ — is the
centre of the mechanism and had **no page**. It lived in `scripts/agent-declare-used.ts` and in
`arp-mcp-server.ts`, so it was reachable by an agent and not by the human holding the agent's key.
`.claude/STATE.md` has carried it as _"still not built, and it is the centre of the mechanism"_ since
2026-10-27, and named where it belongs: `/atom/:atomId`.

The user's framing, 2026-10-28: _« on doit finir les feature de decouverte utilisation et toute la
boucle »_, and then, on the script question, _« je ne veut plus aucun script normalement on doit tout
faire avec du code pas appeler des script si ? »_ — which is exactly this task. The centre of the
loop was a CLI.

## The scope correction, stated before the deliverables

This was framed — by me, to the user — as **"the two empty cells in the app: declare and stake"**.
There is **one** cell. The second was closed by the user's own decision on 2026-10-21, ADR `0056`
§1, in his own words: _« l'arête n'a aucune utilité comme marché car personne ne va miser contre X
agent use X outil [...] alors ce serait juste des frais supplémentaires pour rien »_. Measured:
**1** of 185 mainnet `uses` edges has ever been contradicted
(`scripts/measure/counter-side-usage.ts`). The position the declaration is born with (ADR `0053`) is
the whole of the stake.

So: one write, and no control to deposit on the edge afterwards.

## What shipped

Sizes are `wc -l` for a new file and `git diff --numstat` for a changed one, re-measured after the
third review round. The first draft asserted four from memory and got **three** wrong; the second
left the round-1 figures in place while the diff tripled, which a reviewer caught. Twice, on one
table, in one task.

| file                                             | lines      | what                                                                         |
| ------------------------------------------------ | ---------- | ---------------------------------------------------------------------------- |
| `app/src/components/usage/DeclareUse.tsx`        | 495        | the declare control                                                          |
| `app/src/services/declare-use.ts`                | 424        | `planUseDeclaration` + `submitUseDeclaration`, **11** guard codes            |
| `app/src/services/__tests__/declare-use.test.ts` | 419        | every guard code, asserted on `code`                                         |
| `app/src/hooks/use-declare-use.ts`               | 52         | the two callbacks, chain on the declaration                                  |
| `app/src/components/brand/DisclosureSummary.tsx` | 42         | the `+`/`−` row and its heading — a DOM contract a class string cannot carry |
| `app/src/lib/surface-class.ts`                   | 32         | `cardClass` and the summary pair                                             |
| `app/src/pages/AtomPanel.test.tsx`               | +154       | the write block, rewritten twice                                             |
| `app/src/pages/AtomPanel.tsx`                    | +103 / −21 | both writes wired, the dead explorer link removed                            |
| `app/src/components/market/AtomMarket.tsx`       | +45 / −10  | was `AgentBacking`; optional heading, generalised                            |
| `app/src/lib/control-class.ts`                   | +28 / −2   | `decoration-*` removed, with the measurement                                 |
| `app/src/test/render.tsx`                        | +23 / −6   | `WagmiProvider`, a fourth provider every page assumes                        |
| `packages/protocol/src/atom-standing.ts`         | +21        | the atom's `url` — what it points at                                         |
| `app/src/components/brand/Hint.tsx`              | +19 / −1   | the `align` prop                                                             |
| `app/src/services/atom-standing-view.ts`         | +11        | `pointsAtSomething`                                                          |
| `vercel.json`                                    | +6 / −2    | the build command ADR `0041` had broken                                      |
| `app/src/pages/AgentTrustPanel.tsx`              | +3 / −3    | the rename                                                                   |

The business logic is the package's. `prepareDeclareUsed` builds the plan and holds no key (ADR
`0038`); this service adds only the app's two human safeguards — the per-transaction ceiling and the
chain guard — and re-types the planner's two refusals so the screen can state them.

## Gate

```
cd app && bunx tsc -b                 # 0
cd app && bun run lint                # 0
cd app && bun run test                # 483 passed, 2 skipped
cd app && bun run check:tokens        # 67 tokens, every var() resolves
cd app && bun run check:contrast      # 0
bun run check:scripts                 # 0
bunx prettier --check <touched files> # clean
```

`bun --filter '*' lint` still exits 127 on `solhint: command not found` — pre-existing, not touched
by this task, and recorded in `.claude/STATE.md`.

## Mainnet is refused, deliberately, and that is the one thing awaiting the user

`planUseDeclaration` throws `mainnet-not-authorised` on `chain.isMainnet` **before its first read**,
and the component renders the reason in place of the form rather than after a click.

`.claude/rules/security.md` authorises a human in the panel to sign on mainnet under **ADR `0017`**,
which scopes itself to _deposits into existing `has trust provider` triple vaults_. A `uses` edge is
a different predicate and a **creation** rather than a deposit. The rule is explicit that this makes
it "not yet authorised, not forbidden", and that widening it needs its own ADR.

It matters because `lib/chain-choice.ts` **defaults to mainnet**, where the write costs 0.11 TRUST of
which 0.1 never comes back. **Opening it is one deleted guard plus an ADR the user signs.**

## Do not do in this task

- Do not seed the tool catalogue. That is the next piece and it has its own permanent decision
  pending (which URL is a skill's identity, ADR `0054`).
- Do not add a deposit control on the edge. ADR `0056` §1.
- Do not touch `app/src/services/atom-stake.ts`. Its `depositOnAtom` is dead and wrong — no caller,
  deposits on the atom while `getToolUsage` prices the triple, and reads a testnet address at module
  scope. Removing it is its own change; it is recorded in `STATE.md`'s defect table instead.
- Do not delete `scripts/agent-declare-used.ts`. The CLI is still the path for an agent with no
  browser, and `scripts/measure/` is required by `claims.md` regardless.

## Evidence ladder

`docs/09` §3 — asserted, rated, staked, proven. This serves **staked**, and it moves ARP up the
ladder by making the rung reachable: every `uses` edge written here is born with a position (ADR
`0053`) and carries a non-recoverable fee (ADR `0056` §1), so the claim costs its author money. It
does not reach **proven** — that needs the counterparty, which is `docs/14` and `docs/tasks/19` step 1b.

## Found while building, not fixed here

`app/src/lib/wagmi.ts`'s docstring asserts _"No ARP contract is deployed on 1155 and none is
addressed from it."_ That is the false mainnet sentence ADR `0065` corrected, at a **fourth** site —
`STATE.md`'s defect table lists three (`CLAUDE.md`, `security.md`, `STATE.md` itself) and this is not
among them. `claims.md` §5: a sentence written four times gets corrected three. Added to `docs/tasks/28`.

## `ui-reviewer` round 1: FAIL, seven findings, all fixed

The one that mattered, and it is the same correction `/register` already made once:

> **`Your position` was `totalValue - creationFee`.** That subtracts the flat creation fee and
> nothing else, while the entry fee and the triple's atom-deposit fraction come out of the deposit
> too. On 13579 the panel printed `Your position 0.001 tTRUST` directly above
> `Shares minted 0.00099` — contradicting itself on screen.

`tool-register.ts` carries the identical lesson in as many words — _"the chain takes **three** bites
and an earlier version of this screen described two"_ — so this is `claims.md` §5 at the level of
behaviour rather than prose: the correction landed on `/register` and not here. The figure was one
field away and was being discarded: the service read `shares` off `plan.calls[].preview` and dropped
`assetsAfterFees` from the same object. `DeclaredUse` now carries `assetsAfterFees` (read, never
derived) and `feeAssets`, and the panel shows the five rows `/register` shows. Measured today by
`scripts/measure/preview-before-create.ts testnet`: `previewTripleCreate(0.002000000002)` →
`assetsAfterFees` 990000000000000, i.e. **100 bps** off the deposit, not the 175 the test fixture
had copied from the mainnet **atom** figure.

| #   | finding                                                                      | fix                                                                                               |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | `Your position` wrong by the entry fee                                       | `assetsAfterFees` + `feeAssets` carried and shown; regression test asserts the two figures differ |
| 2   | stale reads after a successful write                                         | `onDeclared` prop → `AtomPanel` refetches, the pattern `AgentBacking` uses                        |
| 3   | the write sat at **y=17602** in a 17645px column on a real atom              | moved **above** the edge list; re-measured at **y=164**                                           |
| 4   | `linkClass` re-spelled by hand, and its decoration colour **inert app-wide** | imported; `control-class.ts` gets the bang it was missing                                         |
| 5   | the `Hint` was two sentences, the second explaining our choice               | cut to one                                                                                        |
| 6   | the `Hint` panel clipped at 390px                                            | anchored to an edge, width clamped, and an `align` prop because CSS cannot choose                 |
| 7   | four claims defects in comments and fixtures                                 | all four corrected                                                                                |

### What the browser said after the fixes

`scratchpad/verify-declare-fixes.ts` and `scratchpad/verify-hint.ts`, headless Chromium against
`vite preview`, a real testnet atom carrying 11,195 edges:

- the control is at **y=164** in a 17,482px column at 1440×1000, and at 734 at 390×844;
- its heading computes **Archivo 20px 800** against a predicate group's **Archivo 15px 500**, so the
  page's one write no longer reads as another list section;
- `text-decoration-color` on an `<a>` carrying `linkClass` computes **rgb(67, 71, 75)** —
  `--color-rule-strong`. It was `rgb(169, 174, 178)`, i.e. currentColor, for **every link in the
  app**;
- no sideways scroll at either width (`scrollWidth === clientWidth`).

### Finding 6 needed two passes, and the first fix moved the bug

Anchoring the tooltip left fixed the left edge and broke the right: measured at 390px with the
anchor hard right, the panel ran **375 → 595**. There is no collision detection in CSS, so neither
edge is safe by default. `align` is now a prop, both alignments verified at both extremes, and the
default is `"left"` because both call sites sit left of their container.

### Two changes reach beyond this task, disclosed

- **`control-class.ts`** — `linkClass` gained `decoration-[…]!`. `text-decoration` is a shorthand, so
  `index.css`'s unlayered `a { text-decoration: none }` was resetting the colour to `currentcolor`
  and beating the layered utility. Every underline in the app was drawn in the text's colour. One
  character, app-wide visual change, and the second failure class `rules/ui.md` says no gate sees.
- **`Hint.tsx`** — gained the `align` prop above. Both existing call sites keep the default.

## `ui-reviewer` round 2: FAIL on five more, four of them mine

The round-1 list was confirmed closed. What the second pass found is the more interesting half,
because **four of its five findings were created by the first round's fixes**:

### A. Fixing the inert utility made the app less legible

Round 1 said `linkClass`'s `decoration-[color:var(--color-rule-strong)]` was inert — the unlayered
`a { text-decoration: none }` is a **shorthand**, so it resets `text-decoration-color` to
`currentcolor` and beats the layered utility. The fix was a `!`. Measured after it, by
`scripts/measure/contrast.ts`:

|                                                         | ratio on `--color-ground` |
| ------------------------------------------------------- | ------------------------- |
| `--color-rule-strong` — what the bang applied           | **2.05:1**                |
| `--color-silver` — what `currentColor` had been drawing | **8.57:1**                |

Under WCAG 2.1 SC 1.4.11's 3:1 for a cue identifying a component, in the module whose own argument
is that _the underline is the affordance_. And the intended value had no design authority:
`arp-design-handoff/reference/*.html` is `a{color:var(--silver);text-decoration:none}` in all four
files — **the handoff has no underlines at all**.

So the utility had been shipping the better value for weeks. `decoration-*` is **removed** rather
than retuned to `--color-steel` (5.95:1), because what to match is what the app has been showing.
Re-measured live: `rgb(169, 174, 178)`.

**The lesson is not "add the bang".** It is that a utility measured inert is not yet a defect —
nobody had checked what it would do once it applied.

### B. The placement fix made the refusal the page's headline

Round 1's finding 3 was that the write sat at y=17602 on a 250-edge atom. Moving it to the head of
the column fixed that and created two worse things, both measured by the reviewer at 1440×1000:

- on **mainnet — the default chain** — the loudest element on every atom page became an `h2` at
  `type-face text-[20px]` announcing that the feature does not work, 218px above the evidence the
  page exists to show;
- on testnet the first evidence row moved from y~230 to **y~501**, four rows above the fold where
  `ui.md` asks for fifteen.

**The bug was the unbounded list, not the order.** Both writes are now native `<details>`,
collapsed, at the head of the column, and the mainnet branch is one steel sentence with no heading
at all. Re-measured:

|                            | mainnet                                   | testnet                         |
| -------------------------- | ----------------------------------------- | ------------------------------- |
| refusal / first disclosure | y 164, **13px/400** steel                 | y 164, collapsed, 15px/500      |
| second disclosure          | y 245                                     | y 248                           |
| first evidence row         | **y 409**                                 | **y 412**                       |
| first screen of the column | refusal · back this atom · `250+ claims…` | declare · back · `250+ claims…` |

15px/500 is exactly a predicate group's weight, so neither write competes with the page's content,
and both are reachable whatever the atom's size.

### C–F and a nit

| #   | finding                                                                                              | fix                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| C   | the rename renamed the warning's subject, so it cited an `AgentTokenRef` the package does not export | one word back to `ResolvedAgentRef` — `claims.md` §5 inside a fix for a §5 finding                     |
| D   | the page docstring still said "at the foot of the page"                                              | "at the head"                                                                                          |
| E   | the two new hash links were **dead** — a term id is 32 bytes, the explorer wants 20                  | subject → the app's own `/atom/:atomId`; the edge id back to plain text                                |
| F   | fixes 2 and 3 shipped with no tests                                                                  | the block is rewritten for the disclosures, with an order regression and an `open === false` assertion |
| nit | the `min()` width clamp was credited with the phone fit; it only engages below 252px                 | comment corrected                                                                                      |

E's pattern is **pre-existing** in the same file's "Explorer →" link and is recorded as `docs/tasks/28`
item 38 rather than fixed here.

### What the two rounds cost, and what that says

Twelve findings over two rounds on one control. Eight were mine to begin with; **four were created
by fixing the first eight**, and three of those four were measurable only in a browser. The pattern
is `rules/claims.md`'s own — _"a sentence written to fix a claims error is not exempt from this
rule"_ — operating on behaviour rather than prose, and the thing that caught it each time was a
measurement, never a re-read.

## A design pass, on the user's screenshot

> _« il faut amelioré grandement ( peut etre grace au card de l'ui design ) cette partie la qui
> n'est pas designé correctement »_ — 2026-10-28, with a screenshot of both write blocks.

What the screenshot showed, and what each thing became:

|                       | was                                                                                       | now                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| containment           | nothing — every block floating on the page background                                     | each write is a card: 1px `--color-rule`, `--radius-card`, 18px padding                                     |
| the refusal           | two 42-character addresses wrapped to three lines of mono prose in a bare box             | a headline from the guard's `code`, then labelled rows — `DeclareUseGuardError` now carries `detail`        |
| headings              | three stacked for one thing: "Back this atom, or withdraw" → "Backing" → "Back this atom" | `AtomMarket` takes `heading`, `null` where a disclosure already names it; the section keeps an `aria-label` |
| the market            | a card, then two unbounded blocks under it                                                | **one** card — the figures, the shape and the two controls are one thing a reader acts on                   |
| the disclosure marker | the browser's default triangle                                                            | a mono `+` / `−` in a `--radius-tag` box, flipped by `group-open:`                                          |

The card shape is the design reference's own `.stake` —
`arp-design-handoff/reference/agents.html`: 1px border, 12px radius, 18px padding on the page
background. The border is `--color-rule` rather than the reference's `rule-strong`, matching the
three cards the app had already shipped and `rules/ui.md`'s split (hairlines separate; `rule-strong`
is for control borders). It lives in `app/src/lib/surface-class.ts`, deliberately **not** in
`control-class.ts` — that module exists for a cascade problem a container does not have.

**`group-open:` was checked rather than assumed.** It is exactly `ui.md`'s "a Tailwind utility that
does not exist — v4 emits nothing, silently". `scripts/measure/emitted-utilities.ts` after the
build: **355 utility tokens across `app/src`, every one with a rule**, and the two
`group-open\:` selectors are in the stylesheet.

### Left alone, and visible in the same screenshot

The atom's title breaks mid-word in the aside — `Sanct / ioned / Addr / ess`. `.type-title` carries
`overflow-wrap: anywhere` so a bare atom id can wrap, and `--text-title` is wider than the 18rem
column for a word like "Sanctioned". Pre-existing, it affects every detail page, and changing either
the token or the column is a layout decision rather than part of this control.

## Two more user decisions, after the design pass

### The writes are open, side by side

> _« pourquoi c'est dans des menus extendable ? je veux que ce soit clair et visible en arrivant sur
> la page, pas d'extended »_

Four shapes have now been measured on this page. At the foot of the column the control sat at
**y=17602** on a 250-edge atom — unreachable. Open and stacked at the head it pushed the first
evidence row from y~230 to **y~501**. Collapsed into `<details>` it cost the evidence nothing and
cost the reader a click, which is what the user rejected: what you can do on an atom should be
legible on arrival.

**Side by side pays the vertical cost once instead of twice.** Both open, stacking below `lg` where
there is no second column to spend. `DisclosureSummary` and the summary half of `surface-class.ts`
are deleted with the disclosures rather than left as dead code; `cardClass` stays.

### A value curve, and it reconciles exactly

> _« je veux la courbe de valeur comme un marché de type trade republic »_

`getTermValueHistory` — new in `packages/protocol/src/term-shape.ts`. It is **not**
`getTermActivity`: that one's `volume` is absolute, because a signal links to either a deposit or a
redemption and `delta` is positive for both, so a reader taking it for value would see an exit as an
arrival. Value needs the direction, and `signals` carries it — `deposit_id` set means in,
`redemption_id` means out.

**Verified rather than assumed.** Probed on testnet 13579 against `0xdee4a5d8…61d5`
(`Trail of Bits — secure-workflow-guide`): six signals, all deposits of 0.00098, running total
**0.00588000**, against the vault's own `total_assets` of **0.00588000**. Exact, because
`signal.delta` is `assets_after_fees` for a deposit and `assets` for a redemption.

It is a **live value over time**, not a cumulative — it falls when somebody exits, which is the
distinction ADR `0046` §3 draws. A line that only rose would be "50 TRUST staked since the
beginning" drawn, which the ADR calls false when 40 were withdrawn.

Rendered through the existing `Sparkline`, which is hand-rolled SVG and adds no dependency. One
thing it inherits is a rule breach: that component strokes in Saffron, which `ui.md` reserves for
the primary action, the selected state and the viewer's own position. Pre-existing at two call
sites, now three, filed as `docs/tasks/28` item 41 rather than changed silently across three surfaces.

### The market leads, and its backers are a list

> _« le declare your agent use it c'est plutôt en bas et take position plutôt en haut et plus large
> avec plus de place, aussi on veut la liste cliquable des backers »_

**Five shapes have now been measured on this page**, which is worth recording as a cost: foot of the
column (y=17602, unreachable) → open and stacked at the head (evidence at y~501) → collapsed
disclosures (a click the user rejected) → side by side (fit, but gave the market half a column for a
value line, a list and two controls) → market first at full width, declaration under it at a form's
width. Each step was a real measurement and each one moved the problem somewhere else; only the last
two were layout decisions rather than fixes.

`getTermBackers` — new in `packages/protocol/src/term-shape.ts`. `getTermShape` reads the same rows
and returns only aggregates (concentration, breadth, when backers arrived), because "how is this
held" is a different question from "by whom".

**Each row leads somewhere real.** The account's own atom when the graph has one — keeping the
reader in the app and the graph walkable both ways — and the block explorer otherwise, where a
20-byte address _does_ resolve, unlike the 32-byte term ids of `docs/tasks/28` item 38.

Two things stated rather than hidden. The list is capped at **100** rows by the indexer, where
`atoms` and `triples` cap at 250, so its length is not the count: `TermShape.positionCount` comes
from an aggregate and is exact. And a row shows what the position took to open, not what it would
fetch today — the second needs the curve and is the shape panel's question.

Verified on testnet against `0xdee4a5d8…61d5` before any of it was wired: two backers at 0.00294
each, in 0.00294, out 0 — summing to the 0.00588 the vault reports, and the two addresses are the
same ones carrying the `uses` edges on that page.

### "Backers" becomes "Support"

> _« supprime le terme backers de partout c'est pas clair, plutôt support »_

Eleven visible strings across five files: the figures column, the list heading, the aside's row, the
agent panel's section 02, `TermShapePanel`'s three rows, the view service's two sentences, the
market's default heading and the one `aria-label` a screen reader would have read. Plus the
docstrings that quoted the old copy, because `rules/code.md` forbids a comment that misdescribes
state, and one test that asserted it.

**A collision to watch, stated rather than hidden.** `StakeSide` is `"support" | "oppose"` — the two
sides of a _triple_, which has a counter-vault. An atom has none. So on an atom page the word now
means "accounts holding a position" above, while the edge rows below can still print
`against 0.00099 tTRUST` for a contested claim. Two meanings of one word on one screen, with
different subjects. It is the reason "support" was argued against for the button label, where "Take
a position" won; as a heading for people it is what the user chose, and the risk is recorded here
rather than left to be rediscovered.

Internal identifiers keep the old word — `getTermBackers`, `TermBacker`, the query keys, the
`Backing` component in `AtomPanel`. None is on screen, and renaming an exported package symbol is a
breaking change worth doing in one deliberate pass rather than inside a copy edit.

### The claims become a constellation

> _« je veux voir ça mieux, sous forme graphique, soit avec des blocks soit avec des cercles qui
> constellent comme le logo autour de l'atom du tool, mais je veux quelque chose de mieux que juste
> une phrase "1 claim across one predicate" »_

`components/atom/ClaimField.tsx`, with its placement in a pure, tested
`claim-field-geometry.ts` — the same split `sigil-geometry.ts` makes, for the same reason: a ring
that overlaps or a dot outside the box is arithmetic, and arithmetic is testable without a DOM.

**Circles were already the vocabulary.** `rules/ui.md` reserves `rounded-full` for dots and agent
sigils so that a circle on this surface always means "an agent" — and every dot here is the subject
of a claim, which is an agent or an account. The rule is satisfied by what the data is rather than
worked around.

Three states, each read straight off the data and **none invented**:

|        | means                              |
| ------ | ---------------------------------- |
| filled | a position stands behind the claim |
| hollow | declared, nothing behind it        |
| ringed | somebody took the other side       |

Filled is `positionCount`, **never** the amount — ADR `0042`, because creating a term seeds its
vaults with `minShare` and three "has stake?" checks in this repo were wrong for exactly that
reason. There is deliberately **no size scale**: a dot sized by TRUST would invent a ladder the data
does not carry, and `docs/14` is explicit that what an interface must never do is render rungs at a
weight it chose. The same three marks lead the rows below, so the field and the list are plainly one
set of objects.

It is absolutely positioned `<Link>`s, not an SVG: focus rings come from `index.css`'s unlayered
`:focus-visible` for free, every dot has a real accessible name, and keyboard order follows the DOM.

**Two things the tests caught, both honest regressions:**

- The dot's announced text said _"backed by 0.00198 tTRUST"_, and the dust-rule test watches for the
  word "backed" anywhere on the page — ADR `0042` again. A row's legitimate figure tripping that
  guard **is the guard working**; the copy is now "behind it".
- The sentence it replaced carried the **truncation floor** (`250+`), and dropping it meant a count
  the reader knows is a floor would have rendered as a total. The field's legend carries it now.

The rings **share a band** rather than stepping by a fixed gap: a two-predicate atom used the middle
of the box and left the rest empty, while six overflowed it. The outermost ring is now at the same
radius on every atom, so the field reads at one weight across the directory.

And the cap is stated, not hidden: one mainnet tag carries 250+ edges on a single predicate, a ring
of 250 dots is a solid line, so 36 are drawn and the legend says how many there are.

### The field turns, and a claim lights up

> _« je veux un effect lumineux au over et aussi pas besoin du trait, et je veux que les cercles
> soient en rotation comme en page d'accueil »_

The edge line is gone. The reveal is now the dot taking **Saffron** and scaling — which is not an
exception to `ui.md`'s flat ban on `box-shadow`, glow and gradients, but the colour that same file
already assigns to **the selected state**. A dot under the pointer or the keyboard is one.

The rings turn, each at its own rate and alternating direction: one CSS transform on a wrapper that
carries that ring's dots, rather than the landing field's per-frame angle recomputation — nothing
here moves but the angle. `--orbit-for` and `--orbit-to` are declared in `@theme` with resting
values, because `check:tokens` reads that block and rejected them twice before they were.

ADR `0073` holds unchanged: the reveal still answers hover **and** focus, still names a fact rather
than performing a motion, and still moves no layout. Only what is drawn changed.

**And it cost the centre of the field.** Removing the edge meant replacing a span of JSX from the
rings to the dots, and the atom's own core sat in that gap. It vanished from its own constellation
with `tsc` at 0, `eslint` at 0 and 497 tests green — visible only in a rendered screenshot. Third
time on this task that an image caught what every gate passed.

### One page per agent

> _« le lien vers who hire this agent doit être sur la page détail de l'agent et mergé dans celle-ci
> pour que ce ne soit plus qu'une seule page qu'on accède dans tous les cas en cliquant sur le lien
> de l'agent, peu importe, après une recherche ou direct dans la liste »_

The split was real and this task had widened it:

| from                          | went to                                     |
| ----------------------------- | ------------------------------------------- |
| the directory `/agents`       | `/agent/:chainId/:tokenId` — the rich panel |
| the capability search         | `/atom/:atomId`                             |
| the claim field (added today) | `/atom/:atomId`                             |

The directory knows an agent's `chainId/tokenId`; the other two know only its **atom id**. So the
destination depended on where the reader clicked.

**The missing direction is atom → identity, and it did not exist.** `resolveCanonicalAgentAtom`
goes ref → atom and nothing went back. `resolveAgentRefForAtom` is that query: the `same as` edge
the mirror writes, read in **both** orientations, with the CAIP-19 parsed out of the other side.

Measured before building, because the answer decides whether it is possible at all:

| chain         | `same as` edges | shape                                                         |
| ------------- | --------------- | ------------------------------------------------------------- |
| mainnet 1155  | **30,913**      | `(Agent 8453:6649) same as (eip155:8453/erc721:0x8004…/6649)` |
| testnet 13579 | 882             | social handles — **none of ARP's rig agents**                 |

Verified live: `Agent 8453:6649` resolves to `{chainId: 8453, tokenId: "6649"}`, and a tag's atom
resolves to `null`.

So `/atom/:atomId` sends an agent's atom on to its panel, `replace` so Back returns where the reader
came from. Every link in the app now converges on one page whatever id it was holding.

**`null` means "no identity found", never "not an agent".** ARP's own testnet agents have no
`same as` edge — `docs/tasks/19` step 1b's blocker, seen from the other side — so they stay on the atom
page, which is a complete view of them. The degradation is tested, not assumed.

And the page waits for **both** reads before drawing: rendering the atom view while the identity is
in flight would flash the page the reader is being moved away from. The identity read is one query
in parallel with the heavier standing read, so it costs nothing in practice.

### A sigil for each agent that declared the tool

> _« j'aimerais aussi afficher le sigil dans les pages agent et tools »_

Two findings before building, because half the ask was contested by the rules:

- **The agent page already has one** — 96px, in section 01, via `AgentIdentityPanel`. It returns
  `null` when the agent declared no tools, and that is deliberate: _"a glyph of nothing but its core
  is the same glyph for every such agent, so it would stop being an identity and start being
  decoration."_ Most of the testnet rig is in that state, which is why it looks absent.
- **A tool has no sigil**, by construction. `rules/ui.md`: a circle on this surface always means _an
  agent_, and a sigil is "a dot per declared module". A tool declares nothing; it _is_ declared.
  Drawing it one would invent an identity the data does not carry.

Put to the user, who chose the third reading: **the glyph of each agent that declared it**, beside
its claim. That is semantically exact — a circle means an agent, and this is that agent's identity.

`getDeclaredModulesFor` is the read: **one query for the page**, not one per row. A tool's page lists
every agent that declared it, and thirty-six round trips to draw thirty-six glyphs is a fan-out
nobody asked for. It returns term ids rather than names, because `agent-sigil.ts`'s `moduleKey`
prefers the Intuition term id — a tool renamed upstream must not re-draw every sigil that includes
it. Only `uses` edges, matched on ADR `0030`'s frozen predicate id and never on a label: ADR `0057`
§5 says a cell is a declared tool, and mixing in `implements` or `has tag` would make the glyph a
count of assorted statements.

Verified on testnet before wiring: six subjects, one query, 2 / 9 / 1 / 2 / 1 / 3 modules each.

Every cell renders `declared`, never `proven` — `proven` needs a third party's receipt and nothing
in this app reads one. The glyph is hollow because that is the state of the graph, drawn.

**It falls back to the claim-state dot** when an agent declared nothing the read reached, for the
same reason `AgentSigil` returns `null`. The dot still carries what the constellation shows, so no
information is lost in the fallback.

### The agent sigil, and why it is still invisible

> _« je ne vois pas le sigil de la page agent »_

Two causes, and only one of them was a bug.

**The bug.** `AgentSigil` fed on `sigilModulesOf(view.capabilities)`, and the capability groups are
built by resolving the agent's ERC-8004 identity to its Intuition atom — the `same as` join
`docs/tasks/19` step 1b records as **zero edges on testnet**. So every rig agent's glyph returned `null`
while its declarations plainly existed: the user reported it on an agent whose glyph was rendering
**in the claim rows of a tool's page**, one screen away. Those rows query by the subject's **atom
id**, which the panel already has as `atomTermId`. Same read, no join. The capability walk stays as
the fallback, for agents resolved by a path the direct read does not cover.

**The part that is not a bug, and is the whole project.** Measured 2026-10-28: **185 `uses` edges on
mainnet, 146 on testnet**, across a registry whose next id is 444,562. Almost no agent has ever
declared anything, so almost every sigil is legitimately empty — `AgentSigil` returns `null` rather
than draw a glyph of its core alone, which would be the same glyph for every such agent. Verified in
a browser on `/agent/8453/6649`: the page renders, the identity section is complete, and there is no
glyph because that agent declared nothing.

**A third thing, found while checking, unrelated and recorded.** `/agent/13579/4` answers
_"No agent there"_: the page resolves against the **canonical** registry address
`0x8004A169…e539a432` on chain 13579, and `data/deployments/13579.json` records `identityRegistry: null`.
So ARP's own testnet rig agents have no reachable agent page at all. Filed as `docs/tasks/28` item 42.

### A tool's glyph is the sigil inverted

> _« ou alors faire l'inverse des sigils, tous les endroits où il est déclaré ? »_

That is the right answer and it is the user's. An agent's sigil is a dot per tool it declared; a
tool's is a dot per **agent that declared it**. The same geometry read the other way, and every dot
is still an agent — so `rules/ui.md`'s "a circle here always means an agent" holds by what the data
is rather than by exception.

`AtomSigil` costs **no query**: the declaring agents are the subjects of the `uses` edges the page
already read to draw its claims. Scoped to `uses` on ADR `0030`'s frozen predicate id, the mirror of
ADR `0057` §5's rule for the agent glyph; hollow throughout, because `proven` needs a third party's
receipt and nothing reads one; `null` below one declarer, for the reason `AgentSigil` returns `null`
on an agent that declared nothing.

### Why the agent sigil was invisible, in full

Three causes, found one at a time, each hiding the next.

**1. The glyph read the wrong source.** Fixed earlier: it walked the capability groups, which are
built through the `same as` join that is zero on testnet. It now reads by atom id.

**2. On mainnet, no agent has ever declared a use.** Measured 2026-10-28 over a page of the 185
`uses` edges: **zero** of their subjects is a mirrored agent. They are `Tip Jar`, `khlypalo`,
`Hartel`, `TevaStar`, `Base`, `I`, `follow`, bare addresses — people and things. So on the chain
where agents are reachable, the glyph is correctly empty for every one of them, and the code's own
comment already said so: _"this group leads nothing today."_

**3. ARP's own testnet agents had no page at all**, which is where the declarations actually are.
`/agent/13579/4` answered _"No agent there"_ because the panel resolved every chain against
`DEFAULT_IDENTITY_REGISTRY` — the canonical `0x8004A169…` on Base, which has no code on 13579 —
while `data/deployments/13579.json` records ARP's own `identityRegistry`
`0xC165A2AD2E540A4069E02834009161E2b4490d5A`.

`identityRegistryFor(chainId)` is the fix, and it names no chain: it compares against
`deployments.chain.chainId`, so it stays true if that record ever describes another one. Other
chains get `undefined`, which lets the package apply its canonical default — the right answer for
Base, and the decision `rules/portability.md` wants the package to keep making alone.

Verified in a browser: `/agent/13579/4` now resolves against `0xC165A2AD…b4490d5A` and **the sigil
renders**. `docs/tasks/28` item 42 is closed by this.

### The nav marker followed the wrong section

> _« quand je clique sur un agent, la navbar switch à "your agent" alors que ça devrait rester sur
> "agents" »_

`NavLink` matched `pathname === to || pathname.startsWith(`${to}/`)`, and `/agent/8453/6649` starts
with `/agent/` — so opening **somebody else's** agent lit **Your agent**.

The sharp part: the comment above that line claimed the opposite. _"Exact for `/`, prefix otherwise,
so `/agent/8453/2340` still lights Agents."_ It never did. A comment describing the intent while the
code did the reverse is `rules/code.md`'s own prohibition, and it is why this survived — a reader
checking the line found a sentence agreeing with them.

The routes do not separate by prefix: `/agent/import` is the operator's own, `/agent/8453/6649` is
not. So the two colliding items declare their paths in `SECTION_PATHS`, everything else keeps the
prefix rule, and four tests now hold it — the rule it replaced had none.

### The design system, applied to the hierarchy

> _« je trouve qu'on devrait éclaircir les blocs numérotés […] revoir la hiérarchie d'importance des
> info car là c'est pas pratique, tout est pareil » · « peut-être des cards pour les actions » ·
> « peut-être un meilleur UI qui reprenne notre design system »_

**There was a design reference for this page and nobody had opened it.**
`arp-design-handoff/arp-design-handoff 2/reference/agent-page.html` — cited in `PanelSection`'s own
docstring, never read. It answers all three complaints in its own CSS:

| the reference says                                                                                  | the page did                                   |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `.act` — actions are cards: 1px rule-strong, 12px radius, 20px padding, on the **panel** background | a figure row and a form on the page background |
| `.act.primary` — the primary action is bordered in **saffron**                                      | nothing distinguished one action from another  |
| `.act h3` — 22px, weight 800, stretch 125%                                                          | section headings at body weight                |

Its three cards are **Declare you used it** (primary), **Back it** and **Take a side**. Two of them
are what the atom page already has; the third is the counter-vault control ADR `0056` §1 removed, on
the user's own measured objection. So the reference and the current product disagree on exactly one
card, and the product is right about it.

**The screen is still not adopted** — ADR `0057` §8, the user's standing decision of 2026-10-22:
_« garde les règles du design mais garde notre implémentation »_. What was taken is the vocabulary,
into `lib/surface-class.ts`: `actionCardClass`, `primaryActionCardClass`, `actionHeadingClass`.

**The hierarchy is split by consequence, not by taste.** Section 01 carried seven fields in one
grid at one weight, one size and one colour. Two of them decide something — **Owner**, which decides
who may declare for this agent (`declare-use.ts` refuses every other wallet), and **Registration
file**, which decides whether anything it claims can be checked. Those lead, at body size. The
CAIP-19, the registry, the token id, the atom and the URL are true, necessary, and never the first
question, so they sit below in silver at label size.

Verified in a browser on `/agent/13579/4`: the two lead facts read first, the plumbing reads as
reference, and section 02 is now visibly a thing you act on while 03 and 04 are things you read.

And `check:tokens` caught a third comment in this task quoting a `var()` as an example — the gate
reads this repo as text, which `rules/ui.md` says in as many words.

### The agent page takes the atom page's shell

> _« la page tools est vraiment mieux, je voudrais la même chose pour la page detailed agent »_

Same shape now: the mark and the name across the top, an 18rem identity column, everything else
beside it. The market is an action card; what a reader _reads_ — who declared it, ratings,
capabilities — is plain beneath it.

**`PanelSection` is deleted, not left unused.** The numbered rail existed to make the page's order
visible — identity, the market, who used it, what others say, each rung costing more to produce
than the one above — and that argument is sound. What it did not need was a 200px mono column
repeating it beside every section. The ordering still says it; `rules/code.md` says the component
goes rather than sits dead.

`AgentIdentityPanel` went back to **one** column, and the reason is not the one that moved it to
two. It ran in two because it was the body of a full-width section where a stack of seven was a
thin ribbon. In an 18rem column, two columns would be two strips four characters wide.

Verified in a browser on `/agent/13579/4`.

## An agent can reach the market

The gap `.claude/STATE.md` named: the market is on the atom (ADR `0056`) and the node only deposited
on the edge, so **2,354 TRUST across 23 positions** on 39 skill atoms was unreachable through ARP.

`packages/protocol/src/declare/market.ts` — `prepareMarketPosition` and `prepareMarketExit`, plans
and never transactions (ADR `0038`). Two MCP tools over them: `arp_take_position`,
`arp_exit_position`.

**A separate module from `prepareStakeOnUsed`, deliberately.** A vault is a vault and
`encodeDeposit` is term-agnostic, so this could have been one more argument to that planner. ADR
`0056` is why it is not: backing a `uses` edge says _this claim is true_ and is attributable to
whoever wrote it; depositing on an atom says _this thing is worth something_ and anyone may do it
for any reason. One planner for both would be the blur that ADR exists to stop.

**The exit ships with the entrance**, same ADR: a deposit nobody can withdraw is a donation. That
needed a whole side of the MultiVault the package did not have — `encodeRedeem`, `previewRedeem`,
`getShares` — taken from the app's working signatures rather than from documentation.

**`PreparedCall.kind` gained `redeem`.** It was briefly written as a `deposit`, which would have had
every surface that renders a plan by its kind announce a withdrawal as a deposit — the one call in
the package that sends no value, labelled as the one that sends the most.

Nine package tests over the two planners, against a fake reader: the floor read per plan, the curve
chosen rather than defaulted, a term that does not exist, an exit larger than the position, an exit
from no position, the zero value, and the preview read rather than computed.

## The endpoints an agent published

> _« j'ai besoin des endpoints affichés »_

`docs/12`: _"ARP verifies an endpoint; the operator provides it."_ This is the second half, and
**only** the second half — declared, never probed. Nothing here makes a request to an agent's host,
so nothing here says whether one answers.

**A browser cannot do the probing half**, which is why it is not here: `verify/probe.ts` would be
every reader of the page firing at somebody else's server, and the package's own `host-limiter`
exists because one operator accounted for 38 of 108 declared endpoints in a sample — a global limit
still points its whole budget at one host. That belongs in the node.

**But it can do the reading half, and that was measured rather than assumed.** The registry's
`tokenURI` takes three shapes on Base 8453 (2026-10-28):

| shape                            | example                                    | readable in a browser                            |
| -------------------------------- | ------------------------------------------ | ------------------------------------------------ |
| `data:application/json;base64,…` | agent 8453:2340, fourteen endpoints inline | **yes, with no request at all**                  |
| an IPFS gateway                  | agent 8453:1380, `ipfs.io/ipfs/bafkrei…`   | yes — confirmed `access-control-allow-origin: *` |
| an arbitrary host                | —                                          | maybe; no CORS header, no read                   |

So the service reports a **reason** rather than an empty list: "published nothing", "declares no
endpoint" and "we could not read what it published" are three different answers about an agent and
a reader must be able to tell them apart.

The two groups are rendered separately because `partitionByCheckability` exists as a function for
exactly that — _"a caller writing its own filter is where that discipline erodes"_. **Callable** is
an http endpoint something could be asked of; **declared, not callable** is a `did:`, a wallet, an
email, each carrying its classification code. One list would imply the second group failed a check
it was never given.

Verified on `/agent/8453/2340`: eleven callable, three not, and the `mcp` row shows its six declared
capabilities — the sharpest check available when it is present, and almost never is.

## The agent page's sections become tabs

> _« tout ça peut aller dans un onglet […] tous les ratings peuvent aussi être dans un onglet rating
> et toutes les capabilities aussi »_

Five answers were stacked — what it published, what is claimed about it, what providers rate it,
what it can do, what could not be read — so a reader scrolled past four to reach the fifth.

**The actions stay above the strip.** Taking a position and declaring a use are things a reader came
to _do_; behind a tab they would be two writes hidden behind a click.

The tabs are built from the view, not fixed: **Not read** appears only when something actually
failed, because an always-present "nothing failed" tab is a row of reassurance rather than
information; **Claims** needs an atom to have claims about. Counts ride on the label where there is
one, and `null` is not shown — an absent count is "the read has not answered", and `0` is a fact.

`SECTION_PARAM` is its own query parameter, separate from the `tab` the **ratings** strip inside one
of these sections already owns. Sharing one would have a provider slug select a section and a
section slug select a provider, each silently falling back to its default — which looks like the
link simply not working.

**The duplication is stated rather than hidden.** `SectionTabs` implements the WAI-ARIA tabs pattern
a second time: `TrustPanelTabs` already has it for provider rows, whose `PanelTab` carries a trust
row and a summary, where this one is generic over `{slug, label}`. So the keyboard handling — both
arrow axes, Home, End, automatic activation, roving `tabIndex` — exists twice, which is exactly what
`lib/control-class.ts` opens by warning about. One should be a shell around the other; that is a
refactor of a working component and belongs in its own change rather than inside a feature.

### What the agent page gained today, in order

`AgentDeclareCard` and `AgentClaims` (the atom page's own components, fed this agent's atom),
`AgentEndpoints` (declared, never probed), `SectionTabs`. `DeclaredUses` was deleted: `ClaimList`
answers a wider version of the same question, since `getAtomStanding` does not presume the predicate
and an agent can be the object of `has tag` or `same as` as easily as of `uses`.

## An agent can reach another agent

Two more MCP tools, which is what the node needed for `docs/13`'s first flow:

- **`arp_agent_endpoints`** — where another agent said it can be reached, split into callable and
  not callable, read from its registration document. Handles the three shapes the registry stores:
  inline `data:` (no request at all), an IPFS gateway, an arbitrary host.
- **`arp_probe_endpoint`** — whether one answers, with the prober's own asymmetry intact: a timeout
  is a verdict about the agent, a TLS or DNS failure is not, a 429 is never one.

**This is not brokering, and the distinction is ADR `0060`'s own.** That ADR removed `hire` because
a delegation names its delegate by address and an agent's runtime address is not on the graph — so
arranging a meeting is a promise with no mechanism. Handing over an address the agent published
about itself is not arranging anything: `docs/12`'s test still passes, unplug ARP's servers and the
call between the two agents completes.

The node now carries **ten** tools against six this morning: find, read a reputation, declare a use,
take a position, exit one, ask where an agent lives, and ask whether that answers.
