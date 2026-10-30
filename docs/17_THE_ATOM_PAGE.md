# 17 — The atom page: a design brief

**For:** the design agent. **Status:** a brief, not a decision.
**Date:** 2026-10-27
**Route:** `/atom/:atomId` — `apps/web/src/pages/AtomPanel.tsx`

Read `docs/12_THE_IDEA.md` first. It is short and it is the only canonical statement of the
mechanism. This brief assumes it.

---

## 1. What this page is

An **atom** is any node in the Intuition graph: a tool, a tag, a category, a protocol, an agent.
This page shows one of them and **everything that points at it**.

Every arrow pointing at an atom is a sentence somebody wrote and paid for:

> `Agent 13579:3` — **uses** — `slither`

The page's whole job is to make the shape of those sentences legible: who is saying things about
this thing, what they are saying, and what it cost them to say it.

**It reads. It does not write.** No form, no button that spends. The acts live elsewhere.

---

## 2. The problem with what is there now

A flat list, grouped by predicate, with a row per claim. It is correct and it is inert. Two
complaints, both from the user, both fair:

1. **It is a list of parts, not of statements.** Fixed in the current build — each row now reads as
   a sentence — but a list of sentences is still a list.
2. **Nothing conveys weight, pull, or time.** A tool used by forty agents with real money behind it
   looks like a tool used by one, two rows further down the page. The figures are on screen; the
   _shape_ is not.

What is wanted, in the user's words: _« une histoire de lien de gravitation autour du tool, avec
des identités qui ont déclaré l'utiliser ou qui ont pris position, peut-être avec des flux
différents »_, plus _« les courbes d'utilisation et de valeur du tool »_.

---

## 3. The data that exists — build against this, not around it

Everything below is already readable today, with the functions named. **If a design needs a field
that is not in this section, say so explicitly in the delivery** rather than mocking it; half the
ideas that die here die because they assumed a number nobody can produce.

### 3.1 The atom and its incoming edges — `getAtomStanding(atomId)`

| field                           | what it is                                                          |
| ------------------------------- | ------------------------------------------------------------------- |
| `label`, `type`, `pinnedUri`    | the atom's own name, its Thing type, its IPFS document              |
| `market`                        | the atom's **own** vault: `totalAssets`, `positionCount`            |
| `groups[]`                      | every incoming edge, grouped by predicate                           |
| `groups[].predicate`            | `{atomId, label}` — and the label is whatever anybody chose         |
| `groups[].edges[]`              | one per claim: `subject {atomId, label, type}`, `support`, `oppose` |
| `groups[].assets`, `.positions` | summed within the group, never across groups                        |
| `edgeCount`, `truncated`        | how many claims, and whether the read hit its cap                   |

Each `support` / `oppose` is a `MarketSide`: `totalAssets`, `positionCount`, `currentSharePrice`,
`totalShares`.

### 3.2 Concentration — `getTermShape(termId, {curveId})`

| field                           | what it is                                                 |
| ------------------------------- | ---------------------------------------------------------- |
| `positionCount`                 | how many accounts hold this term                           |
| `largestShareBps`               | the biggest single holder, in basis points of total shares |
| `topThreeShareBps`              | the top three together                                     |
| `firstPosition`, `lastPosition` | when the first and last **backer arrived**                 |

`largestShareBps` is the one field that can say "this looks like one person" without ARP saying it.

### 3.3 Time — `getTermActivity(termId, {grain})`

Buckets at `hour` / `day` / `week` / `month`:

| field     | what it is                                            |
| --------- | ----------------------------------------------------- |
| `bucket`  | ISO start of the bucket                               |
| `signals` | deposits **and** redemptions that landed in it        |
| `volume`  | TRUST moved in either direction, in wei — **not net** |

This is the curve. It exists, it is per term, and `TermShapePanel` already renders a sparkline from
it. It is **activity**, not price: a redemption adds to `volume` exactly as a deposit does.

### 3.4 What does **not** exist, and must not be drawn

- **A score, a grade, a rank or stars.** ARP composes none, ever (ADR `0046`). A visual that sorts
  by a single computed number is the same claim in another medium.
- **A price history.** `currentSharePrice` is a point reading, not a series. Nothing stores the
  past price of a term.
- **Receipts** — an action executed under enforced caveats. The machinery exists, nothing produces
  them yet. No "proven" state may be drawn as if it had data.
- **A domain or category per agent.** Sampled, not resolved.
- **Anything about an identity beyond its atom**: no avatars we can trust, no follower counts, no
  off-graph reputation.

### 3.5 Two traps that will make a design wrong

- **Dust.** Every term is born holding `minShare` — 1,000,000 wei — so an unbacked claim still
  reports a non-zero amount. **`positionCount === 0` is the test for "nobody is behind this", never
  the amount.** A gravity visual sized by `assets` would give every empty claim a visible mass.
  ADR `0042`.
- **Two markets, never summed.** The atom's own vault and the vaults on the edges pointing at it
  are different markets answering different questions: _is this thing worth something_ against _is
  this one claim about it true_. ADR `0056`. A single total across both is a number that means
  nothing.

---

## 4. The idea to develop

A **field**, not a chart. The atom sits at the centre; everything that points at it orbits.

The user's framing, which is the right one: identities are held in orbit by what they put behind
their claim. Make the physics carry the facts rather than decorating them.

**What should map to what** — a starting proposal, to be argued with:

| visual property                           | the fact it carries                                           | source                                                    |
| ----------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| **distance from centre**                  | how much is staked on that claim — close means heavily backed | `edge.support.totalAssets`, only when `positionCount > 0` |
| **mass / size of the node**               | how many accounts stand behind that claim                     | `edge.support.positionCount`                              |
| **orbit, by ring or by colour**           | the predicate — `uses`, `has tag`, `implement`                | `groups[].predicate`                                      |
| **a counter-current or an opposing pull** | somebody staked **against** the claim                         | `edge.oppose.positionCount > 0`                           |
| **the centre's own mass**                 | the atom's own vault                                          | `market.totalAssets` / `positionCount`                    |
| **an unbacked claim**                     | present, and visibly weightless — it exists and cost nothing  | `positionCount === 0`                                     |

The last row matters most. **A free claim must be visible and must not be able to look heavy.** It
is the bottom rung of `docs/09` §3's ladder and the whole page is an argument about the difference.

### Constraints the field has to survive

- **One claim.** The common case by a wide margin. A field with one orbiting node must look
  deliberate, not broken.
- **Two hundred claims.** The read caps at 250. Past some count, individual nodes stop being
  readable — decide what happens then and say so, rather than letting it become soup.
- **Zero claims.** Most atoms. The centre alone, and it should read as "nothing points at this
  yet", which is not a failure.
- **Arbitrary predicates.** Anybody may use any atom as a predicate. Probed on mainnet 2026-10-27,
  one book's atom is the object of edges whose predicates are `Ethereum`, `Bitcoin`, `prefers` and
  `Donald Trump`. A design that assumes a fixed palette of five predicates will meet a sixth.
- **No mouse-reactive effects.** No parallax, no repulsion on hover, no cursor trails — all four
  previously rejected by the user. Motion may express data; it may not express the pointer.
- **`prefers-reduced-motion`.** The field has to hold still and stay readable.
- **The list does not go away.** The field is how you see the shape; the list is how you read the
  sentences and follow a link. Both, and say how they sit together — side by side, below, or the
  field as a header band.

---

## 5. The two curves

Beneath the field, or beside it:

1. **Activity** — `signals` per bucket. How often anybody did anything about this atom.
2. **Value moved** — `volume` per bucket. How much, in either direction.

Both from `getTermActivity`. Both honest about what they are not: this is money **moving**, not a
price. A redemption is a signal and adds to the volume. Label them so that cannot be misread.

Grain is a real choice — `hour` to `month` — and the right default depends on the span, which
`firstPosition` / `lastPosition` give.

---

## 6. The rules this has to obey

From `.claude/rules/ui.md`, and they are not negotiable:

- **Dark first.** Graphite neutrals. Saffron `#FFB020` is the **only** accent and it is spent on
  three things: the primary action, the selected state, and **the viewer's own position**. Nothing
  decorative may use it.
- **One alarm colour**, `--color-alarm`, for a signature mismatch or a used-but-undeclared module.
  Nothing else.
- **No gradients, no glows, no shadows.** Borders are hairlines.
- **No explanatory sentence inside a panel.** A figure that genuinely needs a caveat gets a `Hint`
  — a 15px "?" that opens one sentence on hover **and** keyboard focus.
- **Mono for data, Archivo for prose.** Every id, amount and timestamp is mono.
- **Circles are reserved for dots and agent sigils**, so a circle on this surface already means
  "an agent".
- **Accessible.** The field needs a text equivalent that carries the same facts, not a caption
  apologising for a canvas.

### The sigil already exists

An agent's identity mark is generated from chain data — a dot per declared module, fill carrying
its state, size carrying its tier, Saffron centre when the viewer holds a position. It is in
`apps/web/src/components/brand/Sigil.tsx`. **Orbiting nodes that are agents should be their sigils**,
not new glyphs. One identity, one mark, everywhere.

---

## 7. What to deliver

A single self-contained HTML file, as before, in `docs/design/brand/v2/reference/`.

- Fed by a JSON blob at the top shaped like §3, so the wiring is obvious.
- **The empty, the one, and the two-hundred cases all rendered** — not just the flattering one.
- Working at phone width.
- Static under `prefers-reduced-motion`.

And one short section in prose: **what you dropped and why**. The last handoff's most useful page
was the one listing which of its own assumptions were stale.

---

## 8. The question to answer first

Before any of the above: **does a reader learn something from the field that the list does not tell
them?**

If the honest answer is "it looks better", say so and we will do something else. The list is
correct and legible today; a visual that is only prettier is a cost with no payer. The case for the
field is that **relative weight across many claims is a shape, and a column of numbers is not** —
so the test is whether somebody can look at it for two seconds and say which claims carry the
graph, and which are free.
