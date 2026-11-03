# 0131 — A search ranks by the words it matched and by how many agents used each tool

**Status:** Accepted
**Date:** 2026-11-03
**Triggered by:** the usage demo. The user endorsed, the same day, _« skills.sh classe par nombre de
téléchargements. ARP classe par ce que les agents ont réellement utilisé avec succès »_, and chose
_« Mélange usage et pertinence »_ over usage first.

## Context

`arp_find_tools` with a query ordered matches by `relevance` alone: words matched, two for a word
in the name (task 49, task 51). Declarations reached the answer as a field and changed nothing in
the order. So a skill seven people installed and twelve agents used ranked where its wording put
it, and the one thing ARP knows that skills.sh does not had no effect on what an agent picks.

## Decision

**Matches are ordered by `rankOf(relevance, declarations) = relevance × (1 + ln(1 + declarations))`**
(`apps/mcp/src/tool-search.ts`). A query still has to match every word: usage reorders matches,
it never makes a tool match. A declaration is one agent's `uses` edge, so one agent counts once
per tool.

The logarithm is the mix: 12 declarations multiply a score by about 3.6, so a tool matching two
points of words passes an unused one matching four; one declaration multiplies by about 1.7 and
does not.

## Alternatives considered

- **Usage first, then words** — the option offered first. The user chose the mix, so a heavily
  used tool that matches the query weakly does not pass a strong match that is merely new.
- **skills.sh's install count in the mix** — that is skills.sh's ranking, and what this one is
  meant to differ from.

## Consequences

- On testnet a declaration is cheap and ARP's own test agents make them, so a demo's order is a
  rehearsal of the mechanism, not evidence about a skill. On mainnet each one costs a fee.
- Declarations are not filtered by whether the run succeeded: an agent declares what it used. The
  demo's agents declare only after a run that succeeded; the protocol does not check that.
