# 0051 — ARP points at things and prices opinions about them; it stores nothing

**Status:** Accepted
**Date:** 2026-10-20
**Triggered by:** user, closing the question ADR `0046` left open ("does ARP index how to use a
tool?") — _« on ne stocke aucun outil mais si on les register c'est qu'il existe quelque part et
qu'on veut créer un marché d'opinion dessus pour arrêter de se faire avoir par des étoiles qui ne
veulent rien dire … c'est un registre sans enregistrement, c'est plus un pointeur d'outils
utilisables et utilisés par des agents (de la même façon que les agents en fait) »_.

## Context

"Register a tool" had no settled meaning. `ModuleRegistry.registerModule` writes `name`, `domain`,
`schemaURI` and `description` on chain, which makes a registered tool a **description**: an agent
that discovers it still cannot use it. The comparison the user drew — skills.sh, where an entry tells
you what a thing does, **how to install it**, and carries stars — exposed the gap as the middle row.

Three shapes were on the table: a convention carrying an install target, a new field in the contract,
or not indexing usability at all. The recommendation on the table was the first.

**The user took a fourth, and it dissolves the question rather than answering it.** ARP does not host,
store or deliver a tool. If a tool is registered here it is because it already exists somewhere. What
ARP creates is a **market of opinion** on it.

And the empirical case for that market is already measured, in this repo:
`scripts/measure/erc8004-feedback.ts` reads 569,148 feedback entries on Base 8453 with a **mean score
of 95.09 / 100**. Free ratings converge on excellent and stop distinguishing anything. That is the
user's "étoiles qui ne veulent rien dire", as a number.

## Decision

**ARP is a registry without registration: a pointer, plus a market on what the pointer names.**

Three parts, and the third is the product:

1. **It stores nothing.** No tool is uploaded, hosted, vendored or delivered. A tool exists elsewhere
   — a website, a package, an MCP endpoint — and ARP records only that it exists and where.
2. **An agent and a tool are the same shape.** Both are a thing that lives elsewhere; ARP's
   contribution to both is an atom pointing at it and the positions people take on claims about it.
   `scripts/agent-identity-atom.ts` already does this for an agent — pin a Thing, create the atom,
   link it. A tool is the same operation with a different Thing.
3. **The market is the output.** Deposits on claims, priced and withdrawable, ~~with the
   counter-claim free~~. Trend, trust and whatever a consumer builds on them come from positions, not
   from ARP.

   **Struck by ADR `0056`, 2026-10-21** — the fifth ADR found carrying this premise and the only one
   none of three review rounds' greps reached until `counter-claim` was tried as a phrasing. The
   counter-claim is free and all but unused: 1 of 185 mainnet `uses` edges
   (`scripts/measure/counter-side-usage.ts`). "Priced and withdrawable" carries the point alone, and
   `0056` built the withdrawal half.

**Corollary that follows and was not obvious.** The pointer is the **atom**, not `ModuleRegistry`.
The contract stores four strings on chain, and this decision says ARP does not store. It stays
deployed, it carries the rig's 14 tools and ADR `0025` already keeps it off mainnet — but the forward
path for "register a tool" is **writing the tool's atom**, not filling the contract's fields.

**And a field this corrects.** Earlier the same day, a tool atom's Thing `url` was called unusable
because, measured over the 80 distinct tools on mainnet `uses` edges, 52 carry one and they are home
pages — `https://colony.io`, `https://www.ethereum.org/`, `https://atlas.box/tools/slack` (28 carry
none, and three carry the literal string `"null"`). That judgement was **wrong under this decision**:
"where the thing is" is exactly what a pointer holds. `url` is unusable as a **call target**, and
being a call target is what ARP has just declined to be.

## Alternatives considered

- **Index an install target** (the recommendation this replaces). It would close the MCP loop for
  tools an agent does not already have — discover, install, use, declare — and it makes ARP a place
  you _get_ software from. `docs/12` forbids being a registry of identities and a marketplace for
  hiring; tool distribution is covered by neither, so it was open rather than forbidden. Declined:
  it is a distribution business, and the market does not need it.
- **A field in `ModuleRegistry`.** A contract change reaching only testnet (ADR `0025`), so it could
  never describe a mainnet tool. Rejected on reach before taste.
- **Score the tools ourselves.** ADR `0046`. The whole point of the market is that nobody has to.

## Consequences

**Positive:**

- One mechanism instead of two. Agents and tools are the same object with the same write path, so
  `agent-identity-atom.ts` generalises rather than being duplicated.
- The positioning is now one sentence that is true of everything built: ARP points at AI things —
  agents, tools, MCP servers — and opens a priced market of opinion on them.
- Nothing to host, so nothing to keep up. Consistent with ADR `0045`'s disappearance test and
  ADR `0049`'s "ARP holds no key, no path, no data".

**Negative:**

- **An agent cannot obtain a tool it does not have.** The MCP loop stays "declare what you used",
  never "find and install something new". That is a real limit on what the connector can do for a
  fresh agent, and it is now a decision rather than a gap.
- Discovery still needs building: the MCP has `arp_tool_reputation`, which prices a tool whose atom
  id you already know, and no `arp_find_tools`. A pointer nobody can enumerate is not a pointer.
- `ModuleRegistry` is now legacy on its own terms. Nothing forces its removal, and leaving it in the
  UI as the meaning of "register" would contradict this decision.

**Neutral (worth knowing):**

- A pointer with a dirty target is still a pointer: three of the 80 tools carry `"null"` as a url and
  28 carry none. Whether a tool with no pointer may carry a market is a display question, not a
  protocol one.
- `atlas.box/tools/…` appears as the url of several tools, so another directory already indexes part
  of this set. Worth knowing before claiming the space is empty.

## References

- Related ADR: `0046` (ARP scores nobody — this answers its one open question), `0048` (no mirroring
  of free feedback), `0049` (no calibration; the four built differentiators), `0025`
  (`ModuleRegistry` stays off mainnet), `0045` (the disappearance test), `0047`
  (`agent-identity-atom.ts`, the write path this generalises)
- Measurements: `scripts/measure/erc8004-feedback.ts` (569,148 entries, mean 95.09/100),
  `scripts/measure/tool-atom-shape.ts`
