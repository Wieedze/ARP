# 0130 — No daily cap on new agents on testnet

**Status:** Accepted
**Date:** 2026-11-03
**Triggered by:** the usage demo, which runs more test agents than ADR `0110`'s default of 20 new
agents a day. The user, 2026-11-03, asked how many agents: _« Plus, et retirer la limite »_.

## Context

ADR `0110` let the sponsoring service pay a new agent's mint gas and identity, bounded by
`newAgentsPerDay` (default 20) and the global daily budget. ADR `0129` removed the per-agent
deposit count for the same reason: on testnet 13579 the budget protects the treasury, and the
counts only bound us.

## Decision

**`newAgentsPerDay` is `null`, off, unless `SPONSOR_NEW_AGENTS_PER_DAY` is set.** It bounded two
things, mint gas and new identities, and both now check the budget alone. Mint gas stays once per
address, and every other cap is unchanged.

Testnet only, as ADR `0129`; mainnet decides it again.

## Alternatives considered

- **Raise the default** — the user asked for the limit to go.

## Consequences

- Anyone who can reach the service can create agents until the daily budget is spent. It binds to
  127.0.0.1 (`docs/tasks/37` §4.2), so today that is this machine.
- `GET /` reports `newAgentsPerDay: "off"`.
