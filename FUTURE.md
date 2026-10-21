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
