# 0002 — Hackathon pivot: target MetaMask Dev Cook-Off

**Status:** Accepted
**Date:** 2026-05-19
**Triggered by:** User pivot brief (verbatim at `docs/00_HACKATHON_PIVOT.md`)

## Context

Three external facts converged in the same week:

1. MetaMask launched the **Dev Cook-Off** hackathon ($14K total, May 18 – Jun 15, 2026) with tracks that map onto ARP's architecture (Best Agent, Best x402 + ERC-7710).
2. The **Intuition chain** is now natively supported by the MetaMask Smart Accounts Kit. This makes Intuition the obvious deployment target — ARP can be Intuition-native at the infrastructure level, not only at the narrative level.
3. ARP's architectural thesis (compositional reputation + economic positioning + delegation) is a natural fit for the hackathon's qualification requirements, with mostly **additive** work over the existing MVP.

The original MVP was a 2-week credibility artifact for the Intuition core team. The hackathon does not invalidate that goal — it *extends* it. A successful submission ships the same artifact, plus additional components (caveat enforcers, Smart Account integration, agent registration UI) that strengthen the demo without contradicting the existing architecture.

## Decision

ARP commits to submitting to the **MetaMask Dev Cook-Off**, deadline **June 15, 2026 at 10:59 UTC**.

Concrete changes versus the original scaffolding:

- **Deployment target** changes from Base Sepolia to **Intuition Testnet**.
- **Four new tasks** added: 02b (caveat enforcers), 03b (Smart Account integration), 04b (agent registration UI), 05b (demo video + submission).
- **Task 03** scope reduced from three seed modules to one (`solidity-audit`), to reclaim time budget for new tasks.
- **A new rule** `rules/metamask-delegation.md` is introduced, covering ICaveatEnforcer, ERC-7710 delegation flows, and Smart Accounts Kit usage.
- **Communication protocol** adds one mandatory check for hackathon tasks (02b, 03b, 04b, 05b): every completion report answers "Does this preserve the hackathon submission narrative?" in one sentence.
- **Source-of-authority hierarchy** is now: `docs/00_HACKATHON_PIVOT.md` → `docs/02_ARCHITECTURE.md` → `docs/03_MVP_SCOPE.md`. Where they conflict, the pivot doc wins.

The hackathon submission narrative (verbatim from the brief) is the constraint against which every feature decision is tested:

> ARP turns agents into reputation-bounded actors. An agent registers via MetaMask Smart Accounts, declares its tool composition on Intuition's semantic graph, stakes TRUST on its tools using Intuition's exponential bonding curve, and posts attestations autonomously within a scoped ERC-7710 delegation. The delegation is bounded by ARP-specific caveat enforcers that restrict staking to declared domains and cap exposure per period. Tools that contribute to well-calibrated attestations accrue reputation in the graph, creating the missing feedback loop between agent infrastructure and the builders who maintain it.

## Alternatives considered

- **Stick to original MVP scope, ignore the hackathon.** Rejected — the work is mostly additive to the existing architecture, and the alignment with track requirements is too clean to walk past. The hackathon also provides external validation of ARP's thesis that costs almost nothing extra in design effort.
- **Pursue more tracks (A2A, Venice AI).** Rejected per the pivot brief itself. Focus discipline: two primary tracks + two passive. Chasing A2A or Venice would dilute the demo.
- **Skip the pivot doc; absorb the changes into the existing `docs/02_ARCHITECTURE.md` and `docs/03_MVP_SCOPE.md`.** Rejected — the pivot is a strategic decision distinct from the original architecture and deserves a standalone, immutable record. Editing the existing docs would erase the history.
- **Generate the four new task files (02b/03b/04b/05b) now.** Rejected for the moment — the pivot brief describes them in enough detail. Concrete task files are written at the start of the week the task is executed, to avoid spec staleness.

## Consequences

**Positive:**
- Clear external deadline forces shipping discipline.
- Prize pool ($3K–$6K likely target tracks) is non-trivial.
- External validation of ARP's architecture independent of the Intuition team meeting.
- Intuition-native by infrastructure (Smart Accounts Kit on Intuition chain).

**Negative:**
- Four weeks compressed window. Slippage costs the submission.
- Scope expanded (ERC-8004 IdentityRegistry minimal call now in scope, was out).
- New dependencies: `@metamask/delegation-toolkit`, MetaMask Smart Accounts Kit.
- Original "three seed modules" reduced to one — slight regression on Intuition-team demo richness, accepted as time-budget tradeoff.

**Neutral (worth knowing):**
- Deployment scripts and `.env.example` need updating for Intuition Testnet RPC, explorer, and chain ID.
- `.claude/rules/security.md` and `CLAUDE.md` reference Base Sepolia and need patching.
- The narrative-preservation question becomes a verifier check for hackathon-tagged tasks.

## References

- Pivot brief: `docs/00_HACKATHON_PIVOT.md`
- Original architecture: `docs/02_ARCHITECTURE.md` (still in force for what it covers)
- Original MVP scope: `docs/03_MVP_SCOPE.md` (extended, not replaced)
- New rule: `.claude/rules/metamask-delegation.md`
- Router: `CLAUDE.md` (updated in this same change)
- MetaMask Smart Accounts Kit docs: https://docs.metamask.io/smart-accounts-kit/
- HackQuest submission page: https://www.hackquest.io/hackathons/MetaMask-Smart-Accounts-Kit-x-1Shot-API-x-Venice-AI-Dev-Cook-Off
- Follow-up ADR `0003-metamask-skills-vendored-locally.md` records the local install of MetaMask's skills (`mms-smart-accounts-kit`, `mms-gator-cli`) into this repo.
