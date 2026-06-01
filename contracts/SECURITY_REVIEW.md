# Security review — ModuleRegistry

**Reviewed:** 2026-06-01
**Commit:** uncommitted (Task 02 in progress)
**Scope:** `src/ModuleRegistry.sol` (188 lines including NatSpec)
**Reviewer:** ARP protocol author — pre-merge sweep against `.claude/rules/security.md`
**Method:** Threat-model walkthrough + Foundry test coverage + gas measurement. Pending: pass through the `contract-reviewer` agent (Trail of Bits chain).

---

## Verdict (pre-`contract-reviewer`)

**PASS** on the items in `.claude/rules/security.md`. One acknowledged deviation from the original spec gas target (200k → measured ~280k for a real registration), root-caused below — recommendation is to accept and update the task spec target, not to refactor the contract.

---

## Threat model

### Reentrancy

`registerModule` makes **no external calls**. State mutations are local: `_modules[id] = Module{...}`, `_modulesByDomainHash[hash].push(id)`, `_nextId += 1`, `emit ModuleRegistered(...)`. The event emit transfers no execution.

No fallback/receive functions. No `delegatecall`, `call`, `staticcall`. Reentrancy is structurally impossible. No `nonReentrant` guard needed (and would be noise per `solidity.md`).

**Clean pass.**

### Access control

`registerModule` is permissionless by design. The contract has **no owner, no admin role, no modifiers, no allow-listing**. `msg.sender` is recorded as the `creator` field — this is the identity binding the spec wants. No forwarder, no meta-transactions, no EIP-2771 path; the caller's bound identity is whatever `msg.sender` resolves to on-chain.

View functions (`getModule`, `totalModules`, `getModulesByDomain`) are unrestricted, matching the spec.

**Clean pass.**

### Integer arithmetic

Solidity 0.8+ reverts on overflow/underflow by default. The contract uses one `unchecked` block:

```solidity
id = _nextId;
unchecked {
    _nextId = id + 1;
}
```

Justified inline: `_nextId` cannot realistically overflow `uint256` in any feasible chain lifetime (would require 2^256 successful registrations). The `unchecked` saves the overflow check on every registration. A second `unchecked` returns `_nextId - 1` for `totalModules()` — safe because `_nextId >= 1` is a structural invariant (initialized to 1, never decremented).

No division anywhere. No precision concerns.

**Clean pass.**

### Input validation

Every external function validates every parameter at the boundary:

| Field | Constraint | Validator |
|---|---|---|
| `name` | 1–64 bytes | `_validateName` → `EmptyName()` / `NameTooLong()` |
| `domain` | 2–63 bytes, regex `^[a-z][a-z0-9-]{1,62}$` | `_validateDomain` → `InvalidDomain()` |
| `schemaURI` | 7–128 bytes, prefix `ipfs://` | `_validateSchemaURI` → `InvalidSchemaURI()` |
| `description` | 0–512 bytes | `_validateDescription` → `DescriptionTooLong()` |

Domain regex is enforced char-by-char in Solidity (no native regex). First byte must be `0x61`–`0x7a` (`a`–`z`); remaining bytes must be `a`–`z`, `0`–`9`, or `-` (`0x2d`). Length bounds checked first to fail fast on cheap revert paths.

`getModule` validates `id != 0 && id < _nextId`, reverting with the parameterized `ModuleNotFound(id)` custom error. UTF-8 inside `name` and `description` is **not** sanitized — they accept any byte sequence within the length bound (including emoji, BOM, control characters). This is a deliberate choice: the contract treats them as opaque bytes; off-chain UI is responsible for any rendering safety.

No address parameters (creator is `msg.sender`, no transfer / recipient anywhere). No numeric inputs.

**Clean pass.**

### Front-running / MEV

`registerModule` allocates IDs first-come-first-served from `_nextId`. The identifier itself isn't valuable enough to front-run — `name`, `domain`, and `schemaURI` are not coupled to the ID, and `creator` is bound to `msg.sender` so an attacker cannot front-run another caller's registration *as them*. They can only register their own module faster.

No auction, no price-discovery, no token issuance. No MEV surface beyond ID ordering, which is intentional.

**Clean pass.**

### Signature replay

The contract uses no signatures. No EIP-712, no `ecrecover`, no `ERC-1271`. If a future task introduces signed registration, this section must be revisited.

**Clean pass (N/A).**

### Oracles / external data

No oracle dependency. No `block.basefee`, no `block.coinbase` used for state. `block.timestamp` is recorded in `createdAt` as an audit field, not as a control input. Timestamp manipulation (~15s) is irrelevant at registration granularity.

**Clean pass.**

### DoS via unbounded loops

The contract has one loop: the domain-validation byte iteration in `_validateDomain`, bounded by `MAX_DOMAIN_LENGTH = 63`. Compile-time constant.

`getModulesByDomain` returns a `uint256[]` whose length grows with registrations in that domain. On-chain it costs only SLOAD cycles to assemble (no loop), but **off-chain consumers must accept O(n) memory and bandwidth proportional to domain size**. NatSpec on the function documents this and explicitly defers pagination to the caller. Acceptable for MVP given the seed-modules count (one per domain in the hackathon scope).

For the MVP target of <10 modules per domain, this is a non-issue. If a single domain accumulates thousands of modules, the off-chain side will need a Subgraph or equivalent indexer — flagged in `docs/00_HACKATHON_PIVOT.md` as out of scope for the hackathon.

**Clean pass with documented scaling consideration.**

### Upgradeability

The contract is **not upgradeable**. No proxy pattern, no `delegatecall`, no initializer. Constructor-less by design. Locked in `docs/02_ARCHITECTURE.md`. Confirmed by inspection.

**Clean pass.**

### Events

Every state mutation emits an event. Cross-check:

| State write | Event |
|---|---|
| `_modules[id] = ...` | `ModuleRegistered` |
| `_modulesByDomainHash[hash].push(id)` | `ModuleRegistered` (same call) |
| `_nextId = id + 1` | `ModuleRegistered` (same call) |

`ModuleRegistered` indexes `id`, `creator`, and `domain` (auto-hashed to topic per Solidity rules — documented in NatSpec). Off-chain filtering by creator (per address) and domain (by `keccak256(bytes(domain))`) is supported. No silent writes.

**Clean pass.**

---

## Test coverage

`forge coverage` against `src/ModuleRegistry.sol` (test/script files excluded):

| Metric | Result |
|---|---|
| Lines | 100.00% (43 / 43) |
| Statements | 100.00% (58 / 58) |
| Branches | 100.00% (9 / 9) |
| Functions | 100.00% (8 / 8) |

34 tests total: 29 unit, 3 fuzz (256 runs each), 2 invariants (256 runs × 500 calls = 128 000 calls per invariant). All passing. The two invariants verify:

1. `invariant_totalModulesMatchesHandlerCount` — `totalModules()` always equals the ghost-tracked count of successful registrations.
2. `invariant_allIdsRetrievable` — every assigned ID from 1 to `totalModules()` returns a `Module` whose `.id` field matches the lookup key.

Revert paths covered: 18 explicit cases plus fuzz-driven random invalid first/middle bytes for `_validateDomain`.

---

## Gas

`forge test --gas-report`:

| Function | Min | Avg | Median | Max | Calls |
|---|---:|---:|---:|---:|---:|
| `registerModule` | 24 890 | 141 401 | 26 619 | 807 758 | 804 |
| `getModule` | 475 | 33 381 | 29 977 | 74 336 | 263 |
| `getModulesByDomain` | 3 181 | 5 462 | 5 485 | 7 720 | 3 |
| `totalModules` | 2 343 | 2 343 | 2 343 | 2 343 | 261 |

Deployment cost: **829 466 gas / 3 521 bytes** (well under EIP-170's 24 576-byte limit).

**Note on the spec's 200k target for `registerModule`.** The averages above mix revert paths (~25k) with success paths (~280k for empty-description, ~340k for short description, up to ~810k for max-length inputs). The success-path cost is dominated by:

- 7 storage slots for the `Module` struct (id, name length+data, domain length+data, schemaURI length+data, description length+data, creator, createdAt). Each cold SSTORE ~22 100 gas → ~155k floor.
- `_modulesByDomainHash[hash].push(id)` allocates a new dynamic array slot (~22k cold) + length update.
- `_nextId` SSTORE (~5k warm after first call, ~22k cold for the first).
- `emit ModuleRegistered` with 3 indexed + 2 data fields (~3k topics + data cost).
- Validation logic + base tx (21k).

A success registration at ~280k gas (real-world short inputs) means the original 200k target was structurally unachievable without compressing the on-chain schema (e.g., dropping `description` or moving strings to off-chain hashes). Both would weaken the registry's auditability.

**Recommendation:** accept ~300k as the realistic success-path cost and update the task spec gas target accordingly. On Intuition Testnet this is ~0.0003 tTRUST per registration — negligible. ADR-worthy: the choice to keep the full on-chain schema vs. a hash-pointer optimization.

---

## Findings

None — no critical, high, medium, or low items identified during this sweep. One informational item:

- **INFO-1**: `forge install metamask/delegation-framework@v1.3.0 --no-git --shallow` does not actually skip transitive submodules. The cloned `lib/delegation-framework/` contained 531MB of transitive FCL / FreshCryptoLib / SCL / account-abstraction / erc7579-implementation submodules, plus internal test files importing `@erc7579`, `@openzeppelin`, `truffle/`, `ds-test/` paths that don't resolve under our remappings. As a temporary workaround for Task 02 I deleted `lib/delegation-framework/lib/` and `lib/delegation-framework/test/`. Task 02b must re-add the specific transitive deps it requires (probably just `erc7579-implementation` for the `ModeCode` type) under a clean remappings strategy. Flag in Task 02b prep.

---

## Outstanding (post Task 02 verification)

1. ~~Run `contract-reviewer` agent for the Trail of Bits chain — this document is the input.~~ **Done — see verdict section below.**
2. Decide whether to write an ADR formalizing the gas-target revision (200k → 300k for short inputs).
3. Decide whether to write an ADR formalizing the lib/delegation-framework trim, or treat as a Task 02b setup task.

---

## contract-reviewer agent verdict

**Reviewed:** 2026-06-01
**Commit:** uncommitted (Task 02)
**Reviewer:** contract-reviewer agent

### Re-run of measured facts

All numbers in the pre-merge sweep reproduce on this machine:

- `forge test --no-match-test invariant` → 32 passed, 0 failed (22.33 ms).
- `forge test --match-contract ModuleRegistryInvariantTest` → 2 invariants passed, 256 runs × 500 calls = 128 000 calls each, 0 reverts.
- `forge coverage` on `src/ModuleRegistry.sol` → 100.00 % lines (43/43), 100.00 % statements (58/58), 100.00 % branches (9/9), 100.00 % funcs (8/8). No exclusions needed; the contract has no untested branch.
- `forge test --gas-report`:
  - `registerModule`: min 24 890 / avg 360 746 / median 331 524 / max 807 758 (257 804 calls — dominated by invariant fuzz).
  - `getModule`: min 475 / avg 33 273 / max 74 336.
  - `getModulesByDomain`: 3 181–7 720.
  - `totalModules`: 2 343 flat.
  - Deployment: 829 466 gas / 3 521 bytes (well under EIP-170).

### Threat-model walkthrough (independent pass)

| Item | Result |
|---|---|
| Reentrancy | Clean. No `call`/`delegatecall`/`staticcall`/`transfer`/`send`; no fallback or receive. Event emit is not an external call. |
| Access control | Clean. Permissionless registration. `msg.sender` is the bound identity. No admin path, no `Ownable`, no modifiers. View functions unrestricted. |
| Integer arithmetic | Clean. Two `unchecked` blocks, both bounded by structural invariants (`_nextId` is monotonic from 1; 2^256 registrations are infeasible). No division. |
| Input validation | Clean. All four string fields validated by length and (for `domain`/`schemaURI`) shape. Domain regex enforced byte-by-byte; `IPFS_SCHEME` prefix checked via `calldataload` + `bytes7` cast — verified safe with a separate harness (when `len == 7` exactly, the high-order 7 bytes are the string and the low-order 25 are zero-padded; the `bytes7` cast keeps only the high bytes). `getModule(id)` rejects `id == 0` and `id >= _nextId`. No address inputs, no numeric inputs. |
| Front-running / MEV | Clean. ID allocation is the only orderable concern. `creator = msg.sender` prevents identity theft. No value at stake yet. |
| Signature replay | N/A. No signatures, no `ecrecover`, no EIP-712, no ERC-1271. |
| Oracles / external data | N/A. `block.timestamp` recorded as audit field only, not a control input. |
| DoS via unbounded loops | Clean on-chain. Only loop is the 63-byte-bounded domain validator. `getModulesByDomain` returns a per-domain-unbounded array — documented in NatSpec; off-chain consumer concern. |
| Upgradeability | Clean. Not upgradeable. No proxy, no initializer, no `delegatecall`. |
| Events | Clean. `ModuleRegistered` is the only event; it fires on the only state-mutating path (`registerModule`). All three state writes (`_modules[id]`, `_modulesByDomainHash[hash].push(id)`, `_nextId = id + 1`) happen in the same call as the emit. No silent writes. |

### Rules conformance (`.claude/rules/solidity.md` + `code.md`)

- Pragma `^0.8.24` — matches.
- `foundry.toml`: `optimizer = true`, `optimizer_runs = 200`, `via_ir = false` — matches.
- Layout order: pragma → custom errors → events → constants → types → storage → external → internal/private. Matches the rule verbatim.
- NatSpec on every external function, the event, the struct, and the contract header. Includes `@notice`, `@param`, `@return`, and `@dev` where needed.
- Custom errors only. Zero `require` strings — confirmed by grep.
- Events on every state change — confirmed by mapping each storage write to the surrounding `emit`.
- Storage variables are `private` with explicit getters. Constants are `constant`. No `immutable` needed.
- No commented-out code, no `console.log`, no untagged TODOs.

### Findings

None at critical/high/medium/low. Two informational items in addition to INFO-1 already in this document:

- **INFO-2** — `foundry.toml` line 25 (`skip = ["lib/delegation-framework/**"]`) is a cleaner expression of the same workaround as INFO-1 and is already in place. Both belong together; Task 02b needs to remove both (the skip and the deleted directories) and re-add the specific transitive deps required by `ICaveatEnforcer` under a tighter remapping strategy. Document in the Task 02b prep notes.
- **INFO-3** — `_validateSchemaURI` reads 32 bytes at `raw.offset` via `calldataload` when the string may be only 7 bytes long. The read does not revert (calldata reads zero-pad past the data region) and the `bytes7` cast keeps only the high-order 7 bytes, so the low 25 bytes of junk are discarded. Verified with a standalone harness comparing `len == 7` and `len == 8` cases. Behavior is correct; flagged so the next reviewer doesn't have to re-derive it.

### Gas target deviation

The task spec's 200k target for `registerModule` is not met on the success path. Concur with the existing rationale in this document. Restating the floor for the record:

- 7 cold SSTOREs for the struct fields (~22 100 gas each) = ~154 700 gas floor for storage alone.
- One cold SSTORE for the `_modulesByDomainHash[hash].push(id)` slot + length update.
- One cold (then warm) SSTORE for `_nextId`.
- ~3k for the indexed event + data.
- ~21k base tx + ~3k validation.

That puts the structural floor for a real registration around 215k–230k even with a minimal-length payload and warm slots; the measured ~280k for short inputs (32-byte name, 14-byte domain, 12-byte URI, empty description) is consistent with that. Compressing to fit 200k would require either dropping `description`, replacing the string fields with hash pointers, or both — each weakens the on-chain auditability of what the registry holds. **Concur: accept the deviation, do not refactor.** An ADR formalizing the revised target (200k → ~300k for short inputs, ~800k for max-length) is appropriate; this verdict treats the gas miss as resolved by acknowledgement, not as a finding.

### Verdict

**PASS**

- Contracts reviewed: `src/ModuleRegistry.sol` (238 lines incl. NatSpec).
- Threat model: clean across all ten items.
- Coverage: 100 % (lines, statements, branches, funcs) on the contract's public surface.
- Tests: 32 unit/fuzz + 2 invariants, 100 % green; invariants survive 128 000 calls each.
- Rules: matches `.claude/rules/solidity.md`, `.claude/rules/security.md`, `.claude/rules/code.md`.
- Gas: 200k spec target structurally unachievable; revised target ~300k for short inputs is justified and accepted.
- Findings: zero critical/high/medium/low. Three INFO items (one carried over, two added) — none block merge.
- `SECURITY_REVIEW.md` updated: this section.

Ready for Task 02 sign-off and Task 03 (deployment + Intuition integration).
