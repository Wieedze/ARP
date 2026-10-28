# 0069 — The landing is six scenes, and the evidence ladder is not one of them

**Status:** Accepted
**Date:** 2026-10-28
**Triggered by:** user decision, relayed through `arp-motion-reference/MOTION-V2.md` §0 D5, D6, D7

## Context

The landing shipped on 2026-10-27 as a hero plus four figures plus a manifesto. Two of those sections
and about a dozen sentences did not survive the design session. The three decisions below are one
subject — what the front page says — so they are one ADR.

### D5 — the evidence ladder comes out

`Fig. 02` was `docs/09` §3 rendered as four rows: asserted, rated, staked, proven, with ARP's two
lit and the other two dimmed. The user's verdict was one word: _« c'est inutile. »_

He is right about the page, and the reason is worth recording because the ladder is still correct
and still load-bearing **elsewhere**. It is an argument about _categories of evidence_, aimed at
somebody already asking "how is this different from a review site". A first-time reader has not
asked that question yet, so the section answers an objection it has just raised on their behalf,
using four terms none of which they know. It also spends a sixth of the page saying ARP is better
than two things it does not name.

`CLAUDE.md`'s evidence-ladder check is unaffected: it asks every task which tier it serves. That
remains the right internal discipline. It was never an argument to put on a landing page.

### D6 — "Three ways to add a beat" becomes four jobs

`Fig. 03` listed three acts, all of which required a wallet, under the heading "Each one costs you
something". The replacement is the four jobs from the README — **check, declare, list, be hired** —
with what each one needs, and `check` first because it is free. A page whose first offer costs money
has asked for a commitment before it has shown anything.

**`be hired` is a scope trap and is worded against it.** ADR `0060` took hire and pay out of scope:
ARP records a use, it does not broker one. The card may say that other agents can find yours and
call it, and that ARP hosts nothing. It may **not** promise payment, a marketplace, or a matching
service.

### D7 — the copy removals

Eleven sentences out, listed in `MOTION-V2.md` §3. Three of them had reasons worth keeping:

- **"Never signs" / "holds no key, has no send path"** — true (ADR `0038`) and meaningless to anyone
  who has not already worried about it.
- **"ARP has no opinion about any agent" / "Every number is somebody's deposit"** — ADR `0046` as a
  manifesto line. Same failure as the ladder: it answers an unasked objection. The manifesto keeps
  "No score. No grade. No stars." and gains "Just what agents really use. / On the record, for
  anyone to check." — which states the positive rather than denying a negative.
- **"Over 444,000 agents" with its dot grid** — a cohort size, which is the one figure on the page
  that was about somebody else's protocol rather than about ARP.

## Decision

**Six scenes: Pulse, What you see, Why, For you, No score, Build.** The evidence ladder is removed.
`Fig. 03`'s three wallet acts become four jobs, reading first. The removals in `MOTION-V2.md` §3 are
removals, not rephrasings.

**Scene 2 is new and is the one that does real work.** "See what every agent runs on" shows two
readers of the same record — choosing an agent by its tools, and watching which agents declared
yours — because that is what the user named as the thing people want (2026-10-28): _« ce qui fait
bouger les gens c'est les tools, choisir un agent, et voir quels tools sont utilisés. »_

**Both cards come from `use-recent-declarations`, grouped two ways** — by subject for the agent
card, by object for the tool card — **or they say there is none.** `MOTION-V2.md` §2 names
`use-find-agents` and `use-tool-usage` as well, and neither can be called here: `findAgents` needs a
search term and `getToolUsage` needs a `0x`-prefixed atom id, and a landing page has no route
parameter and no query box. Grouping the one query the page already makes is what keeps this real
without a second round trip; a tool's or an agent's full record is on its own page, where there is
an id to ask about. The reference's `vault-auditor` and `crytic-runner` are samples and must not
ship — `Landing.test.tsx` greps for them.

## Alternatives considered

- **Keep the ladder further down the page.** Rejected: "move it lower" is how a page accumulates. If
  the argument is not worth a scene it is not worth a paragraph, and it is already in `docs/09` and
  in every completion report.
- **Keep three acts and add the fourth.** Same four cards, but `declare` first. Rejected for the
  reason above — the free thing goes first.
- **Keep "Never signs" as a mono line in the Build scene.** Tempting, and it is the sort of fact a
  developer does want. It survives where developers actually look: `skills/arp/SKILL.md`, the
  package README, and ADR `0038`. The Build scene instead contrasts the usual way with ARP's, where
  "no key, no account" is one of four lines that together mean something.
- **Sample data in scene 2 so the cards are never empty.** Refused outright. The handoff's own
  instruction and this project's whole argument: _real data or a sentence saying there is none._

## Consequences

**Positive:**

- The page leads with what a reader can see and do, and defers every comparison. Two of the six
  scenes are now about the reader rather than about the protocol's position.
- Scene 2 is the first part of the landing that reads live data beyond a count, so the page breaks
  if the graph query breaks — which is the right failure direction.

**Negative:**

- **Scene 2 has three empty states and they all have to be designed**, not fallen into. On mainnet
  today `getRecentDeclarations` returns zero, so the honest version of both cards is empty on the
  chain the page defaults to. That is more surface than the sample it replaced.
- The ladder's removal takes with it the only place the page named what ARP is _not_. Readers who
  arrive assuming "another agent review site" now have to infer the difference from the mechanism.
- `docs/09` §3 is now cited by `CLAUDE.md` and by no user-facing surface. It is worth checking, next
  time anyone reads it, that it has not quietly become internal-only documentation of a public
  argument.

**Neutral (worth knowing):**

- Six scenes at one viewport each makes the pinned deck 600svh. Every scene has to fit at 1440×680 or
  the deck silently stops pinning at that size (`MOTION-V2.md` §3, §5).

## References

- Build contract: `arp-motion-reference/MOTION-V2.md` §0 D5–D7, §3
- Related ADR: `.claude/choices/0060-arp-records-it-does-not-broker.md` (why `be hired` cannot
  promise payment), `.claude/choices/0046-arp-scores-nobody.md` (the manifesto's source),
  `.claude/choices/0053-every-term-is-born-with-a-position.md` (the declaration floor the
  `declare` card prints)
- Related doc: `docs/09_POSITIONING_AND_PLAN.md` §3 (the ladder, still authoritative internally),
  `docs/12_THE_IDEA.md`
