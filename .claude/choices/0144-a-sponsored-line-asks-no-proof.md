# 0144 — A sponsored line asks no proof of use, and its key stays out of the plugin's server

**Status:** Accepted
**Date:** 2026-11-05
**Amends:** ADR `0094` (a sponsored spend needs a proof), ADR `0135` (the sponsored path was not extended), ADR `0110` (what the local key signs), ADR `0138`
**Triggered by:** `docs/tasks/70` item 1. The user answered « oui aux 3 », relayed by `arp-f3`

## Context

The plugin has to write a line through the local sponsor with the person signing nothing. `POST /deposit` asks a receipt, and a failure the hook noted has none. The plugin's server is read-only, and a server holding an agent key does not run the search package (`canSearch`). And the service creates the terms of a line it pays for, so a reader would count it as a wallet saying every one of them.

## Decision

1. **`POST /line`, testnet 13579 only, no proof of use.** A line is the agent's word. It is bounded by `linesPerAgentPerDay` (default 5), `linesPerDay` (default 30) and the shared daily budget. The agent signs a request (`sponsor/line.ts`), which names the tool, domain, outcome and reason in closed words, and the service spends its nonce once.
2. **The service creates the terms and deposits in the agent's name on each level**, so the agent's wallet stands behind the line. It checks the approval by simulation before it spends anything.
3. **The key stays out of the plugin's server.** `arp line` is a separate process that loads `~/.arp/agent-key` for one call. `arp share` uses the same function.
4. **The service's wallet says nothing by paying.** `getPulseUsage` takes `payers`, who stand behind no qualifier. Their row stays, since they did write the edge. The same wallet is the agent 13579/2 of the walk of task 63, so that agent's `worked` no longer counts and that skill goes from 2 wallets to 1, by the user's decision.

## Alternatives considered

- **`ARP_TOOLS=sponsored` in the plugin**: the server would hold a key and stop running the search.
- **A receipt required**: a failure outside ARP could then never be shared.
- **A separate wallet for the service's own agents**: it would keep agent 2's line and leave every earlier line by that wallet ambiguous.

## Consequences

**Positive:** one install can write a line, and the person signs nothing.

**Negative:**
- **ARP's treasury now pays for words nothing proves**, up to the caps. A fresh key is free to make, so `linesPerDay` and the budget are the real bound, and false lines on testnet are paid by ARP. A mainnet port needs a new ADR.
- A line costs the service one fee per new term plus a deposit per level.
- A line with no domain counts only in a search that names no domain.

## References

- Rule: `.claude/rules/security.md`
- Task: `docs/tasks/70` item 1
