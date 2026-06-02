# 0007 — `ModuleRegistry.registerModule` gas target revised from <200k to ~300k

**Status:** Accepted
**Date:** 2026-06-01
**Triggered by:** Task 02 execution — measured `registerModule` cost consistently lands at 280–340 k for short real inputs and up to ~810 k for max-length inputs. Original spec at `tasks/02-contract-mvp.md` said `registerModule < 200k gas`. Both my pre-merge sweep (`contracts/SECURITY_REVIEW.md`) and the `contract-reviewer` agent's independent walkthrough recommended accepting the deviation rather than refactoring. User concurred.

## Context

The Task 02 spec set `registerModule` < 200 000 gas as a target. Measured numbers from `forge test --gas-report` over 804 calls:

| Function | Min | Avg | Median | Max |
|---|---:|---:|---:|---:|
| `registerModule` | 24 890 | 141 401 | 26 619 | 807 758 |

The wide spread is because most fuzz iterations hit cheap revert paths (~25 k). Filtering to **success cases**:

- Empty `description`, short other strings: ~280 k
- 38-byte `description`, short other strings: ~340 k
- Max-length inputs across all fields: ~810 k

Structural floor analysis (cold storage + minimum tx overhead):

| Cost | Gas |
|---|---:|
| Base tx | 21 000 |
| Validation logic (4 string scans, length checks) | ~5–8 k |
| `Module` struct → 7 cold SSTOREs (id, name length+data, domain length+data, schemaURI length+data, description length+data, creator, createdAt) | ~155 000 |
| `_modulesByDomainHash[hash].push(id)` → 1 cold SSTORE | ~22 000 |
| `_nextId` SSTORE | ~22 000 (cold) / ~5 000 (warm) |
| `ModuleRegistered` event (3 indexed + 2 data) | ~3 000 |
| **Floor** | **~228 k** |

200 k is unachievable on the success path without one of:

1. **Drop the `description` field from the struct** — eliminates one variable-length SSTORE, saves ~22 k + per-chunk costs. Brings empty-description case below 250 k. Weakens off-chain UI because descriptions are user-facing.
2. **Move all strings off-chain, store only a content hash** — collapses to 3 fixed SSTOREs + hash. Easily fits under 100 k. Loses on-chain auditability of the registry (cannot recover the module's name/domain/schemaURI from a chain replay; must trust an off-chain pinner).
3. **Pack `id` + `createdAt` into a single 256-bit slot** using `uint128` each — saves 1 SSTORE (~22 k). Useful but doesn't get to 200 k alone. Caps id space at 2^128 which is fine.

Trades off:

- **Drop description**: rejected. The MVP demo wants creators to ship a short rationale alongside the schema; description is the only freeform field. Killing it for 60 k of gas savings degrades the user-visible product.
- **Hash-pointer strings**: rejected. The on-chain registry is the "trustless directory of attestation types" — that property requires the full metadata to be on-chain. Pushing to IPFS-only would mean the registry stops being self-describing; an indexer would have to fetch IPFS to display anything.
- **Pack id/createdAt**: not pursued for Task 02. Saves ~22 k for a structural refactor that affects the public ABI (`Module.id` and `Module.createdAt` become `uint128`). If a future task needs a registration path under 250 k, revisit then.

## Decision

The realistic success-path gas target for `registerModule` is **~300 000 gas** for typical inputs (short name, short domain, ~50-byte schemaURI, optional short description), with worst-case **~810 000 gas** for maximum-length inputs across all fields.

The original 200 k target is dropped. The task spec (`tasks/02-contract-mvp.md`) and the rules-level gas guidance in `.claude/rules/solidity.md` referring to a 200 k goal for `registerModule` should be read in light of this ADR. No code change. No follow-up task.

The behavior of the contract is unchanged.

## Alternatives considered

- **Refactor to fit 200 k by dropping `description`.** Rejected — degrades user-visible registry.
- **Refactor to fit 200 k by moving strings to hash pointers.** Rejected — breaks the on-chain "self-describing directory" property.
- **Pack id + createdAt into one slot.** Deferred — useful general optimization but not pursued for Task 02 since it doesn't reach 200 k on its own and changes the public ABI.
- **Leave the target at 200 k as aspirational, accept the deviation only in commentary.** Rejected — a target that ships consistently failing is worse than no target. An ADR records the real number so future tasks (deploy cost estimation, agent cost analysis) plan against reality.

## Consequences

**Positive:**
- Honest target. Future deploy cost estimates and agent-affordance analysis use the real number, not a fantasy 200 k.
- On-chain self-description preserved — the registry remains a complete record without an IPFS dependency.

**Negative:**
- ~$0.06 cost per registration at 100 gwei mainnet. Negligible on Intuition Testnet (~0.0003 tTRUST). If ARP ever needs mainnet deployment with high-volume registration, this is a meaningful per-unit cost. Out of scope for the hackathon — flagged for future ADR if/when the conversation happens.

**Neutral (worth knowing):**
- The `Module` struct shape is now load-bearing for this target. Any future addition of a field (e.g., `bytes32 schemaContentHash`) shifts the floor up. Adding fields should reference this ADR.
- Future enforcers in Task 02b need to be lightweight enough that the user's full delegation redemption (DelegationManager + enforcer chain + execution) stays within a sensible UX gas window. We have ~300 k budget for the staking execution itself; enforcers should add < 50 k each to stay below 500 k total per redemption. Worth measuring against this target during Task 02b.

## References

- Spec being revised: `tasks/02-contract-mvp.md` (gas targets section + report format)
- Measurement source: `contracts/SECURITY_REVIEW.md` (Gas section + `contract-reviewer` verdict)
- Rule referencing 200 k: `.claude/rules/solidity.md` (Gas section — generic guidance, not contract-specific; no edit needed)
- Related: `.claude/learning/02-contract-mvp.md` (post-mortem)
