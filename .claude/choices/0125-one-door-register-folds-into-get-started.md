# 0125 — One door: Register folds into Get started

**Status:** Accepted
**Date:** 2026-11-03
**Triggered by:** `docs/tasks/62-one-door.md`, user decisions 2026-11-03: _« pourquoi garder
register si on peut juste garder get started ? »_, then _« oui »_ to the plan below.

## Context

Since task 53 (ADR `0114`) the web app had two doors for putting an agent or a tool into ARP:
Get started, which opens the onboarding panel and `/start/<profile>`, and Register in the nav,
which opened `/register` (task 46d). They wrote the same data. A tool's atom id is a pure function
of its URL (ADR `0054`), and on testnet both agent paths mint into ARP's registry on 13579. What
differed was who pays: the sponsor (testnet 13579 only, ADRs `0110`, `0123`) or the operator's
wallet.

`/register` held three things `/start` did not: importing an agent that already has an ERC-8004
id, the wallet path when the sponsor cannot help, and mainnet, where no sponsor exists and the
wallet mints on Base.

## Decision

**`/start/<profile>` is the only door, and the wallet is an option inside it, not a second door.**

- `/start/agent` asks whether the agent already has an id. Yes (`?have=yes`) shows the import in
  place of the steps, because running the steps would mint a second identity. Otherwise the
  sponsored steps show, with the wallet mint behind `?with=wallet`.
- `/start/tool` opens the wallet form on the same page (`?with=wallet`).
- The nav's Register becomes Get started, opening the same panel as the landing, so the door is
  reachable from every page.
- `/register`, `/agent` and `/agent/import` redirect to the branch they named. `what=tool` and
  `what=agent&have=no` land on `?with=wallet`, because those were `/register`'s wallet forms;
  `have=yes` lands on the import; a bare `what=agent` lands on the question; no `what` lands on `/`.

## Alternatives considered

- **Keep Register and drop Get started's agent and tool paths** — the landing's panel would then
  hold only "I use Claude", and the sponsored path, the free one, would be the second door.
- **Keep both** — two entry points for one datum, the duplication the user pointed at.
- **Make the nav item a link to the remembered `/start/<profile>`** — skips the panel's "I use
  Claude" choice for a visitor who has not picked yet. The panel is what the landing opens, so the
  nav opens it too.

## Consequences

**Positive:**

- One flow per thing put into ARP; the sponsored path comes first and the wallet path is its
  fallback on the same page.
- Mainnet keeps a way in: the wallet forms are unchanged and still follow the chain toggle.

**Negative:**

- The nav item is a button, not a link, so it cannot be opened in a new tab. `/start/<profile>`
  URLs still can.
- Under "No", the unanswered state of the id question renders as answered, because the steps are
  the default.

**Neutral (worth knowing):**

- The nav's Get started and the hero's Get started are on the landing at once. Both open the same
  panel.
- ADR `0114` item 1 says the panel opens "from the nav's Connect button and from Get started";
  the nav now has a Get started of its own as well.

## References

- Related rule: `.claude/rules/ui.md`
- Related task: `docs/tasks/62-one-door.md`, `docs/tasks/53-one-path-per-profile.md`,
  `docs/tasks/46-the-redesign-from-references.md` (46d)
- Related ADR: `0114`, `0054`, `0110`, `0123`, `0062`
