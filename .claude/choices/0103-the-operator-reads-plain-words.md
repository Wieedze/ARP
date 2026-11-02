# 0103 — The operator reads plain words, not the chain's vocabulary

**Status:** Accepted
**Date:** 2026-11-02
**Triggered by:** user, 2026-11-02: _« je voudrais enlever le vocabulaire web3 (par exemple claims
ou position), ça devrait avoir un langage plus commun »_. The glossary below is the user's, chosen
term by term the same day.

## Context

The web app speaks Intuition's vocabulary: "Take a position", "Shares minted", "Reading the vault",
"Canonical Intuition atom", "bonding curve", "Claims about …". Task 45d already rewrote the MCP
tools' descriptions for an operator who has never heard of a chain. The web app, the CLI and the
rest of the MCP output did not follow.

## Decision

What an operator reads — the web app, and the text the CLI, the MCP server and the node show — uses
this glossary:

| chain word                                                          | operator word                                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| position, stake, deposit (noun and verb)                            | **support** ("Support this tool", "Your support")                                                       |
| staker                                                              | **supporter**                                                                                           |
| redeem, redemption                                                  | **withdraw**, withdrawal                                                                                |
| claim                                                               | **declaration**                                                                                         |
| on chain                                                            | **public**                                                                                              |
| delegation                                                          | **permission**                                                                                          |
| caveat                                                              | **limit**                                                                                               |
| smart account                                                       | **agent wallet**                                                                                        |
| enforcer                                                            | not shown                                                                                               |
| atom, triple, vault, shares, bonding curve, term id, minimum shares | not shown by default: behind a `Hint` or a collapsed detail, still reachable to verify                  |
| curve, where it is a control (`/tools`)                             | **pricing** ("Pricing: Linear / Progressive")                                                           |
| predicate                                                           | **kind** ("+3 other kinds")                                                                             |
| off chain (beside "public")                                         | **local**                                                                                               |
| "Supports" (the `supports-protocol` group)                          | **Protocols** — "Supports" now means money behind a thing                                               |
| shares                                                              | named only where the operator enters or is refused a share amount (withdraw); everywhere else not shown |

The last four were decided the same day, once the first pass showed where the table was silent.
The `/agents` row's curve count was dropped rather than hidden: the row is a link, and a `Hint`
inside a link is invalid HTML. It stays on the agent's own page.

**Unchanged:** TRUST and tTRUST (the currency's name), transaction and hash (each with its explorer
link), and every machine-facing name — MCP tool names (`arp_take_position` …), JSON field names,
routes, code identifiers, query documents. Renaming those would break callers and buys the operator
nothing, since the operator does not read them. `docs/`, ADRs, task files and code comments keep the
technical vocabulary: their reader is a developer.

**The MCP money sentence names shares** (`arp_stake_on_used`, `arp_take_position`): the model reads it, it has to say precisely what the TRUST buys, and `min_shares` is a parameter it fills.

**Left in the chain's words, as machine-facing:** the HTTP reasons `apps/mcp/src/content.ts`
returns, the node's API errors (`apps/node/src/task.ts`), which go to a remote program and name the
fields it sent, and the `delegate` / `delegate to` labels in `packages/protocol/src/delegation/register.ts`,
which are the predicates' own names. Parameter-validation errors that name a parameter
(`term_id must be …`) stay too: the parameter cannot change, and the model is the reader.

## Alternatives considered

- **back / backing**, **bet** for position. The user chose "support".
- **statement**, **link** for claim. "Declaration" is already the word the app and the MCP use for
  the same thing.
- **Rename the technical figures** (shares → units, vault → pool) or **remove them**. Hiding them
  keeps them checkable, the same line 45d drew for the MCP.

## Consequences

**Positive:**

- One vocabulary from the MCP answer to the web page.

**Negative:**

- "Support" carries less of the sense that money is at risk than "stake" or "bet". The amount in
  TRUST stays next to it everywhere, which is what carries the risk.
- The app's words no longer match Intuition's portal or the explorer, which a curious reader will
  meet behind a transaction link.

**Neutral (worth knowing):**

- ADR `0078`'s one-word rule is about predicates on the chain, not copy. Still, every operator word
  above is one word except "agent wallet", which the user accepted as is.

## References

- Related task: `docs/tasks/47-plain-words.md`, `docs/tasks/45-discovery-without-a-command.md` 45d
- Related rule: `.claude/rules/ui.md` (Copy)
- Related ADR: `0078` (one word)
