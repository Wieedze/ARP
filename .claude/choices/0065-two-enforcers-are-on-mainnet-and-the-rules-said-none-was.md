# 0065 — Two enforcers are on mainnet, and three files said none was

**Status:** Accepted
**Date:** 2026-10-27
**Triggered by:** `tasks/22`'s step-4 measurement, which had to read `data/deployments/1155.json` to find the enforcer addresses

## Context

ADR `0025` records, in its own first line, that _"the two ARP caveat enforcers were deployed to
Intuition mainnet (chain 1155) on 2026-09-16"_. `data/deployments/1155.json` records both with their
transaction hashes, the deployer, the date and the gas cost. `eth_getCode` against
`https://rpc.intuition.systems/http` on 2026-10-27 returns bytecode at both addresses:

| contract                | address                                      | status in the record                         |
| ----------------------- | -------------------------------------------- | -------------------------------------------- |
| `TrustStakeCapEnforcer` | `0x99921C234d4Ca518DC58ba63ff9bfD2Cc9435f34` | `active` — the guard rail that bounds value  |
| `DomainScopeEnforcer`   | `0x4E20279EeE9f77673A4f1605E58607cD9A597d70` | `inert` — ADR `0025` left it nothing to gate |

Against that, three files carried the sentence **"No ARP contract is deployed to mainnet today, and
none is planned"**:

- `CLAUDE.md`, in its **hard constraints** section;
- `.claude/rules/security.md`, under deployment posture — the file `CLAUDE.md` names as the
  canonical statement on mainnet;
- `.claude/STATE.md`, in its own constraints list.

The sentence is false and has been since 2026-09-16. It was presumably true when written and
survived the deployment because nothing greps a rule file after a deploy.

What made it costly rather than merely untidy is **where** it sits. An agent reads `CLAUDE.md`'s hard
constraints before deciding what it may deploy. A constraint that misdescribes the current state
teaches the reader that the state is something else, and the next agent either repeats a deployment
that already happened or reasons from a world that is not this one.

Neither enforcer has ever fired: 0 `StakeCapChecked` logs over 10,014,303 blocks on 1155
(`scripts/measure/enforcer-events.ts`, 2026-10-27).

## Decision

**The sentence is corrected in all three files to say what is true: no ARP _registry_ is on mainnet
and none is planned; two caveat enforcers are, deployed 2026-09-16 under ADR `0025`, and neither has
ever been invoked.**

The constraint the sentence was protecting is untouched and restated plainly: **mainnet deployment
requires explicit user confirmation per session.** That rule is what stops an unreviewed deploy. The
false factual claim beside it was never load-bearing and was actively misleading.

`data/deployments/1155.json` is the record of what is deployed; the rules cite it rather than restating
its contents, which is the pattern `security.md` already uses for mainnet signing ("exactly one
canonical statement — read it there rather than from a restatement").

## Alternatives considered

- **Record it as a known defect and leave the sentence.** The verifier's suggestion, and
  proportionate for a note in passing. Rejected because the defect is a false statement inside a
  **hard constraints** list: a reader who follows the routing order reaches it before reaching
  `STATE.md`'s defect table, so the correction has to be where the claim is.
- **Delete the sentence entirely.** It would remove the misstatement and the useful half with it —
  "no registry on mainnet" is a real, deliberate property (ADR `0025`) that a reader should not have
  to re-derive.
- **Un-deploy or disown the enforcers.** Not possible and not wanted. `TrustStakeCapEnforcer` is the
  guard rail for the one mainnet path the project intends (ADR `0036`); `DomainScopeEnforcer` is
  recorded as inert precisely so nobody finds it later and guesses.

## Consequences

**Positive:**

- The hard-constraints section describes the chain's actual state, so an agent reasoning from it
  reaches the right conclusion about what exists.
- The rule that matters — per-session confirmation before a mainnet deploy — is stated on its own
  rather than leaning on a factual claim that could rot again.
- `scripts/measure/enforcer-events.ts` now reads enforcer addresses out of
  `data/deployments/<chainId>.json`, so the next reader asks the record instead of a fourth copy.

**Negative:**

- Three files changed for one sentence, which is the cost `rules/claims.md` §5 describes and the
  reason the grep came first. A fourth copy appearing later is still possible; nothing automated
  guards it.

**Neutral (worth knowing):**

- The two deployment files record the same two contracts in **different shapes** — 1155 nests them
  under `arp.enforcers` with a `status`, 13579 puts them flat on `arp` as bare addresses. Reading
  only one shape found nothing on testnet and looked like absence rather than a wrong key. That
  divergence is on `tasks/28`, not fixed here.
- The mainnet enforcers having never fired is a fact about adoption. On testnet the same enforcer
  has 122 `StakeCapChecked` logs across 108 transactions and 9 delegations — of which 93
  transactions are ARP's own rig agent, which proves the machinery and not the market.

## References

- Related ADR: `.claude/choices/0025-no-module-registry-on-mainnet.md` — the decision that deployed
  them and kept the registry off
- Related ADR: `.claude/choices/0036-*.md` — whose funds the mainnet path spends
- Related rule: `.claude/rules/security.md` — deployment posture, and the canonical mainnet-signing
  statement that this correction sits beside
- Related rule: `.claude/rules/claims.md` §5 — grep the old wording before committing a correction
- Related task: `tasks/22-the-chain-as-witness.md` — the measurement that surfaced it
- Measured by: `scripts/measure/enforcer-events.ts`
- Record: `data/deployments/1155.json`
