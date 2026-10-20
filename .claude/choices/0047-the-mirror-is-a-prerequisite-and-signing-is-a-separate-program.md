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
  live in the registry ARP deployed (`deployments/13579.json` → `arp.identityRegistry`), so the path
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
