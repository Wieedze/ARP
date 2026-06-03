# 0010 — Scope re-anchor: two-layer reputation model + final hackathon track selection

**Status:** Accepted
**Date:** 2026-06-03
**Triggered by:** User course-correction after Task 04 UI shipped. The implementation drift had foregrounded the MetaMask delegation mechanics ("agent acts under a scoped delegation") while underemphasizing the actual ARP product surface ("tools accumulate reputation; agents declare composition by staking"). Plus a final decision on which Dev Cook-Off prize tracks are worth the engineering effort with 13 days remaining.

## Context

### Drift diagnosis

What we built across Tasks 01–04 + 04 UI:
- `ModuleRegistry.sol` — on-chain index of tools
- `DomainScopeEnforcer.sol` + `TrustStakeCapEnforcer.sol` — custom caveats
- `scripts/seed.ts` — 1 module + 1 Intuition atom seeded
- MetaMask Smart Account deployment via `SimpleFactory` (ADR 0009)
- End-to-end delegation demo: user → SA → agent EOA, happy + revert paths
- UI module list with live chain reads, design system, wallet connect

The demo answers the question *"can an agent operate under bounded authority from a user?"* — and answers it with crisp on-chain proof. Fine.

But it does NOT answer the question ARP actually asks: *"how do tools accumulate reputation as agents compose with them?"*

### The actual two-layer reputation model

Re-read from the Atlas Discourse post (https://atlas.discourse.group/t/a-two-layer-model-for-attributing-reputation-across-agent-compositions/1261):

1. **Immutable layer (semantic graph)** — the historical record. Agents declare their tool composition via triples in Intuition's knowledge graph: `agent atom → uses → tool atom`. Permanent, indexable, queryable.

2. **Mutable layer (economic positions)** — the active conviction. Agents stake tTRUST on the bonding curves of the tool atoms they claim to use. Snapshots at attestation time bind capital to specific composition claims. Composition lying becomes economically self-defeating: false claims cost capital locked against actual tool performance.

The product surface ARP exposes is **tool reputation FOR agents to consume** when choosing which tools/components to compose with. Built from:
- per-tool: total tTRUST staked, distinct staker count, domain calibration
- per-agent: declared composition (which tools), total committed stake
- domain-level: aggregated reputation across the graph

### What this means for the build

| Surface | What we have | What the real ARP needs |
|---|---|---|
| Tool index | `ModuleRegistry` ✓ | Same |
| Tool identity | 1 Intuition atom for `solidity-audit` ✓ | One atom per tool, scaling as modules are registered |
| Agent identity | None (we use raw EOAs / SAs) | **ERC-8004 `IdentityRegistry`** call to mint an agent ID |
| Composition declaration | Currently none — `registerModule` is the *tool builder* registering a tool, not an agent declaring its composition | Triple creation in Intuition: `agent atom → uses → tool atom` |
| Economic stake | Caveat enforcer can cap stake amount, but we never wire the actual staking action | `MultiVault.deposit(atomId, ...)` per tool, bounded by the existing `TrustStakeCapEnforcer` |
| Reputation surface | None | Per-tool metrics in UI: total stake, agent count, domain calibration (calibration algo is out-of-MVP per pivot) |
| Delegation as authorization | Done ✓ | Repositioned as the *autonomy mechanism* that lets an agent stake on the user's behalf, rather than as the centerpiece narrative |

### Final track decision

The hackathon page (fetched 2026-06-03) lists six paid tracks. After honest ROI analysis:

| Track | Prize | Effort | Decision | Rationale |
|---|---:|---|---|---|
| Best Agent | $3 000 | 0d | **TARGET** | Narrative fit, infrastructure already in place |
| Best A2A Coordination | $3 000 | 2–3d | **TARGET** | Redelegation is natively supported by the framework; sub-delegating tool-staking authority between agents fits the two-layer reputation story (meta-agent composes by delegating to specialized agents bounded by ARP enforcers) |
| Best x402 + ERC-7710 | $3 000 | 2–3d | **DEFERRED** | Decided after A2A lands. Adding x402 means an agent paying for a tool/API access via HTTP-402; possible to layer on top of the existing delegation infra. Decide based on remaining time budget. |
| Best 1Shot Permissionless Relayer | $1 000 USDC | 2–4d | **SKIP** | Requires refactoring SA deployment from `SimpleFactory` to EIP-7702 (ADR 0009 path) AND integrating the 1Shot relayer (which markets a mainnet path; testnet relay availability unclear). Refactor cost without narrative gain. |
| Best Use of Venice AI | $3 000 | n/a | **SKIP** | We don't use Venice; scope creep. User-confirmed drop. |
| Best Social Media (5×$100) | passive | 0d | **PASSIVE** | Existing Atlas forum posts qualify; will tag @MetaMaskDev on the submission tweet. |
| Best Feedback (5×$100) | passive | 0.5d | **PASSIVE** | Constructive feedback at end of hackathon. |

**Realistic target: $6 200** (Best Agent + Best A2A + passives).
**Stretch target: $9 200** if x402 lands within remaining budget.

## Decision

The scope is re-anchored to the **two-layer reputation model** as the primary product narrative. The delegation infrastructure (Tasks 02b, 03b, 04) is repositioned as the *autonomy mechanism* that enables the reputation flow.

Concrete commitments:

1. **Deploy ERC-8004 `IdentityRegistry`** on Intuition Testnet by importing the contract source from `ChaosChain/trustless-agents-erc-ri` (the reference implementation). No deployment exists on Intuition; we deploy a minimal-surface version ourselves. We do NOT deploy `ReputationRegistry` or `ValidationRegistry` from the same suite — their role is played in ARP's architecture by the Intuition graph + tool atom staking; deploying them would create a confused mental model. **Single contract: `IdentityRegistry` only.**

2. **Wire `MultiVault.deposit` for tool atom staking** in a new service. Bounded by the existing `TrustStakeCapEnforcer`. This is the missing "mutable layer" mechanism.

3. **Build triple creation flow** for `agent atom → uses → tool atom` via Intuition's GraphQL `createTriple` mutation. Per the vendored skill's `operations/create-triples.md`. This is the missing "immutable layer" mechanism.

4. **Surface reputation metrics in the UI** — per tool: total tTRUST staked, distinct staker count, domain. Read from Intuition's GraphQL endpoint. Update the module list to show this. Add a module detail page that drills into per-agent stakes.

5. **Add A2A redelegation** as a separate Task 04c (introduced by this ADR). User SA → Agent A SA → Agent B EOA. Both delegators must be deployed SAs.

6. **Defer x402** to a go/no-go decision after Task 04c. If 5+ days remain and stable, attempt. Otherwise skip.

7. **Drop 1Shot, Venice AI** from consideration. Recorded.

## Alternatives considered

- **Stay on the current course (delegation centerpiece, ship UI polish + demo video as-is)**. Rejected — the current demo cannot answer "what makes ARP a reputation protocol" because it doesn't show any reputation accumulating. A judge reading the project description would not understand why we built ModuleRegistry + 2 enforcers when the on-chain story is just "agent can call a contract under user's authority". The two-layer model is the answer; we need to make it visible.
- **Drop everything we built, restart on the reputation-first story**. Rejected — the delegation infrastructure is the *autonomy mechanism* that enables a tooled agent to act on the user's behalf in a bounded way. It's real product value, just not the headline. Keep it, reposition it.
- **Add 1Shot for the $1K USDC track**. Rejected per the table above — refactor cost vs. narrative gain is not worth it. The 1Shot mainnet-relay requirement plus EIP-7702 path conflict with the existing SimpleFactory-deployed SAs.
- **Add Venice AI** for the $3K track. Rejected by the user.
- **Add A2A by reusing the user's existing single delegation chain**. Rejected — A2A requires *redelegation* per the track rules. Single-level delegation does not qualify. The implementation cost (2-3 days for a real redelegation chain) is justified by the $3K prize and the narrative fit.

## Consequences

**Positive:**
- The submission narrative finally matches the ARP product description in `docs/01_PROJECT_CONTEXT.md` and the Atlas Discourse post.
- $3K added to the target via A2A redelegation, with a clean narrative tie-in (meta-agent compositions).
- ERC-8004 integration completes the "agent identity" piece the pivot brief flagged as a small scope expansion.
- Reputation metrics in the UI give judges something to point at when asking "how does ARP work" — concrete numbers, not just contract addresses.

**Negative:**
- ~5–8 days of net new work added to a 13-day window. Tight but feasible if Task 04 polish is deferred until after the core reputation surface lands.
- ERC-8004 contract is third-party source; we own the audit obligation on the deployed bytecode. Mitigation: use the published reference implementation verbatim (no edits), pin to a commit, verify on Blockscout post-deploy.
- A2A flow adds a second Smart Account to the user-facing UI. Doubles the "Smart Account deploy" friction in the demo. Mitigation: cache the deployment status; deploy lazily when the user first redelegates.
- We give up on Venice AI and 1Shot prize pools ($3K + $1K USDC). Honest tradeoff for focus.

**Neutral (worth knowing):**
- The reputation aggregation in the UI reads from Intuition's GraphQL endpoint, which is centralized infrastructure. Acceptable for the demo; the on-chain stake state is the source of truth, the GraphQL is an indexer for fast reads.
- ERC-8004 `IdentityRegistry` is ERC-721-based — agent IDs are NFT-like. Aligns with the spec's "agent metadata + ownership" model.
- The Intuition skill's `operations/create-triples.md` is the canonical procedure for the triple-creation step; follow it verbatim per ADR 0003's no-improvisation rule on vendored skill APIs.

## Task replan (post-ADR)

Updated sequence for the remaining 13 days:

| Task | Days | Deliverable |
|---|---:|---|
| 04 polish (defer remaining items) | — | Currently done at MVP level; revisit only after core reputation lands |
| 04b core (new scope: reputation layer) | 3–5 | ERC-8004 IdentityRegistry deployed + agent register UI + tool composition + stake via MultiVault + triple creation + metrics in UI |
| 04c (new task: A2A redelegation) | 2–3 | Sub-delegation flow + UI + demo path |
| 05 polish | 2–3 | Module detail page + Vercel deploy + Blockscout verification |
| 05b submit | 2–3 | Demo video + README + HackQuest submission + tweets |
| Buffer | 1–2 | Slack |

**Total: 10–16 days** against a 13-day window. Some slippage risk on the stretch (x402). Manageable.

## References

- Atlas Discourse — *A two-layer model for attributing reputation across agent compositions*: https://atlas.discourse.group/t/a-two-layer-model-for-attributing-reputation-across-agent-compositions/1261
- ERC-8004 reference implementation: https://github.com/ChaosChain/trustless-agents-erc-ri
- Sepolia ERC-8004 deployments (NOT what we use, just for reference):
  - IdentityRegistry: `0xf66e7CBdAE1Cb710fee7732E4e1f173624e137A7`
  - ReputationRegistry: `0x6E2a285294B5c74CB76d76AB77C1ef15c2A9E407`
  - ValidationRegistry: `0xC26171A3c4e1d958cEA196A5e84B7418C58DCA2C`
- HackQuest hackathon page: https://www.hackquest.io/hackathons/MetaMask-Smart-Accounts-Kit-x-1Shot-API-x-Venice-AI-Dev-Cook-Off
- Pivot brief: `docs/00_HACKATHON_PIVOT.md` (mentions the minimal IdentityRegistry call as in-scope)
- Vendored skill procedures: `.claude/skills/intuition/operations/create-triples.md`, `operations/deposit.md`
- Earlier ADRs: `0002` (hackathon pivot), `0003` (vendored skills), `0008` (Intuition URI coupling), `0009` (SA deploy via SimpleFactory)
