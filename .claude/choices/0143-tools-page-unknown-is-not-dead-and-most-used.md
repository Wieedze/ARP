# 0143 — /tools counts only what the sponsor deposited for an agent

**Status:** Accepted
**Date:** 2026-11-05
**Triggered by:** the user, 2026-11-05, looking at `/tools`: « ici rien ne change », then « on enlève tout ce qui ne vient pas du sponsor, c'est notre filtre » and « mainnet on repartira de 0 ».

## Context

Tests on testnet 13579 wrote to skills that the page did not lift. Four causes:

1. `rankTools` put `unknown` liveness below `alive`, before any figure. `unknown` means the repository is not in `apps/web/src/data/repo-facts.json`, 53 repositories read on 2026-10-29, whatever its age.
2. `VITE_ARP_SPONSOR_ADDRESS` was unset, so sponsor deposits read as declared and Usage stayed empty.
3. No order sorted on Usage.
4. `proven` counted every deposit the sponsor sent, including the first position of a triple it created, which goes to itself and has no proof behind it. ADR `0110` already says the position that counts has the agent as receiver.

## Decision

**The filter.** Usage counts deposits sent by the sponsor to another wallet. Nothing else counts on `/tools` or in `/search`'s order: the Declared column and "Most declared" are gone, and **Most used** is the default.

**Mainnet starts from zero.** No sponsor exists there, so the Usage column stays on the page, empty, deliberately, and `/tools` and `/search` order by installs or stars. There is no second rule per chain. A sponsor on mainnet needs its own ADR (`rules/security.md`).

**`unknown` ranks with `alive`.** Only `dead`, the owner's own word (archived or gone), sinks a tool.

**The label.** "Most used" was refused on 2026-10-27 for edges anyone can write (`docs/tasks/42`). It sits here on deposits that passed the proof gate (ADR `0094` §2), and the user accepted it on 2026-11-05.

**What is unchanged.** `listTools` still returns `declaredDeposits`, now including the sponsor's creation deposit, as its doc says. The Support column still reads every wallet, and is shown, not ranked on.

**Ties.** At equal Usage, installs, then stars, then the name. Edge count, positions and amount no longer order anything, so no deposit outside the sponsor can move a tool.

The address goes in `apps/web/.env`, git-ignored, because Vite reads that directory.

## Alternatives considered

- **Keep Declared beside Usage.** The user chose one filter: a deposit with no proof behind it says nothing here.
- **Count only wallets that paid their own deposit.** It would read zero today and misses the design: the agent holds the position, and the sponsor pays for it (ADR `0094`).
- **Regenerate `repo-facts.json` instead of changing the rank.** It fixes today's repositories and the next tested one is buried again.

## Consequences

- ARP's sponsoring service is the only judge of this order. A third party's deposit, of any size, does not move it.
- Usage measures proofs the service accepted. On testnet today those are ARP's own tests, so the order demonstrates the mechanism and says nothing about what the market thinks.
- A tool with lines signed directly and no sponsored deposit reads zero, as `cut-silences` does.
- An unread repository can rank first, and one archived since the list was read ranks with the live ones until the list is regenerated.
- A deployed build needs the variable set: a fresh checkout has no `apps/web/.env`.
