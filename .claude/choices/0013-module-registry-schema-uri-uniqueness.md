# 0013 — ModuleRegistry enforces schemaURI uniqueness

**Status:** Accepted
**Date:** 2026-06-03
**Triggered by:** First end-to-end run of `scripts/agent-loop.ts` revealed duplicate Slither / Mythril records (ids #3, #5, #7, #9, #11 …) appearing in the marketplace home page on every loop invocation.

## Context

The first `ModuleRegistry.registerModule` implementation had four input validations (name, domain, schemaURI, description) but **no uniqueness constraint**. Every call incremented `_nextId` and stored a new record, even when (name, domain, schemaURI, description) were identical to an existing one.

The agent loop runs the manifest each invocation. Without an on-chain duplicate guard:

1. The loop's "already exists" branch (catching the publish revert) never fired because publish *never* reverted on duplicates.
2. Every run inflated the registry with copies of the same modules.
3. The home page UI showed `Slither` four times after four runs — visually broken and conceptually wrong for a marketplace.

The off-chain agent loop could have done a pre-check (read `totalModules()`, scan, dedup), but that:

- Burns extra RPC every loop iteration.
- Doesn't protect the registry from other callers — anyone could still flood it with duplicates.
- Means the contract has no useful invariant for off-chain readers (a marketplace map of tools, queried by `schemaURI`, becomes ambiguous).

ADR 0008 already establishes that **`schemaURI` is the canonical tool identifier** — a single IPFS URI maps to a single conceptual tool, and downstream the same URI is used to derive the tool's Intuition atom id. The registry must reflect that: one `schemaURI` ⇔ one module record.

The repo has no users yet; a redeploy is cheap.

## Decision

Add a `schemaURI` uniqueness constraint to `ModuleRegistry.registerModule`:

```solidity
mapping(bytes32 schemaURIHash => uint256 id) private _moduleBySchemaURIHash;

error ModuleAlreadyRegistered(uint256 existingId);

function registerModule(
    string calldata name,
    string calldata domain,
    string calldata schemaURI,
    string calldata description
) external returns (uint256 id) {
    _validateName(name);
    _validateDomain(domain);
    _validateSchemaURI(schemaURI);
    _validateDescription(description);

    bytes32 uriHash = keccak256(bytes(schemaURI));
    uint256 existing = _moduleBySchemaURIHash[uriHash];
    if (existing != 0) revert ModuleAlreadyRegistered(existing);

    // ... write _modules[id], push to _modulesByDomainHash, record _moduleBySchemaURIHash[uriHash] = id
}

function getModuleIdBySchemaURI(string calldata schemaURI) external view returns (uint256) {
    return _moduleBySchemaURIHash[keccak256(bytes(schemaURI))];
}
```

Redeploy the registry (no users impacted), update `deployments/13579.json`, and update `scripts/agent-loop.ts` to call `getModuleIdBySchemaURI` *before* attempting `redeemRegisterModule`. The off-chain check saves the gas of a known-to-revert tx; the on-chain check guarantees the invariant even if a future caller skips the off-chain step.

## Alternatives considered

- **Off-chain dedup only** — agent-loop reads `totalModules()`, iterates `getModule(i)`, matches `schemaURI`. Rejected: O(n) per check, doesn't protect the registry from any other off-chain caller, marketplace ambiguity persists.
- **Uniqueness on `(name, domain)` instead of `schemaURI`** — too soft. Two different creators could mint the same `Slither` name in `solidity-audit` if they don't coordinate. `schemaURI` is content-addressed (IPFS CID), which makes "same URI = same tool" a real invariant, not a naming convention.
- **Uniqueness on `(name, domain, schemaURI)` triple** — pointless. If two records have the same `schemaURI` but different names, both reference the same content (same JSON Schema) under different aliases; that's still a duplicate from the marketplace's perspective.
- **Keep the contract, fix the loop only** — would have left the registry vulnerable to any future flood. The on-chain enforcement also makes the marketplace narrative defensible: a tool registers exactly once, ever.

## Consequences

**Positive:**
- The home page UI shows one row per tool, period. No defensive dedup in the UI layer.
- `getModuleIdBySchemaURI` provides O(1) lookup by canonical URI — useful for both the agent runtime and the UI (e.g. a future `/tool/by-uri/:uri` route).
- The registry invariant holds for any future caller, not just the ARP-controlled agent loop.
- Off-chain agent loop can short-circuit before sending a doomed tx.

**Negative:**
- One mapping slot per registration. Marginal storage cost.
- Redeploy required; the previous registry address becomes orphan. Existing module ids on that old contract become unreachable via the UI (which now points at the new address). For ARP today this is zero-impact (no real users). Atom ids on Intuition are unaffected because they are derived from `schemaURI` content, not from registry state.

**Neutral (worth knowing):**
- Module records are still append-only (no update / delete). Uniqueness is the only new invariant.
- The `_modulesByDomainHash` mapping continues to grow per domain; ADR 0007's gas-budget note still applies for that list, but the per-URI map is set-once and never read in `registerModule`'s write path (just a sload + revert).

## References

- Related rule: `.claude/rules/solidity.md` (custom errors, events on every state change, NatSpec discipline)
- Related ADR: `.claude/choices/0008-arp-module-uri-coupling-via-intuition-pinning.md` (schemaURI as canonical tool URI)
- Related ADR: `.claude/choices/0010-scope-reanchor-two-layer-reputation-and-track-selection.md` (the marketplace narrative this constraint serves)
- Related code:
  - `contracts/src/ModuleRegistry.sol` (the constraint + getter)
  - `contracts/test/ModuleRegistry.t.sol` (5 new tests: revert on dup, revert on dup-same-creator, getter zero-before / id-after / unknown-URI, multi-domain non-blocking)
  - `app/src/lib/abi/module-registry.ts` (getter added)
  - `scripts/agent-loop.ts` (off-chain pre-check)
- Triggered by: `.claude/learning/07-agent-autonomous-positioning.md` (the post-04c run that surfaced the duplicates)
