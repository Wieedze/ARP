# Future

Asked for, deliberately not built yet. `rules/workflow.md`: an idea that would expand the current
task's scope goes here rather than into the task.

Nothing in this file is a commitment. It is a record of what the user asked for and when, so the ask
does not get lost and does not get smuggled into an unrelated change.

---

## A profile page

**Asked 2026-10-21.** _« une page profile avec dedans le récap de mes stake via ARP, ainsi qu'une
partie avec les tools et agent que j'ai register ou autre, la possibilité d'avoir le nœud et les
différentes config de compte possible »_ — behind a connected wallet.

Four things on one screen:

1. the stakes this account holds through ARP, both sides of each claim;
2. the tools and agents this account registered;
3. the node — how to get it and how to run it;
4. account configuration.

**What it needs first.** (1) is a read nothing in the app does today: positions are per vault and
`getShares(account, termId, curveId)` answers one at a time, so a per-account view needs either an
indexer query over the account's positions or a list of the terms to ask about. (2) has no source at
all — ARP stores nothing (ADR `0051`), so "what I registered" has to be derived from on-chain history
or from the account's own positions, and those are different sets. Decide which before building.

Explicitly ordered after the agent surface: _« mais en plus de ça je veux d'abord qu'on finisse toute
la partie agent »_.

## Register ARP's own skill and MCP as tools

**Asked 2026-10-21.** Register `skills/arp/SKILL.md` and the ARP MCP server as the first two tools,
once the register screen exists.

**The decision that has to come first, because it is permanent.** Under ADR `0054` the atom id is a
pure function of the normalised URL, so the URL chosen _is_ the identity, forever. The user's own
measured example: `sofia.intuition.box` carries 30 atoms across 28 distinct URLs under 21 names.

Settled in conversation:

- **the repo root, not a subpath.** A `/tree/main/...` URL depends on the branch name and on the path
  never moving, and this repo has already been reorganised twice (ADR `0041`).
- **two atoms, not one.** The skill and the MCP are different things; one URL for both merges them.
- **a GitHub organisation**, `arp-protocol`, matching the package scope already in use. A transfer
  installs a redirect so the pointer keeps resolving, but the atom's name is frozen at whatever it
  was created with, and the redirect dies if anyone later recreates the old name.
- **separate repos for the URL, not a separate source of truth.** The skill cites figures produced by
  this repo's scripts, and ADR `0052` makes the procedure the product — publish to the separate repos
  by a sync script rather than moving the source.
- **testnet does not count.** `rules/portability.md`: the testnet is a rehearsal, its atoms are
  disposable. The decision binds at the first mainnet `createAtoms`.

Still open: the MCP is a **stdio** server, so its URL can only ever be a source location, never an
address a reader can call. If it should one day be callable, the atom has to carry a domain the user
controls rather than a GitHub URL — and that choice is permanent too.

## A "How it works" tab

**Noted in the nav since 2026-10-20**, `app/src/components/Layout.tsx`. Its own comment says why it
is not built: _"its content is a decision, not a layout."_

## One screen for register and declare

**Asked 2026-10-21.** Paste a URL; the screen says whether an atom exists for it; then offer to
create it or to take a position on it.

Half of it is now possible and half is not. `normaliseToolUrl` + `toolAtomUri` give the id with no
credential and no network, and `intuitionToolAtomLookup` answers "does it exist" — so the read half
is a function call. The write half needs the subject: a `uses` edge carries the **agent's** identity
atom (ADR `0032`), and a human pasting a URL is not an agent. Decide whose claim the screen writes
before building it.

`/modules/new` is the current register page and still writes to `ModuleRegistry`, which ADR `0051`
classes as legacy.

## A gate for the Tailwind utility that does not exist

**Found 2026-10-28, while closing `tasks/29`.** Not asked for — it goes here because it is a scope
expansion on a task about motion, and `rules/workflow.md` says that is this file's job.

`rules/ui.md` §Gates names two failure classes no static check sees, and the first one is **a
Tailwind utility that does not exist**: v4 emits nothing, silently, so a typo and a real utility
both pass `tsc`, `eslint` and `check:tokens`. `check:tokens` is explicit that it does not cover it
— _"It reads `var()` references, not class names."_

**It is checkable, and the measurement is committed**: `scripts/measure/emitted-utilities.ts`.
Tailwind writes one rule per utility it recognises, so a utility that emitted nothing is simply
absent from the built stylesheet; strip the CSS escaping and a selector reads exactly like the class
it came from. Measured 2026-10-28, after `cd app && bun run build`: **351 utility tokens across
`app/src`, every one with a rule.** Pass paths to narrow the population.

**Three things to decide before making it a gate**, all of them in the script's own docstring:

1. It needs `bun run build` first, so it is slow — it belongs next to the build, not in the
   four-gate list.
2. **It over-reports.** Tailwind scans source files as text, so a class-shaped string in a
   _comment_ emits a real rule. This repo shipped a dead `.z-15{z-index:15}` generated from the
   word `z-15` inside a docstring, which is `ui.md`'s "a string in a class name is a string to
   every other tool here" arriving from the other direction.
3. A naive extractor cries wolf: a first attempt reported 268 "missing" tokens, almost all of them
   utilities the app had shipped for weeks, because the regex stopped at the `:` inside
   `text-[color:var(--color-steel)]`. **A gate that cries wolf teaches people to silence it**,
   which is what `check-contrast.ts` is careful about in its own docstring.

**A claim made here that was false**, recorded because the correction is the useful part. `tasks/29`
reported that `z-15` is "not on Tailwind's z-index scale of 0/10/20/30/40/50" and that `z-[15]` is
"the spelling that works". **Both halves are wrong.** Under this repo's Tailwind v4 the `z-<number>`
namespace is open: `.z-15{z-index:15}` was in the shipped stylesheet when the reviewer checked, and
`z-37` emits too. `z-[15]` is harmless and was never required; it is still what the code uses,
because changing it back now would be churn. The claim came from the default-scale documentation
plus a shell check whose quoting was broken — it printed "NOT EMITTED" for sixteen utilities that
all exist — and a reviewer disproved it with one command. `rules/claims.md`: **a correction is not
exempt from the rule it corrects**, and the earlier count was the same failure in miniature — the
same hand-check gave 119, then 140, then 165 from three different extractors over three different
file lists. One script now defines the population.

The second failure class — a utility **defeated by an unlayered rule** in `index.css` — stays
uncovered, and a comment at the call site is still the only defence.

## A script for the claim that exists at N sites and gets fixed at N−1

**Found 2026-10-28, across four verification rounds on `tasks/29`.** Not asked for, and it is a
change to how this repo checks itself, so it belongs here and needs its own task and ADR rather
than being absorbed into a UI task.

Four rounds of verification on one task. The work passed every round; the **sentences about it**
failed every round. The items differed each time and the mechanism never did: **a figure or an
enumeration exists at N sites and gets corrected at N−1.** `rules/claims.md` §5 is entirely about
this and was being read each round, which is the point — attention is not the fix.

Worst instance, because it is a new failure mode: a correction _destroyed_ a site the stale
sentence already had. "five task files and two PR drafts" was replaced by a measured table that
listed one PR draft. **Grep before overwriting, not after.**

Three of the seven defects in the fourth round were mechanically detectable with no judgement at
all:

1. **A markdown table whose row count disagrees with the count asserted in the nearest sentence.**
   Twice in one round — "11 line sites across 9 files" over a 12-row table, and "those four lines"
   over five.
2. **A figure in a file's header and again in its body with different scope.** The 8px overflow was
   narrowed in the body and left unqualified in the header, 150 lines above it and the first thing a
   reader hits.
3. **"recorded N times" where a grep returns N+1.** `solhint` was "recorded three times"; it is
   four.

`scripts/measure/claim-sites.ts` — given a number, a phrase or a file list, print every site and
flag any enumeration whose length disagrees with the count asserted beside it — would have caught
four of the seven in one run.

**`rules/claims.md` says "commit the script, not the number", and the rule has never been applied
to itself.** That is the whole of the idea.

Two things to decide first. What counts as "the nearest asserted count" is a heuristic, and a
heuristic that cries wolf gets silenced — the same trap `check-contrast.ts` was careful about and
`scripts/measure/emitted-utilities.ts` documents. And the grep has to be over the **concept**, not
the sentence: the browser-premise sweep needed five different phrasings and 123 hits read by hand
before the count was right, which no single pattern would have found.
