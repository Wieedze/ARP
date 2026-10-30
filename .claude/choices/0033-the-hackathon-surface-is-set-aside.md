# 0033 — The hackathon surface is set aside; agents bring their own identity

**Status:** Accepted
**Date:** 2026-10-17
**Triggered by:** user decision — _"les agent de arp existant sont inutiles, tout le taff hackathon

> **Answered 2026-10-20.** This ADR left open "whether `/hire` [stays] in the app". The user decided
> to delete it, and it is gone — along with `use-agents` and `use-agent-reputation`, which nothing
> else referenced. Hiring is `docs/tasks/25`.
est a mettre de coté"_, after asking why ARP's own agents mattered when the point is the agents
already in the ERC-8004 registry.

## Context

ARP built three demo agents for the MetaMask Dev Cook-Off (tasks 02b–05b, deadline passed
2026-06-15): a Solidity auditor behind an HTTP server, hired through `/hire`, which staked on the
methodologies it used. They exist on Intuition testnet as four atoms and nothing else.

Measured 2026-10-17, read-only:

|                                |                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| ARP-named atoms on **mainnet** | **0**                                                                                              |
| ARP-named atoms on testnet     | 4 — `ARP Agent #1`, `ARP Module — Solidity Audit`, and two runtime accounts                        |
| edges touching them            | 16, of which **12 point at fabricated CIDs** — `invalid path "/ipfs/bafkreislither…": invalid cid` |

So the demo footprint is small, testnet-only, and mostly garbage: `ensureAtomForURI` minted atoms for
placeholder strings that are not CIDs (the `docs/tasks/20` appendix defect, visible in the graph).

ADR `0032` had accepted a cost on the strength of these agents: because they have no ERC-8004
identity, they would need minting into the canonical registry before they could carry a `uses` edge.
The user's question made that cost pointless — **nothing requires minting an identity on an agent's
behalf.** An external agent that connects through ARP's connector mints its own, if it needs one.

## Decision

**The hackathon surface is historical record. It is not a dependency, not on the critical path, and
not a thing to maintain.** Nothing is deleted — the same treatment `docs/00_HACKATHON_PIVOT.md`
already has.

Specifically set aside:

- `scripts/agent-auditor.ts`, `agent-server.ts`, `agent-server-specialist.ts`, `agent-loop.ts`,
  `agent-stake-on-use.ts`, `agent-approve-sa.ts`, `agent2-approve-sa.ts`, `setup-second-agent.ts`,
  `demo.ts`, `demo-delegation.ts`
- `app/src/pages/Hire.tsx` and `HireResult.tsx` — they list and pay ARP's own agents
- the three demo agents and their atoms, left where they are

**And the cost ADR `0032` accepted is withdrawn.** An agent arriving through the connector carries or
mints its own ERC-8004 identity. ARP does not need one for itself to bootstrap, and does not mint one
for anybody else. ADR `0032`'s _decision_ — that a `uses` edge carries the registration-derived
identity atom — is unchanged and now cheaper, because every agent that can write an edge already has
the identity by construction.

## Consequences

**Positive**

- The write path moves where it belongs. It was going to be exercised by ARP's demo agents through
  `scripts/`; it will be exercised by external agents through the connector and the MCP server
  (`docs/tasks/16`). `scripts/agent-loop.ts` stops being load-bearing — which is why the fix that made it
  throw rather than write a bad subject was still worth making, and is now its last act.
- `docs/tasks/19` steps 2–5 are no longer blocked on minting anything.
- The forward surface is the part that was already forward-looking: the verifier
  (`erc8004/src/verify/`), `getToolUsage`, the panel and the directory.

**Negative**

- **The only working end-to-end hire demo is set aside**, and `docs/tasks/16` has not replaced it. Between
  now and then there is nothing to show of the hire loop.
- `ModuleRegistry` still backs eight files in `app/src` and `sdk/src`. ADR `0025` already kept it off
  mainnet; this decision does not remove it from the app, and whether `/hire`, `RegisterModule` and
  `ToolDetail` are reworked or retired is a separate call.
- The 12 fabricated-CID atoms stay on testnet permanently. Intuition has no deletion.

**Neutral**

- Tasks 02b–05b keep their completion notes and post-mortems. They were done, and the record of
  having done them is worth more than a tidy task list.
- This does not touch ADR `0017`. No mainnet transaction posture changes.
- The cheapest forward action needs none of this: the graph already holds **153 `supports <protocol>`
  claims** on registry agents with working vaults and empty counter-vaults — 115.97 TRUST behind
  "Captain Dackie supports MCP", 4 × 10⁻¹² against, and nobody has checked it. Taking a position on
  a measurement needs no atom, no triple and no identity.
