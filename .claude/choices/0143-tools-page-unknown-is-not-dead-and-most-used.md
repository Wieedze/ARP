# 0143 — /tools counts only what the sponsor deposited for an agent, as Signals

**Status:** Accepted
**Date:** 2026-11-05
**Triggered by:** the user, 2026-11-05, looking at `/tools`: « ici rien ne change », then « on enlève tout ce qui ne vient pas du sponsor, c'est notre filtre » and « mainnet on repartira de 0 », and « signals » for the name.

## Context

Tests on testnet 13579 wrote to skills that the page did not lift. Four causes:

1. `rankTools` put `unknown` liveness below `alive`, before any figure. `unknown` means the repository is not in `apps/web/src/data/repo-facts.json`, 53 repositories read on 2026-10-29, whatever its age.
2. `VITE_ARP_SPONSOR_ADDRESS` was unset, so sponsor deposits read as declared and the column stayed empty.
3. No order sorted on that column, then called Usage.
4. It counted every deposit the sponsor sent, including the first position of a triple it created, which goes to itself and has no proof behind it. ADR `0110` already says the position that counts has the agent as receiver.

## Decision

**The filter.** **Signals** counts deposits sent by the sponsor to another wallet. Nothing else counts on `/tools` or in `/search`'s order: the Declared column and "Most declared" are gone, and **Most signals** is the default.

**Mainnet starts from zero.** No sponsor exists there, so the Signals column stays on the page, empty, deliberately, and `/tools` and `/search` order by installs or stars. There is no second rule per chain. A sponsor on mainnet needs its own ADR (`rules/security.md`).

**`unknown` ranks with `alive`.** Only `dead`, the owner's own word (archived or gone), sinks a tool.

**The label.** "Used" was refused on 2026-10-27 for edges anyone can write (`docs/tasks/42`). This column first kept it, on the ground that a sponsored deposit passed the proof gate (ADR `0094`). That stopped being true when `POST /line` (ADR `0144`, on `feat/agent-pulse`) began depositing in the agent's name with no proof, and on chain the two look the same. Dropping that deposit would break the line, because `pulse-usage.ts` counts an agent as declarer only through its position on the edge. So the name changed: the user chose **Signals** on 2026-11-05. `/tools` no longer claims a proof.

**What is unchanged.** `listTools` still returns `declaredDeposits`, now including the sponsor's creation deposit, as its doc says. The Support column still reads every wallet, and is shown, not ranked on.

**Ties.** At equal Signals, installs, then stars, then the name. Edge count, positions and amount no longer order anything, so no deposit outside the sponsor can move a tool.

**The wallets behind it.** A **Wallets** column counts the distinct wallets those deposits went to, and a tool's page lists them with their amounts. The sponsor is never one of them. It reads deposits, not current positions, so a later withdrawal does not lower it, and it orders nothing. The wallets come from a separate read with `_eq` on the checksummed address: selected inside the listing with `_ilike`, the query did not answer in 40s on testnet 13579, 2026-11-05.

The address goes in `apps/web/.env`, git-ignored, because Vite reads that directory.

## Alternatives considered

- **Keep Declared beside this column.** The user chose one filter: a deposit outside the sponsor says nothing here.
- **A second sponsor address for proven deposits.** The difference would read on chain, at the cost of a second key and a second approval per agent. Open again before mainnet, which starts from zero.
- **`/line` deposits nothing on the `uses` edge.** It breaks the line: see The label.
- **Count only wallets that paid their own deposit.** It would read zero today and misses the design: the agent holds the position, and the sponsor pays for it (ADR `0094`).
- **Regenerate `repo-facts.json` instead of changing the rank.** It fixes today's repositories and the next tested one is buried again.

## Consequences

- ARP's sponsoring service is the only judge of this order. A third party's deposit, of any size, does not move it.
- Signals measures what the service paid for: checked proofs and unproven lines alike. On testnet today those are ARP's own tests, so the order demonstrates the mechanism and says nothing about what the market thinks.
- A tool with lines signed directly and no sponsored deposit reads zero, as `cut-silences` does.
- An unread repository can rank first, and one archived since the list was read ranks with the live ones until the list is regenerated.
- A deployed build needs the variable set: a fresh checkout has no `apps/web/.env`.
