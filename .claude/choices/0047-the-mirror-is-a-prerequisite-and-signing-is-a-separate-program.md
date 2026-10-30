# 0047 — the mirror is a prerequisite nobody listed, and signing is a separate program

**Status:** Accepted
**Date:** 2026-10-20
**Triggered by:** writing the first real `uses` edge. User authorisation for the named action on
testnet 13579 (ADR `0037`): _« on est sur le testnet donc on peut faire ce qu'on veut, le but c'est
de pouvoir tester et après de push vers le mainnet »_.

## Context

Every part of the write path had been built and verified read-only against live mainnet. **Nothing
had ever been signed.** The attempt to change that found a prerequisite the roadmap does not list.

`resolveDeclarationSubject` refused: the rig agent has no ERC-8004 **identity atom**. Measured
2026-10-20 on testnet 13579: 728 `same as` edges exist and **not one is ARP's**. The reason is that
the identity atom is written by **Intuition's mirror**, and the mirror covers Base. On mainnet 1155
the 28,648 mirrored agents already have one, so a third party does nothing. On testnet nobody mirrors
ARP's own rig, so ARP could not rehearse the path it ships.

Two more things surfaced on the way, both measured:

- **The canonical registry has no code on 13579.** `eth_getCode` of
  `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` returns `0x` there. The CREATE2 "same address
  everywhere" claim holds for the chains it was deployed to, and 13579 is not one. ARP's own agents
  live in the registry ARP deployed (`data/deployments/13579.json` → `arp.identityRegistry`), so the path
  needs the registry as a **parameter**, which `caip.ts` already supported and no caller passed.
- **The `same as` direction is not guessable.** `RESOLVE_AGENT_QUERY` filters on the **object**'s
  Thing name and returns the **subject**, so the edge is `(identity atom, same as, caip19 atom)`.
  Reversed, the agent stays unresolvable and the fee is spent. Both Things' recipes were **read off
  mainnet** (agent 8453:6649) rather than inferred; the CAIP Thing's description is a fixed sentence,
  not a template.

## Decision

**1. ARP writes what the mirror would have written.** `scripts/agent-identity-atom.ts` pins both
canonical Things, computes both atom ids and the triple id locally, reports which already exist, and
plans only the missing calls. Content-addressed, so it is idempotent by construction — a second run
plans nothing. The recipes live in `scripts/intuition-pin.ts`, extracted so `verify-pin-key.ts` and
this script share one copy: a single differing character yields a different CID and therefore a
duplicate, permanent, fragmented atom.

**2. Planning and signing are separate programs.** `scripts/agent-send-plan.ts` is the **only script
in this repo that signs**. It takes a plan as JSON and carries three guards, each for a hazard this
repo has either hit or written down:

| guard                                                           | the hazard                                                                                               |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| every call's `chainId` equals `--chain`, which equals the RPC's | a plan signed against the other chain sends the fee to a codeless address, with no revert                |
| `to` must have code (`eth_getCode`)                             | the same hazard one level down — a value-bearing call to a codeless address succeeds as a plain transfer |
| `--execute` required                                            | the default prints and spends nothing                                                                    |

The split means a plan can be read, diffed and approved before a key is near it. `--json` on
`agent-declare-used.ts` emits one; that script still signs nothing in any mode.

**3. The registry is a flag, not a second constant.** `--registry` on both scripts.
`rules/portability.md` rule 1 is why it is not a per-chain default.

## The first real edge

Written, read back, and reproducible by anyone. Chain 13579, 2026-10-20, signer
`0x906f3A52ec089f8D4E9127F91C6bE5Ae0d18f91f` (the agent's own wallet — `docs/12` point 3 is that the
agent spends its own TRUST).

```
(Agent 13579:3) --uses--> (Trail of Bits — guidelines-advisor)
 0x2e304b96…              0xba5844b5…        edge 0x5999d4d1…
```

The claim is **true**: `scripts/agent-auditor.ts:45` lists `guidelines-advisor` among the skills the
auditor agent invokes. The predicate is the frozen canonical `uses` `0x5c0bde1c…` (ADR `0030`), never
one ARP minted.

| step           | cost           | tx            |
| -------------- | -------------- | ------------- |
| identity atom  | 0.001000000001 | `0x9d2f1468…` |
| caip19 atom    | 0.001000000001 | `0xc83236fc…` |
| `same as` edge | 0.001000000002 | `0x9eea73a3…` |
| tool atom      | 0.001000000001 | `0x47925b5d…` |
| `uses` edge    | 0.001000000002 | `0x3dc59b75…` |
| deposit        | 0.002          | `0xdcb5889d…` |

Balance 0.0945617118 → 0.087327533493 tTRUST. Six calls, **0.007234178307** spent including gas.

Read back two ways — raw GraphQL against `testnet.intuition.sh`, and through
`getToolUsage`, the surface a third party uses:

```
support  curve 1   1,980,000,001,000,000 wei   positionCount 1
oppose   curve 1               1,000,000 wei   positionCount 0
```

The counter-vault's 1e6 wei with **zero positions** is ADR `0042`'s creation dust, observed on ARP's
own edge: `totalAssets > 0` means the term exists, and `positionCount` is the discriminator. The
rule now has a first-party reproduction.

## What resolving the count then found

`88,243` sat in **16 files** with no script behind it — `rules/claims.md` forbids exactly that — and
it was stale. Measured first-party 2026-10-20 by **binary search on `ownerOf`**, the method ADR
`0027` used (the registry is a proxy with no counter: `totalAgents()`, `totalSupply()`,
`nextAgentId()`, `agentCount()`, `getAgentCount()` and `currentTokenId()` all revert, and
`eth_getLogs` over its history is refused by every free RPC):

|                                          |             |
| ---------------------------------------- | ----------- |
| Base 8453, highest minted id             | **309,925** |
| Intuition mirror, `implement → ERC-8004` | **28,648**  |
| coverage                                 | **9.2%**    |

**The mirror has not moved.** 28,648 is the identical figure `docs/08` measured on 2026-09-16, while
the registry tripled at roughly 44,000 new agents a day. So coverage is falling, and
`agent-identity-atom.ts` is not a testnet convenience — it is the only path for about nine agents in
ten.

**And the stale constant was a sampling bias, not a stale figure.** Five scripts bounded a _uniform
sample_ with it — `measure-cohort-{endpoints,callable,onchain-activity,skills}.ts` and
`verify-cohort.ts` — so every cohort measurement in this repo drew from the **oldest third** of the
registry. Agents minted before the 44,000-a-day rate are not a random sample of today's cohort, so
the direction of the bias is unknown and probably optimistic. `docs/14`'s "1–7% answer" describes the
first 88,243 agents, and that is now stated where the table is.

Fixed by reading it: `scripts/erc8004-population.ts` exports `highestTokenId()`, and all five callers
use it. Both counts in this section come from `git grep -l`, which is the only reason they are
written down at all.

## "Who pins" was the wrong question — measured, not arbitrated

It looked like a fork with three branches: the operator gets their own partner key, ARP pins on
request, or the atom points at a `data:` URI and diverges from the canon. Each had a cost and none
was obviously right.

**Measured 2026-10-20, the fork dissolves.** Agent 8453:6649's atom carries
`ipfs://bafkreif6xwptjdsux2iwnhdbxyjom23bzzimhk62y574rreexdghi6hlbq`. That CID was retrieved from a
**third-party** IPFS gateway — so Intuition's pins are on the public network, not a private store —
and the 171 bytes behind it are:

```json
{
  "@context": "https://schema.org",
  "@type": "Thing",
  "description": "ERC-8004 agent 8453:6649",
  "image": "",
  "name": "Agent 8453:6649",
  "url": "https://8004scan.io/agents/8453/6649"
}
```

The schema.org wrapper, keys in **sorted** order, no whitespace. The CID is CIDv1 raw + sha2-256 of
exactly those bytes. Reproduced from the recipe alone, and the CID recomputed from the reproduction:
**all three match**, and so does the CAIP atom's own CID
(`ipfs://bafkreiagjji27tchqekmrvpl4u5fneb3ua6fkqj34ab3msnqskb3pqjo64`) — two independent fixtures,
not one lucky recipe.

So **the atom's id is a pure function of the agent's identity.** An agent can compute it with no
partner key, no API and no network. `packages/protocol/src/declare/agent-atom.ts` does, which puts
the whole identity path back inside the package's "a funded wallet and an ERC-8004 identity, no API
key" promise. Seven tests assert it against the live fixtures.

What pinning is actually for, stated narrowly: making the document **readable**, because the indexer
resolves the Thing's `name` and `RESOLVE_AGENT_QUERY` filters on it. It is not needed to know the id,
to plan, or to create the atom — and since the bytes determine the CID, **anyone can pin them**,
at any time, and the atom becomes resolvable retroactively. The partner API is one pinning service.

Consequences, and they are better than any of the three branches:

- ARP pinning on request is a **verifiable convenience**, not a dependency. `agent-identity-atom.ts`
  now compares the API's answer to the local computation and **refuses on a mismatch** — minting on
  a drifted serialisation would be a permanent duplicate.
- If ARP disappears, an operator pins the same bytes elsewhere and gets the same atom.
- One thing is still untested: whether Intuition's indexer fetches content pinned **outside** their
  service. Their own pins being publicly retrievable makes it likely, not certain. One atom on
  testnet settles it, and nothing here depends on the answer.

## The node, as shipped

`scripts/arp-mcp-server.ts` now serves **stdio** as well as HTTP — `--stdio` or
`ARP_TRANSPORT=stdio` — which is how an MCP client launches a local server, and therefore how ADR
`0045`'s "ship a node, do not host a path" becomes true of this file rather than aspired to.

One dispatch, two transports: the stdio loop wraps `handler.fetch` instead of re-implementing it. In
stdio mode **stdout is the protocol channel**, so the banner and every diagnostic go to stderr; one
stray `console.log` desynchronises the client and the failure looks like a malformed server.

Verified by a real handshake against testnet: `initialize`, a notification that correctly returns
nothing, `tools/list` showing four tools, and `arp_identity` on both branches — rig agent 3
`declarable: true` with the atom written above, rig agent 4 `declarable: false` with the reason.

## The directory, and the defect it caught

`arp_find_agents` completes the node's read surface: the cohort, paged, in one of two orders named
for what they measure rather than for a ranking — how many statements a source holds about an agent,
or TRUST on the agent's own atom. `total` is the cohort's size from the source's aggregate, never the
page length. An agent with several `same as` edges is reported **ambiguous** rather than resolved to
one of them, and a fallback name is flagged as one, because `Agent 8453:6649` is a derived name and
crediting an agent with choosing it is a small lie.

**Its first version shipped a wrong number, and the reason is structural.** It serialised
`market.totalAssets` — a field `AgentAtomMarket` does not have — and coerced the `undefined` with
`?? 0n`. So the directory reported **0 TRUST for an agent carrying 13.02**, with a position count of
2 beside it: a figure that is absent rendered as a figure that is nothing, which is ADR `0042`'s
family with the sign reversed.

Three things about it are worth keeping:

- It was caught by **running it against mainnet and disbelieving the output**, not by a test. The top
  of an order sorted by conviction showing 0.0000 is the kind of result that is either a finding or a
  bug, and checking which took one graph query.
- `tsc` would have caught it in a second. It did not, because **`scripts/` is outside every
  typecheck** (`tasks/21`). That known defect now has a concrete cost: a wrong figure on the surface
  third parties read.
- The fix keeps `null` as `null`. `position_count` and `vault_count` are reported as the source gives
  them, and `vault_count` matters: on that agent curve 1 held 0.00098 TRUST and curve 2 held 12.28,
  so a figure from one curve beside a count from all of them is a contradiction.

## Consequences

**Positive:**

- The loop runs. `docs/12` points 2–4 are no longer "built but never exercised".
- A new capability a third party needs too: an agent minted today is not mirrored today, so
  `agent-identity-atom.ts` is the on-ramp for any unmirrored agent, not a testnet workaround.
- The three guards make two documented hazards unreachable instead of merely documented.

**Negative:**

- **Testnet proves the write, not the join.** ARP created the identity atom itself; on mainnet the
  mirror creates it. So this exercises the machine and not the cross-chain adoption path —
  `rules/portability.md` rule 2, stated here rather than discovered later.
- One more script that can spend. It is the only one, it refuses by default, and its guards are
  tested by the refusals above — but the count is no longer zero.

**Neutral (worth knowing):**

- `prepareStakeOnUsed` plans nothing until the edge is on chain, so declaring and staking are two
  runs. That is correct and was mistaken for a bug for a minute.
- Re-running the declare after the writes landed planned **0 calls**. Idempotency is reported, not
  implied (`DeclarePlan.existingTerms`), and it held in the wild.

## References

- Related ADR: `0037` (testnet signing, the three conditions — all three met: the key never entered
  the agent's context, the signer address was verified first, this file is the record), `0030` (the
  `uses` predicate), `0032` (the subject atom), `0038` (the package never signs), `0042` (creation
  dust), `0016` (the pinning API is gated)
- Related rule: `.claude/rules/portability.md` rules 1, 2 and 4 — all three bit here
- Scripts: `agent-identity-atom.ts`, `agent-send-plan.ts`, `intuition-pin.ts`,
  `agent-declare-used.ts` (`--registry`, `--json`)
