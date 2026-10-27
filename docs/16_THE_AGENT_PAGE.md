# 16 — The agent page: a design brief

**For:** the designer working on `/agent/:chainId/:tokenId`.
**Status:** brief, not a spec. The ordering is decided; the layout is not.
**Date:** 2026-10-27

You do not need to read the rest of `docs/` to use this. What you need is here.

---

## The one idea

A visitor reads a record — **what is known about this agent, and who paid to say it** — and, with a
wallet, can add to it.

Not a product page. A visitor cannot hire this agent from here and the product does not try to let
them: there is no directory of reachable agents and no marketplace. What they can do is **put their
own money on the record**: back the agent, declare they used it, or take a side on somebody else's
assessment of it.

So the page is two things at once, and both halves obey the same rule. Everything on it is either
something the agent said about itself, or something a third party **paid money** to say. Those are
not the same kind of fact and the page must not render them as though they were.

> **Free claims go down and dim. Paid claims go up and loud.**

That is the whole design constraint. If you only take one thing from this brief, take that.

An agent saying "I am a DeFi agent" costs nothing and proves nothing — 30,913 agents say things
like it. Someone writing "I used this agent" costs them 0.1 TRUST that never comes back, with their
address attached, permanently. One of those is worth the top of the page.

---

## What the page must never do

- **Never publish a score.** ARP has no opinion about any agent and never will. Every number on
  this page is a deposit somebody else made. There is no rating, no grade, no stars, no "trust
  level", no colour-coded verdict.
- **Never add amounts across different vaults.** Seven people each backing a different claim is
  seven facts, not one total. Count the people; never sum their money.
- **Never show a tiny amount as if it were a market.** Every atom on this chain is seeded with a
  dust amount at creation, so an agent nobody has backed still reports ~0.000000000001. Render that
  as **"no backing"**, never as a number. A figure for capital that does not exist is worse than no
  figure.
- **Never put an explanatory paragraph in a card.** If a figure needs a caveat, it gets a small "?"
  that opens one sentence on hover **and** on keyboard focus. Explanations live in the code, not on
  screen.

---

## The sections, in the order they must appear

Ordered by how much the claim cost whoever made it. Not by how much space it needs.

### 1. Who it is
Name, description, avatar.

Roughly half the cohort registered with no metadata, so the indexer invents a name like
`Agent 8453:6649`. When that happens the page says so — rendering a generated label as the agent's
chosen name misdescribes the majority of the population.

### 2. Its sigil
A generated dot glyph, 7×7, mirrored, no container and no connecting lines. Same agent, same glyph,
everywhere, forever.

One dot per tool the agent declared using. **Filled** = a third party confirmed it. **Hollow** =
declared only. The centre turns warm when the connected wallet holds a position here.

Today every dot is hollow, because nothing reads receipts yet. That is the true state of the graph,
not a loading state. It is absent entirely for an agent that declared no tools — a glyph of nothing
but its centre is the same glyph for every such agent, so it would stop being an identity.

### 3. Who used it ← **the most important section on the page**
The strongest evidence that exists here. Other parties, each naming themselves, each having paid.

Show: **how many distinct parties declared using it**, and **how many of those paid** to say so.
Then the list — who, and what each put behind their own claim.

Not currently on this page at all. It is the gap this redesign exists to close.

### 4. Does it answer?
Its registration file declares endpoints. Whether one of them responds is a **fact**, not a claim —
so it ranks above everything below it.

Not built yet. Design the slot; it will be filled.

### 5. What is posed on it
The vault on the agent's own atom: how much TRUST, and **how many accounts**. Plus the viewer's own
position if they have one.

This is attention, not endorsement — anyone can deposit here for any reason and nobody can take the
other side. Do not let it read as approval.

### 6. Its curve
How the position evolved over time, and the shape of the distribution: does one account hold most of
it, did everyone arrive on the same day.

Exists elsewhere in the product and moves here.

### 7. Three ways to add to the record, and they are different acts
- **Back it** — put TRUST on its atom. Anyone, any reason, withdrawable. It stays yours; it is not a
  payment to the agent.
- **Declare you used it** — write the edge. Costs 0.1 TRUST, gone, with your address on it. **This
  is the product.**

- **Take a side on an assessment** — back or contest what a trust provider published about it.
  That one lives with section 9, beside the claim it is about.

The second is not in the interface today. Design it as though it were.

These are not a footer. They are half of what the page is for, and the ordering above is as much
about *what a visitor can add* as about what they can read.

### 8. What it says it can do
Declared capabilities: type, protocols, categories, tags, tools it uses.

Lower and quieter than section 3. It is free to write.

### 9. What an assessor says
A trust provider's published assessment, with its signature checked, and the ability to back or
contest that assessment.

One company's opinion, free to write. **Not ARP's opinion** — ARP has none.

### 10. Its technical identity
CAIP-19, registry, token id, owner, registration file, URL. Every address clickable to the right
explorer: the owner to **its own chain** (Base, BSC, Ethereum — never Intuition, which would be a
live link to the wrong network), the atom to the Intuition portal.

### 11. What could not be read
Which source failed, and where two sources disagree. Said out loud, not hidden.

---

## Three things easy to miss

**An agent can have several registrations.** Measured: some names carry several ERC-8004 tokens. A
reader who sees one assumes it is the only one.

**Two chains, two different answers.** The product has a mainnet/testnet switch. The same agent id
names two entirely separate vaults with entirely separate money. Never show a figure without it
being clear which chain it came from.

**Nothing here is a loading state dressed as data.** When a figure cannot be read, the page says it
cannot be read. "Not reported" and "none" are different sentences.

---

## The design system is already decided

Do not redesign it. It is in `arp-design-handoff/HANDOFF.md` and ADR `0057`.

- Graphite neutrals, **one warm accent** spent only on the primary action, the selected state, and
  the viewer's own position.
- Archivo for type, Geist Mono for every address, id, hash, amount, timestamp and label.
- Hairlines separate. No shadows, no gradients, no glow.
- Corners tiered 6 / 8 / 10 / 12px. Full circles only for dots and sigils, so a circle always means
  "an agent".
- Dense lists. Hierarchy from type weight, not from boxes.
- One loader, built from the logo. Static under reduced motion.
- No mouse-reactive effects. Row hover is a background change and nothing else.

---

## What to give back

A layout for the eleven sections above, at 1440px and at 390px, in dark.

The question to answer with the layout: **can a visitor tell, in five seconds, the difference
between what this agent claims and what other people paid to confirm?**

If the answer is no, the ordering is right and the layout is wrong.
