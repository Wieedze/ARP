# 27 — The passage to mainnet

Written 2026-11-04, at the user's request, after a read-only audit of Intuition mainnet 1155. No
transaction was sent. The figures come from `scripts/measure/mainnet-readiness.ts`, whose raw output
is `data/measurements/mainnet-readiness-2026-11-04.json`, unless a line names another source.

**The order is the user's decision (2026-11-04): demonstrate the concept on testnet 13579 first, then
launch on mainnet.** The feed for aggregators is the one piece that waits for mainnet, because only
mainnet data is worth selling. This document is the checklist for that launch. It authorises nothing:
every mainnet write below still needs the decisions in §4.

## 1. The state on 1155

ARP has no proof of its own on mainnet today, and its connector cannot plan a new declaration there.

| Part | State on 1155 | What was observed |
| --- | --- | --- |
| Reading agents and Base identities | works | `arp_find_agents` reports 28,648 agents. Base agent 1380 resolves and is `declarable: true` |
| Planning a declaration | **broken** | `previewTripleCreate` reverts on 1155 and answers on 13579. A simulated `createTriples` succeeds on 1155, so the write itself is fine. Cause not established; the two chains run different MultiVault implementations |
| Finding a tool or a skill | empty | `arp_find_tools` returns 0, against 618 on 13579. 0 of the catalogue's 604 recorded skill atoms exist on 1155 |
| Getting a skill, with a receipt | absent | `arp_get_skill` is served only in the sponsored modes, which are 13579 only. There is no `skills-1155.json` (`apps/mcp/src/data.ts:18`). Content receipts are refused on mainnet until x402 (ADR `0102`) |
| Hook and install | testnet | The installer sets `ARP_TARGET=testnet` (`apps/cli/src/install/targets.ts`). `session-log.ts` defaults to 13579 |
| Sponsor | testnet | `SPONSOR_CHAIN_ID = 13579`. On 1155 every declarer pays |
| Node | not run | 58 tests pass and the code separates the identity chain from the payment chain. It has not been run against 1155 |
| Probe | local | One real cycle ran over 22 targets. It has no public history, and it does not check skills, APIs or agents' own endpoints |
| Feed for aggregators | absent | `apps/api` serves `/healthz`, `/facts` and `/refresh`, with nothing per tool |
| `TrustStakeCapEnforcer` | v1, never fired | 0 `StakeCapChecked` logs over 10,409,326 blocks (`scripts/measure/enforcer-events.ts`). The mainnet copy still has the griefing defect ADR `0118` fixed |

**The 188 `uses` edges on 1155 are not ARP's traction.** They have 118 creators, 0 of them ARP's
deployer address, and their subjects include `Donald Trump` and `Base`. One of the 84 subjects has a
`same as` edge, and none has a Base ERC-8004 identity in it.

## 2. What has to be true before the launch

The launch waits for the testnet demonstration, and for Intuition's validation
(`docs/15`, and the user's decision of 2026-10-30). The demonstration is complete when each of these has
been walked on 13579 and recorded:

1. An agent finds a skill, gets it with a receipt, uses it, declares it, and the declaration reads back.
2. An agent with a **real Base ERC-8004 identity** does the same. Measured 2026-11-04: 0 of the 103
   `uses` subjects on 13579 have one.
3. A hire: a payment, the node's check, a signed receipt, and a verifier accepting that receipt.
4. The probe has run continuously and its readings reach the agent choosing a tool.

Testnet cannot show that a third party will pay, or that a price means anything (`docs/15` gaps 3
and 5). Those two questions open on launch day and are the reason for it.

Two questions about a line have to be answered before a mainnet port of `domain`, `outcome` and
`reason`, which stay on 13579 until then. A writer's control of the agent is not proven (ADR `0135`).
And a line held on deposits costs far less than one written, about 50 times on 13579 in small vaults
(ADR `0138`, `scripts/measure/line-cost.ts`), with mainnet not read. The user accepted that on testnet, and it
blocks mainnet until it is answered.
The same for what a sponsored line costs ARP's treasury, 0.012 tTRUST on 13579 with no proof of use, about 98% of
the agent's share of it redeemable by a fresh key (ADR `0144`): accepted on testnet by the user, blocking for mainnet.

## 3. The work, in order

Efforts are estimates. Costs were read from the chain on 2026-11-04 and change with governance, so
read them again before signing (`rules/portability.md`).

| # | Work | Unlocks | Effort | Cost on 1155 |
| --- | --- | --- | --- | --- |
| 1 | Find why `previewTripleCreate` reverts and fix its four callers: `declare/plan.ts:400`, `declare/identity-plan.ts:185`, `declare/endpoint-binding-plan.ts:179`, `delegation/register.ts:299`. Add a check that reads 1155 | every mainnet write | ½–1 day | 0 |
| 2 | Write a small catalogue: about 20 chosen skills, not 662. Then confirm `arp_find_tools` returns them | search | ½ day | at most 6.6 TRUST without tags (20 × atom, repository and `source` edge) |
| 3 | Port the loop: `arp_get_skill` without the sponsor, `skills-1155.json`, the hook and the installer on the right chain | receipts on 1155 | 1–2 days | 0 |
| 4 | Decide how a content receipt works before x402 (§4) | receipts on 1155 | decision | 0 |
| 5 | Walk the loop once with a real Base agent, signed by hand | agent and skill proofs | ½ day | 0.11 TRUST per declaration, 0.22 if the tool's atom is new |
| 6 | Hire the node with a real payment, by someone other than its operator | the hire proof | 1 day and a third party | the hire's price |
| 7 | Build the feed: per subject `status`, `fetchedAt`, `sources` and `data`, with atom and triple ids, and ARP's own agents marked apart | aggregators | 1–2 days | 0 |
| 8 | Bring in operators by hand and count them apart from ARP | traction | not development | theirs |

Costs behind the table: `getAtomCost()` 0.100000000001 TRUST, `getTripleCost()` 0.100000000002 TRUST,
`minDeposit` 0.01 TRUST (`scripts/measure/preview-before-create.ts mainnet`).

Not needed for the launch: writing all 662 skills, a sponsor on mainnet, porting the web app's ARP
contracts, or a registry of ARP's own (ADR `0025`).

## 4. Decisions this needs from the user

- **Who signs ARP's mainnet writes.** `rules/security.md` forbids any script or agent signing with
  ARP's funds. ADR `0017` covers deposits on existing `has trust provider` vaults, not the atoms and
  triples of §3. A new ADR has to name the signer, the cap and the list of writes. The proposal is a
  human signing in a wallet, under a cap fixed in advance.
- **How an agent signs for its operator.** A raw key in an agent session is testnet only (ADR `0037`),
  and mainnet needs a signed delegation (ADR `0036`), whose path was set aside on 2026-11-03. So either
  operators sign each declaration themselves at launch, or delegations come back. If they come back,
  `TrustStakeCapEnforcer` needs redeploying first, which needs the user's explicit confirmation that session.
- **What a content receipt costs at launch.** ADR `0102` ties it to x402, and task 41 is deferred to the
  mainnet port. The choice is to build x402 or to serve receipts free on 1155 for a period.
- **Which Base agent walks first.** ARP's own agents are on 13579's registry. A proof needs one on Base,
  the user's or a partner's.
- **Which agents can declare at all.** The mirror covers 28,648 of 1,153,264 Base ids, or 2.5%
  (`scripts/measure/cohort-coverage.ts`, 2026-11-04). Everyone else needs identity atoms first, at the
  operator's cost or ARP's.

## 5. The proofs to show

| Proof | What it establishes | What a reader checks | Rung (`docs/09` §3) |
| --- | --- | --- | --- |
| Service state | This service answered on these dates | Dated public readings, off chain by design (ADR `0093`) | a dated fact |
| Agent | A real Base agent stated what it uses, and paid to say so | A `uses` triple on 1155 joined to the Base identity | staked |
| Skill | This exact file was served to this agent, which declared using it | Atom, `source` edge, declaration, signed receipt with the file's digest | staked, with a receipt |
| Hire | Someone else paid an agent and got a receipt | The payment transaction and an EIP-712 receipt, checkable without ARP | proven |

A content receipt shows the file was served. It does not show the skill did its job.

## 6. What HOL documents

Read 2026-11-04. These are their pages, and they are drafts.

- `availability` is an existing example adapter, and its signal accepts a `probe` source
  ([adapter](https://hol.org/docs/standards/hcs-25/adapters/availability/),
  [signal](https://hol.org/docs/standards/hcs-25/signals/availability/)). ARP's probe could feed it and
  would not stand out by doing so.
- `erc8004-feedback` takes an average rating and a volume
  ([adapter](https://hol.org/docs/standards/hcs-25/adapters/erc8004-feedback/)). ARP writes to Intuition
  in a different shape, so this is the first thing to clarify with them.
- The broker has skill APIs ([client](https://hcs-improvement-proposals.pages.dev/docs/registry-broker/api/client)).
  The pages read define no trust score for skills.
- No process is described for an outside trust signal. An HCS-21 adapter submission exists, with no
  stated link to scoring ([OpenAPI](https://hol.org/registry/api/v1/openapi.json)).

**Not checked:** the overlap between their registry and ARP's catalogue, because their API refused this
machine's requests (Cloudflare), and about 135k characters of their OpenAPI.

## 7. Measure it again

```bash
bun run scripts/measure/mainnet-readiness.ts
bun run scripts/measure/preview-before-create.ts mainnet
bun run scripts/measure/enforcer-events.ts
bun run scripts/measure/cohort-coverage.ts
ARP_TARGET=mainnet bun run apps/mcp/src/server.ts --stdio   # then tools/call arp_find_tools
```
