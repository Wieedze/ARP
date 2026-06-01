# 0004 — MetaMask as canonical reference, Bear Trap as supplementary example for enforcers (Task 02b)

**Status:** Accepted
**Date:** 2026-05-19
**Triggered by:** User-provided reference briefing (saved verbatim as `docs/06_BEAR_TRAP_REFERENCE.md`), followed by user clarification that the canonical reference is MetaMask (not Bear Trap).

## Context

Task 02b (ARP Caveat Enforcers — `DomainScopeEnforcer.sol`, `TrustStakeCapEnforcer.sol`) is on the critical path for the MetaMask Dev Cook-Off submission. Implementing custom `ICaveatEnforcer` contracts is non-trivial:

- The framework's execution-mode semantics, `delegationHash` state scoping, and decoding patterns are subtle.
- The interface has evolved across framework versions, and getting the wrong signature means a contract that compiles but is silently uncallable by `DelegationManager`.
- The Trail of Bits-style threat model for an enforcer has several enforcer-specific items (mode-confusion, decoding-failure handling, delegation-hash-scoped state pollution) that don't appear in a generic Solidity checklist.

**Bear Trap** (https://github.com/osobot-ai/bear-trap) is a production-deployed ERC-7710 puzzle game on Base that implements a custom `ICaveatEnforcer` (`ZKPEnforcer.sol`) composed with the MetaMask Delegation Framework. It ships with 40+ Foundry tests, a documented audit, and patterns we can extract directly:

- Custom errors with descriptive names
- Execution mode guards at the top of `beforeHook`
- Defensive `abi.decode` of `terms` and `execution`
- Per-`delegationHash`-keyed state mappings (the right shape for `TrustStakeCapEnforcer`)
- Events on every enforcement decision
- Single-purpose enforcers (one enforcer = one concern)

The application layer of Bear Trap (RISC0 ZK proofs, puzzle game logic, Web3Auth modal, SQLite backend) is irrelevant to ARP. The **mechanism** transfers directly; the **application** does not.

## Decision

**MetaMask is the canonical reference for ARP enforcers. Bear Trap is a supplementary real-world example for patterns, test density, and security checklist — not for authoritative API or interface details.**

The reading order for Task 02b, in priority order:

1. `.claude/skills/mms-smart-accounts-kit/references/delegations.md` — **canonical**. Authoritative for the `ICaveatEnforcer` interface signature, the four-hook lifecycle, the parameter order and semantics, and the `DelegationManager` redemption flow. This is sourced from the current MetaMask Delegation Framework documentation.
2. `.claude/skills/mms-smart-accounts-kit/SKILL.md` + the rest of `references/` (smart-accounts, advanced-permissions) — canonical for surrounding SDK usage.
3. https://docs.metamask.io/smart-accounts-kit/ — canonical when the vendored snapshot is ambiguous or appears outdated.
4. `.claude/rules/metamask-delegation.md` — ARP-specific practice on top of the canonical references.
5. `docs/06_BEAR_TRAP_REFERENCE.md` — **supplementary**. A real-world enforcer (Bear Trap's `ZKPEnforcer.sol`) deployed in production on Base, with 40+ Foundry tests and a documented audit. Useful for: enforcer code structure, custom error patterns, execution mode guards, defensive decoding, per-`delegationHash`-keyed state mappings, event emission for off-chain indexing, test density target, security checklist items. **Not** authoritative for the interface signature or SDK behavior.

**Interface authority resolution.** The Bear Trap brief shows a 2-hook `ICaveatEnforcer` interface with parameter order `(terms, execution, mode, args, delegationHash, delegator, delegate)`. The MetaMask reference (vendored `mms-smart-accounts-kit/references/delegations.md`) shows **four hooks** (`beforeAllHook`, `beforeHook`, `afterHook`, `afterAllHook`) with parameter order `(_terms, _args, _mode, _executionCalldata, _delegationHash, _delegator, _redeemer)`. **MetaMask wins** — Bear Trap predates the current framework version. The Bear Trap brief has been annotated with this caveat at the top and inline next to the obsolete interface block.

**View-only question resolved.** ADR `0002` and earlier versions of `.claude/rules/metamask-delegation.md` flagged a concern that the `view` modifier on `beforeHook` would prevent state tracking in `TrustStakeCapEnforcer`. The MetaMask reference shows the hooks are **not** `view`, and Bear Trap's pattern (per-`delegationHash`-keyed state mutations in `beforeHook`) confirms the approach is sound. The earlier escalation note is removed from the rule.

## Alternatives considered

- **Treat Bear Trap as the canonical reference (initial framing before user clarification).** Rejected after user said "la reference cest metamask". Bear Trap is a single production deployment; MetaMask's docs + Delegation Framework are the actual authority on the interface and its evolution. Bear Trap retains real value as a worked example, but it does not override MetaMask.
- **Drop Bear Trap entirely; use only the vendored MetaMask skill.** Rejected. The skill is authoritative on the interface and SDK usage but does not include a complete production enforcer with 40+ tests and a documented audit. Bear Trap fills that gap as an example, with its role explicitly downgraded to "supplementary".
- **Implement enforcers from scratch with no second-look reference.** Rejected — the threat model nuances (mode-confusion, per-`delegationHash` state pollution, decoding-failure handling) are easy to get wrong; having one real production enforcer to cross-check against catches mistakes early.
- **Clone Bear Trap into the repo as a vendored dependency.** Rejected — Bear Trap pulls in RISC0 + Boundless + a Rust toolchain that we'd then have to ignore. Reading the repo at Task 02b time is sufficient; vendoring the verbatim brief at `docs/06_BEAR_TRAP_REFERENCE.md` is enough on-disk.
- **Wait until Task 02b to absorb this brief.** Rejected — the brief surfaced an unresolved question (`view`-only blocker for `TrustStakeCapEnforcer`) and a discrepancy with the canonical MetaMask interface signature. Absorbing now corrected the rule in `.claude/rules/metamask-delegation.md` and unblocked the design.

## Consequences

**Positive:**
- Task 02b starts with a working reference implementation, an audit-derived checklist, and concrete enforcer specs (terms encoding, state shape, validation order, test list).
- The `view`-only blocker in `TrustStakeCapEnforcer` design is resolved.
- The interface signature in `.claude/rules/metamask-delegation.md` can be corrected to the current 4-hook version.
- Foundry test density target is set (15-20 tests per enforcer minimum, mirroring Bear Trap's 40+ across multiple enforcers).

**Negative:**
- The Bear Trap brief contains some details that are out of date (the 2-hook signature). The annotation at the top warns about this, but a reader who skips the warning could regress. Mitigation: the rule file in `.claude/rules/metamask-delegation.md` shows the correct signature, and the `contract-reviewer` agent will reject an enforcer that uses the obsolete one.
- One more document to keep in the read order for Task 02b. Mitigation: `CLAUDE.md` routing table is updated to list it for that task only.

**Neutral (worth knowing):**
- Bear Trap was deployed on Base; ARP deploys on Intuition Testnet. The MetaMask `DelegationManager` contract address may differ — must be verified against MetaMask docs before deploying ARP enforcers. The Bear Trap brief flags this explicitly.
- Bear Trap uses Web3Auth in its UI; ARP uses MetaMask Smart Accounts SDK directly. The UI patterns from Bear Trap's frontend are not transferable; the on-chain patterns are.

## References

- Vendored brief: `docs/06_BEAR_TRAP_REFERENCE.md`
- Upstream repo: https://github.com/osobot-ai/bear-trap
- Related ADR: `0002-hackathon-pivot-metamask-cookoff.md` (where Task 02b is defined)
- Related ADR: `0003-metamask-skills-vendored-locally.md` (where the authoritative interface source was vendored)
- Updated rule: `.claude/rules/metamask-delegation.md` (interface signature corrected, view-only escalation removed)
- Router: `CLAUDE.md` (Task 02b read order updated)
