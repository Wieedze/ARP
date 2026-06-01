# HACKATHON PIVOT — Briefing for Claude Code

**Date**: May 19, 2026
**Status**: ACTIVE PIVOT — read this entirely before resuming any work on the repo.

This document supersedes parts of the existing project scope. It does not replace `docs/02_ARCHITECTURE.md` or `docs/03_MVP_SCOPE.md` but **extends them** to reflect a new strategic commitment: ARP is now being built as a submission to the MetaMask Dev Cook-Off hackathon, with a deadline of June 15, 2026.

---

## Why this document exists

The original ARP Module Registry MVP was scoped as a 2-week credibility artifact for a meeting with the Intuition core team. That goal still holds, but the strategic context has shifted:

1. **MetaMask launched a $14,000 hackathon** (Dev Cook-Off) running May 18 – June 15, 2026, with tracks directly aligned with ARP's architecture (Best Agent, Best x402 + ERC-7710, Best A2A coordination).
2. **The Intuition chain (mainnet + testnet) is now natively supported in the MetaMask Smart Accounts Kit** as of this week. This means agents on Intuition can use Smart Accounts and ERC-7710 delegation natively.
3. **ARP's architectural thesis (compositional reputation + economic positioning + delegation) maps perfectly onto the hackathon's qualification requirements.** The original MVP scope was a subset of what ARP could be at submission.

Therefore: the MVP is being **expanded** to integrate MetaMask Smart Accounts Kit, ERC-7710 delegation, and ARP-specific caveat enforcers. The submission deadline is June 15, 2026 at 10:59 UTC.

---

## Updated strategic context

### Tracks being targeted

ARP will primarily target two tracks of the Dev Cook-Off, plus passive participation in two side tracks:

- **Best Agent ($3,000)** — primary track. ARP positions agents as reputation-bounded autonomous actors.
- **Best x402 + ERC-7710 ($3,000)** — secondary track. Agents pay for tool/API access via x402, bounded by ARP caveat enforcers.
- **Best Social Media presence ($100 minimum)** — passive. Atlas forum posts already exist; future Twitter posts will tag @MetaMaskDev.
- **Best Feedback ($100 minimum)** — passive. Constructive feedback will be submitted at end of hackathon.

### The hackathon submission narrative

The single sentence that describes what we are submitting:

> *ARP turns agents into reputation-bounded actors. An agent registers via MetaMask Smart Accounts, declares its tool composition on Intuition's semantic graph, stakes TRUST on its tools using Intuition's exponential bonding curve, and posts attestations autonomously within a scoped ERC-7710 delegation. The delegation is bounded by ARP-specific caveat enforcers that restrict staking to declared domains and cap exposure per period. Tools that contribute to well-calibrated attestations accrue reputation in the graph, creating the missing feedback loop between agent infrastructure and the builders who maintain it.*

This narrative is what every code decision and UI element should support. If a feature does not serve this narrative, it is out of scope for the hackathon submission.

### Chain target

**Intuition Testnet** for the entire build period and submission. Intuition mainnet remains a post-hackathon decision and is explicitly out of scope.

This is a change from the original scaffolding which pointed to Base Sepolia. The reason: MetaMask Smart Accounts Kit is now natively supported on Intuition chain, which makes Intuition the obvious deployment target — ARP becomes Intuition-native by infrastructure, not just by narrative.

---

## What stays the same

The following remain locked from the original scaffolding and should not be re-litigated:

- **One-line positioning**: "ARP is the Intuition reputation layer for ERC-8004 agents. Identity is ERC-8004. Trust graph is Intuition. Domain-dimensional calibration is ARP."
- **Storage pattern**: single source of truth + derived projections. No dual-write. Modules canonical on Intuition atoms; attestations canonical on ERC-8004 Reputation Registry; scores derived by indexer.
- **Quality bar**: prestige UI, 100% test coverage on contract public surface, Trail of Bits security review pass on every contract.
- **Communication norms**: when reporting after a task, lead with what shipped, what was decided, and what's next or blocked. No filler.
- **Scope discipline**: if a task seems to require something not documented, stop and ask before expanding.

---

## What is being added

Four new tasks extend the original five. Each integrates with the hackathon submission requirements.

### Task 02b — ARP Caveat Enforcers

Build the cryptographic enforcement layer of ARP. Two enforcer contracts are required for hackathon qualification, both deployed on Intuition Testnet.

**`DomainScopeEnforcer.sol`** — validates that a staking action targets a tool atom whose domain is in the agent's authorized domain list. Reverts if the tool's domain is not in the caveat's allowed list.

**`TrustStakeCapEnforcer.sol`** — caps the total TRUST an agent can stake within a rolling period. Tracks cumulative stake per delegator and reverts if the new action would exceed the cap.

Both enforcers must implement the `ICaveatEnforcer` interface from the MetaMask Delegation Framework. Both must have full Foundry test coverage and a Trail of Bits security review pass before merging.

The interface signature each enforcer must implement:

```solidity
interface ICaveatEnforcer {
    function beforeHook(
        bytes calldata terms,
        bytes calldata execution,
        address delegator,
        address delegate
    ) external view;
}
```

The `terms` parameter encodes the caveat-specific configuration (allowed domains list for `DomainScopeEnforcer`; cap value and period for `TrustStakeCapEnforcer`). The `execution` parameter is the action the agent is attempting. Each enforcer decodes both, performs its validation, and reverts on failure.

### Task 03b — Smart Account Integration

Integrate the MetaMask Smart Accounts Kit into the application. The user creates a Smart Account that will act as the agent's operating identity on Intuition. The user then signs a single delegation that grants the agent permission to stake on tools and post attestations, scoped by the two caveat enforcers built in Task 02b.

Required deliverables for this task:

- Smart Account creation flow via MetaMask Smart Accounts Kit on Intuition Testnet
- Delegation signing flow where the user configures the caveats (which domains, what cap)
- Storage of the signed delegation in app state (and optionally on-chain for permanence)
- A working "act as agent" flow where the agent executes a staking transaction bounded by the delegation
- Demonstration that an attempted out-of-scope action correctly reverts via the enforcer

Refer to the MetaMask Smart Accounts Kit documentation for the exact SDK usage. The relevant guides are at https://docs.metamask.io/smart-accounts-kit/ — particularly the delegation execution guide and the x402 buyer-with-delegations guide.

### Task 04b — Agent Registration UI

Build the user-facing flow that ties everything together. The UI must clearly demonstrate the full agent lifecycle in a sequence visible to a hackathon judge watching a demo video.

The flow:

1. User connects their wallet
2. User registers an agent (creates an ERC-8004 agentId — note: ERC-8004 integration was originally out of scope; for the hackathon, a minimal `IdentityRegistry` call is required, so this is a small scope expansion)
3. User creates a MetaMask Smart Account for the agent
4. User signs a delegation scoped by `DomainScopeEnforcer` and `TrustStakeCapEnforcer`
5. The agent (operating under delegation) registers tool atoms on Intuition
6. The agent stakes TRUST on those tool atoms via Intuition's exponential bonding curve
7. The agent posts an attestation in one of the declared domains
8. The UI shows the resulting graph state and the agent's current positions

The UI design principles from `docs/05_UI_DESIGN.md` still apply. Dark mode, typographic, prestige bar. Do not regress on UI quality for hackathon speed.

### Task 05b — Demo Video and Submission

The final task. Produce all hackathon deliverables and submit before the deadline of June 15, 2026 at 10:59 UTC.

Required deliverables:

- A demo video (3–5 minutes) that shows the working application in main flow, with clear narration of what is happening at each step. The MetaMask Smart Accounts Kit integration must be visible in the main flow per qualification requirements.
- A written project description for HackQuest that articulates the hackathon submission narrative (see above) and the specific tracks being targeted.
- A clean repository with a README that any judge can read in under five minutes and understand the project.
- A live deployment of the UI on Vercel (or equivalent) pointing to deployed contracts on Intuition Testnet.
- Submission completed on the HackQuest platform: https://www.hackquest.io/hackathons/MetaMask-Smart-Accounts-Kit-x-1Shot-API-x-Venice-AI-Dev-Cook-Off

---

## Updated task ordering

The full task sequence is now nine tasks, completed in this order:

1. **Task 01** — Project setup (already covered in existing scaffolding; verify Bun, Foundry, Vite are all working; add `@metamask/delegation-toolkit` and related dependencies; update chain config to Intuition Testnet)
2. **Task 02** — ModuleRegistry contract (already covered; build as originally scoped)
3. **Task 02b** — NEW. ARP Caveat Enforcers (`DomainScopeEnforcer`, `TrustStakeCapEnforcer`)
4. **Task 03** — Deploy ModuleRegistry + seed modules + create Intuition atoms (adjusted target: Intuition Testnet, not Base Sepolia)
5. **Task 03b** — NEW. Smart Account integration in the app
6. **Task 04** — UI core (module list, module detail) — as originally scoped
7. **Task 04b** — NEW. Agent registration UI flow (lifecycle from wallet connect to attestation)
8. **Task 05** — UI polish + Vercel deploy — as originally scoped
9. **Task 05b** — NEW. Demo video + hackathon submission

Each task remains atomic. Each task should be completed and committed before starting the next. Each task's completion report follows the format defined in `CLAUDE.md`.

---

## Scope adjustments to existing tasks

A few small adjustments to original tasks to reflect the hackathon pivot:

**Task 03 — Seed modules**: reduce from three modules to **one** (`solidity-audit`) for time discipline. The architecture supports more — but seeding three takes time we now need elsewhere. The other two domains (URL classification, claim verification) are stretch goals if Task 05b is on track ahead of schedule.

**Task 03 — Chain target**: Intuition Testnet, not Base Sepolia. Update all deployment scripts and `.env.example` accordingly.

**Task 04 — UI module list**: keep as-is, but design the layout to accommodate the agent registration flow that comes in Task 04b. The two flows will share design tokens and components.

**Task 05 — UI polish**: same standards, but the polish pass now includes the agent registration flow from Task 04b.

---

## What stays explicitly out of scope (even for hackathon)

The temptation during a hackathon is to add features. Resist it. The following remain out of scope and should not be implemented:

- TRUST token economics beyond Intuition's native bonding curve
- Calibration algorithm (the scoring function itself — for the hackathon, attestations are posted but calibration logic is not implemented)
- Off-chain indexer
- Merkle checkpoint mechanism
- ZK proofs (Noir / Aztec integration)
- TEE-attested invocation logs
- Real ground truth resolution mechanism (attestations are accepted but not resolved against truth for the demo)
- Mainnet deployment
- A2A coordination / redelegation (this is its own track; chasing it would dilute focus)
- Venice AI integration (separate track, hors scope)
- Module updating or deletion
- Multi-chain support
- i18n

If a task feels like it requires one of these, **stop and ask**. The temptation will be highest in week 3 when momentum is good and ambition rises. The discipline is to ship what was scoped, not what could be built.

---

## Communication protocol for this pivot

When working on the new tasks (02b, 03b, 04b, 05b), the reporting format from `CLAUDE.md` still applies, but with one addition: every completion report must explicitly answer the question **"Does this preserve the hackathon submission narrative?"** in one sentence. If the answer is no, the implementation has drifted and needs review before merging.

---

## Timeline

| Week | Dates | Tasks | Deliverable |
|---|---|---|---|
| 1 | May 19–25 | 01, 02, 02b start | Setup verified; ModuleRegistry deployed on Intuition Testnet; first enforcer scaffolded |
| 2 | May 26–Jun 1 | 02b complete, 03, 03b start | Both enforcers deployed and tested; ModuleRegistry seeded with one module; Smart Account flow working in isolation |
| 3 | Jun 2–8 | 03b complete, 04, 04b | Smart Account fully integrated; UI core deployed; agent registration flow working end-to-end |
| 4 | Jun 9–15 | 05, 05b | Polish pass; demo video produced; submission completed by Jun 15 at 10:59 UTC |

The submission deadline is hard. Reward announcement is June 22, 2026.

---

## Source of authority

When in doubt about what to build, this document and the existing `docs/` folder are the canonical references. If they conflict with this document, this document wins, because it reflects the most recent strategic decision. Other sources of authority (Discord conversations, casual mentions, external articles) are inputs, not directives — they require user confirmation before being acted on.

For technical questions about the MetaMask Smart Accounts Kit, the authoritative source is https://docs.metamask.io/smart-accounts-kit/. For Intuition protocol questions, the authoritative source is the Intuition documentation and the existing `intuition-protocol` skill installed in this environment.

---

*End of pivot briefing. Resume work on Task 01 verification, then proceed in the order defined above.*
