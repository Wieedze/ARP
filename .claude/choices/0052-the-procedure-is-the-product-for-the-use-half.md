# 0052 — the procedure is the product for the "use" half; the connector is a convenience

**Status:** Accepted
**Date:** 2026-10-20
**Triggered by:** user — _« ça veut dire qu'on peut utiliser ARP et déclarer des outils sans être
obligé d'installer un node, il faut juste la lecture d'un skill ou l'installation de ce skill pour
une réutilisation »_, after _« il faut que ce soit essentiel de pouvoir faire faire ça à n'importe
quel agent donc peut-être une skill installable en plus du mcp et du nœud »_.

## Context

ADR `0045` decided ARP ships a node the operator runs rather than hosting a path. That removed ARP
from the request path. It left the connector looking like the way in.

It is not. Checked step by step against the live chains: **every step of declaring and staking is
either a public read or a local computation**, and then a transaction the agent signs with its own
key.

| step                                | what it needs                                       |
| ----------------------------------- | --------------------------------------------------- |
| resolve the identity atom           | one GraphQL query against a public endpoint         |
| compute a tool's atom id            | one `eth_call` against a public RPC                 |
| compute your own identity atom's id | **nothing** — CIDv1-raw-sha256 of a frozen document |
| build the calldata                  | ABI encoding, local                                 |
| sign and send                       | the agent's own wallet                              |

Nothing of ARP's is in any of them. So an agent that can read instructions and sign transactions can
use ARP with **nothing installed**.

What an MCP server gives is _tools_. What it does not give is _procedure_: when to call what, in
which order, and what the traps are. That is the part an agent cannot derive, and it is the part this
project paid for — 21 permanently stranded triples on the wrong predicate, 74 mainnet edges staked
where no reader can see them, a plan that would have sent fees to a codeless address.

## Decision

**`skills/arp/SKILL.md` is the primary surface for the "use" half**, and the connector is a
convenience that replaces hand-rolling, not a requirement.

The skill carries exactly what cannot be derived:

- the **frozen term ids**, because resolving by label is unsafe — `Tool` resolves to two atoms on
  mainnet, `use` and `implement` to several — and because `use` is not `uses`
- the **subject rule**: the registration-derived atom, never the wallet's
- the **identity-atom recipe**, byte for byte, with the local CID computation so a pinning service
  can be checked rather than trusted
- the **vault rule**: deposit on the edge, not the tool's atom
- the **order**: an atom confirms before the triple that references it
- the **chain id on every call**, because a MultiVault is codeless on the other chain and a
  value-bearing call there succeeds as a plain transfer
- the two **curves** and what a position on each one means
- "read the costs from the chain" — they are 100× apart between the chains
- and the four queries, each one **executed as written** before being published

It lives at `skills/arp/`, not `.claude/skills/arp/`. The latter is how to work _on_ this repo; this
is how to _use_ ARP, and it is meant to be published — including, eventually, to the skill indexes an
agent already reads.

## Alternatives considered

- **The MCP server alone.** It is what existed, and it leaves the operator to infer the sequence
  from tool descriptions. Every trap above is invisible from a tool list.
- **A library.** A second integration surface to maintain, and it would be a dependency where a
  document is not. The skill is strictly weaker-coupled, which is the point.
- **Documentation in `docs/`.** Nothing reads `docs/` but us. A skill is a format agents already
  load.

## Consequences

**Positive:**

- The strongest form of "ARP is not in the path": not in the request path (ADR `0045`), not in the
  data path (ADR `0051`), and now not in the **tooling** path either. Unplug everything of ours and
  an agent with the document still works.
- It is the cheapest surface to write and the one that makes the other two usable.
- It is also a distribution channel: a skill is a thing that gets indexed and installed.

**Negative:**

- **A document can go stale where code cannot.** Every address, term id and figure in it is a claim
  with a date, and the chain can move under it. Mitigated by naming what must be read from the chain
  rather than copied, but the frozen ids and the recipes are genuinely frozen copies.
- Two surfaces describing one procedure. If the connector's behaviour and the skill's instructions
  diverge, the skill is the one a stranger follows.

**Neutral (worth knowing):**

- Three surfaces, three jobs, and they compose: the **skill** is the procedure, the **connector** is
  the tools, the **inbound node** is reachability. Only the last one requires anything to listen —
  using ARP needs no port, no URL and no reachable address.

## References

- The skill: `skills/arp/SKILL.md`
- Related ADR: `0045` (ship a node, do not host a path), `0051` (ARP points and prices, stores
  nothing), `0038` (the connector holds no key), `0030` (`use` is not `uses` — the 21 stranded
  triples), `0039` (the deposit goes on the edge), `0047` (the identity atom prerequisite)
