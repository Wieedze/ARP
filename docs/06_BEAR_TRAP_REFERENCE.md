# Bear Trap supplementary brief — for ARP Caveat Enforcers (Task 02b)

> **Role of this document (added 2026-05-19, post-clarification)**: this is a **supplementary** real-world example, not the canonical reference. The canonical reference for ARP enforcers is **MetaMask**, via the vendored skill at `.claude/skills/mms-smart-accounts-kit/references/delegations.md` and the official docs at https://docs.metamask.io/smart-accounts-kit/. Bear Trap is one production deployment that happens to ship a custom `ICaveatEnforcer`, an audit, and 40+ tests — useful as a worked example for patterns and test density. Where Bear Trap and MetaMask disagree, MetaMask wins. See ADR `0004-bear-trap-as-enforcer-reference.md` for the role assignment.

**Bear Trap repo**: https://github.com/osobot-ai/bear-trap

**How to use this document**:
1. Read the canonical MetaMask references first (vendored skill + official docs).
2. Then read this brief for what Bear Trap teaches that MetaMask docs don't — code structure, test density, security checklist items, real-world anti-patterns.
3. Then implement ARP enforcers, following MetaMask for interface/API and Bear Trap for patterns.

> **Interface authority caveat**: where this brief disagrees with `.claude/skills/mms-smart-accounts-kit/references/delegations.md` on the `ICaveatEnforcer` signature, the skill wins. Specifically: the current framework has **four hooks** (`beforeAllHook`, `beforeHook`, `afterHook`, `afterAllHook`) with parameter order `(_terms, _args, _mode, _executionCalldata, _delegationHash, _delegator, _redeemer)`. Use that signature, not the 2-hook version in section "The `ICaveatEnforcer` interface ARP enforcers must implement" below. The rest of Bear Trap (patterns, security checklist, test scaffolding, anti-patterns) remains accurate.

---

## Why Bear Trap is a high-quality reference

Bear Trap is an ERC-7710 puzzle game shipped to production on Base. It demonstrates:

- A custom caveat enforcer (`ZKPEnforcer.sol`) implementing `ICaveatEnforcer`
- Composition of custom enforcers with standard MetaMask enforcers
- EIP-712 delegation signing with correct domain separators
- Testnet/mainnet separation with mock contracts
- Production-quality Foundry test suite (40+ tests)
- A documented security audit
- Real on-chain deployment with verified contract addresses

The mechanism is reusable. The application (puzzle game, ZK proofs) is not. **Extract the mechanism, ignore the application.**

---

## What to read in the Bear Trap repository

Before writing any ARP enforcer code, read these files in this order:

### 1. Architecture overview

**File**: `README.md`
**URL**: https://github.com/osobot-ai/bear-trap/blob/main/README.md

What to extract:
- The delegation structure section showing how three caveat enforcers compose
- The "Key Design" section explaining how on-chain enforcement works
- The security section listing the 11 security guarantees their design enforces

### 2. Full architecture specification

**File**: `SPEC.md`
**URL**: https://github.com/osobot-ai/bear-trap/blob/main/SPEC.md

What to extract:
- Detailed flow diagrams of how delegation, caveat enforcement, and redemption interact
- The exact data flow through the system
- How the `terms` and `execution` parameters get encoded and decoded

### 3. The custom enforcer contract

**File**: `contracts/src/ZKPEnforcer.sol`
**URL**: https://github.com/osobot-ai/bear-trap/blob/main/contracts/src/ZKPEnforcer.sol

This is the template for ARP's enforcers. Study:
- The contract structure (imports, inheritance, state variables)
- How `beforeHook` is implemented
- How `terms` is decoded
- How `execution` is decoded
- How errors are emitted (custom errors with revert)
- How execution modes are guarded (`onlySingleCallTypeMode`, `onlyDefaultExecutionMode`)
- NatSpec patterns

You will replace ZK proof validation logic with ARP-specific validation, but the structural patterns are identical.

### 4. The interface they implement

**File**: `contracts/src/IBearTrap.sol`
**URL**: https://github.com/osobot-ai/bear-trap/blob/main/contracts/src/IBearTrap.sol

Bear Trap also defines its own interface for events and errors. For ARP, you'll do the same — define `IDomainScopeEnforcer` and `ITrustStakeCapEnforcer` interfaces separately from the implementations.

### 5. The test suite

**File**: `contracts/test/BearTrap.t.sol`
**URL**: https://github.com/osobot-ai/bear-trap/blob/main/contracts/test/BearTrap.t.sol

What to extract:
- How they set up Foundry test fixtures for enforcer tests
- How they construct valid and invalid `terms` and `execution` parameters
- How they test revert paths with the correct custom error
- How they test composition with other enforcers
- The naming conventions for test functions

Their 40 tests are a masterclass. Match this density for ARP enforcers.

### 6. The deployment script

**File**: `contracts/scripts/Deploy.s.sol`
**URL**: https://github.com/osobot-ai/bear-trap/blob/main/contracts/scripts/Deploy.s.sol

What to extract:
- Foundry deployment script patterns
- How they handle environment variables for deployment
- How they wire up the enforcer with the DelegationManager
- Idempotency patterns

### 7. The audit report

**File**: `AUDIT-REPORT.md`
**URL**: https://github.com/osobot-ai/bear-trap/blob/main/AUDIT-REPORT.md

What to extract:
- Categories of vulnerabilities they considered
- Mitigations they applied
- Open issues they accepted with justification

Use this as a checklist when running your own Trail of Bits-style review on ARP enforcers.

### 8. Admin CLI for delegation signing

**File**: `backend/admin/src/main.rs`
**URL**: https://github.com/osobot-ai/bear-trap/blob/main/backend/admin/src/main.rs

This is in Rust, but the pattern is what matters:
- How they construct the EIP-712 typed data
- The exact domain separator they use (`name="DelegationManager"`, `version="1"`, `chainId`, `verifyingContract`)
- The structure of the delegation object before signing

For ARP, the equivalent will be a TypeScript helper in `app/src/lib/delegation.ts` doing the same EIP-712 signing via viem.

---

## Known constants from Bear Trap to reuse

These values from Bear Trap apply to ARP without modification:

| Element | Value | Notes |
|---|---|---|
| `ANY_DELEGATE` sentinel | `0x0000000000000000000000000000000000000a11` | For open delegations. ARP probably wants a specific delegate (the agent's Smart Account), not this. |
| `ROOT_AUTHORITY` sentinel | `0xfff...fff` | Used as the authority field for top-level delegations. ARP will use this for the user → agent delegation. |
| EIP-712 domain name | `"DelegationManager"` | Constant string. Required for signature verification. |
| EIP-712 domain version | `"1"` | Constant string. |
| MetaMask DelegationManager on Base | `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3` | **Verify this address on Intuition Testnet before using.** Likely the same, but confirm via MetaMask docs. |

**Action required for Claude Code**: Before writing the delegation signing code, query the official MetaMask Smart Accounts Kit documentation at https://docs.metamask.io/smart-accounts-kit/ to confirm the DelegationManager contract address on Intuition Testnet. Bear Trap uses Base, ARP uses Intuition.

---

## The `ICaveatEnforcer` interface ARP enforcers must implement

> **STALE** as of 2026-05-19 — see the authority caveat at the top of this document. The current framework interface, as documented in `.claude/skills/mms-smart-accounts-kit/references/delegations.md`, has four hooks (`beforeAllHook`, `beforeHook`, `afterHook`, `afterAllHook`), each with the parameter order `(_terms, _args, _mode, _executionCalldata, _delegationHash, _delegator, _redeemer)`. Use that signature. The version below is preserved for historical reference only.

Based on the MetaMask Delegation Framework standard that Bear Trap uses:

```solidity
interface ICaveatEnforcer {
    function beforeHook(
        bytes calldata terms,
        bytes calldata execution,
        ModeCode mode,
        bytes calldata args,
        bytes32 delegationHash,
        address delegator,
        address delegate
    ) external;

    function afterHook(
        bytes calldata terms,
        bytes calldata execution,
        ModeCode mode,
        bytes calldata args,
        bytes32 delegationHash,
        address delegator,
        address delegate
    ) external;
}
```

**Verify the exact signature** by inspecting `lib/delegation-framework` in the Bear Trap repo (it's pulled in as a Git submodule per their `.gitmodules` file). The signature has evolved across versions of the framework.

Both `beforeHook` and `afterHook` are typically implemented even if only one does real work. ARP enforcers will primarily use `beforeHook` to validate the action before it executes.

---

## Patterns to adopt directly in ARP enforcers

### Pattern 1: Custom errors with descriptive names

Bear Trap uses Solidity custom errors instead of `require` strings. Adopt this:

```solidity
error InvalidDomain(string declared, string allowed);
error StakeExceedsCap(uint256 attempted, uint256 cap);
error InvalidExecutionMode();
error TermsDecodingFailed();
```

Gas-efficient, type-safe, and clearer in tests.

### Pattern 2: Execution mode guards at the top of `beforeHook`

Bear Trap's `ZKPEnforcer` rejects batch and try execution modes:

```solidity
function beforeHook(...) external view {
    // First two checks: execution mode must be single + default
    if (!_isSingleCallTypeMode(mode)) revert InvalidExecutionMode();
    if (!_isDefaultExecutionMode(mode)) revert InvalidExecutionMode();

    // Then decode terms and execution
    // Then validate
}
```

ARP enforcers should do the same. Reject batch/try modes by default.

### Pattern 3: Decode `terms` and `execution` defensively

The `terms` parameter is encoded by the user at delegation time. The `execution` parameter is encoded by the agent at action time. Both should be decoded with `abi.decode` inside a try/catch or with explicit length checks.

For `DomainScopeEnforcer`:
- `terms` decodes to `(string[] allowedDomains)` or `(bytes32[] allowedDomainHashes)` for gas efficiency
- `execution` decodes to the action being attempted — likely a call to `ModuleRegistry` or to Intuition's staking — from which the target domain must be extracted

For `TrustStakeCapEnforcer`:
- `terms` decodes to `(uint256 capAmount, uint256 periodSeconds)` for a rolling-window cap
- `execution` decodes to the stake action — amount and target

The decoding logic is where most bugs hide. Test it heavily.

### Pattern 4: State tracking via mappings keyed by delegation hash

For `TrustStakeCapEnforcer`, you need to track cumulative stake per delegation per period. Bear Trap stores per-delegation state in mappings keyed by `delegationHash`:

```solidity
mapping(bytes32 delegationHash => uint256 cumulativeStake) private _cumulativeStake;
mapping(bytes32 delegationHash => uint256 windowStartTime) private _windowStart;
```

`delegationHash` is provided as a parameter to `beforeHook`, so the enforcer doesn't need to compute it itself. Use it directly.

### Pattern 5: Events for off-chain indexing

Bear Trap emits events on every enforcement decision. ARP enforcers should do the same:

```solidity
event DomainScopeChecked(bytes32 indexed delegationHash, string domain, bool allowed);
event StakeCapChecked(bytes32 indexed delegationHash, uint256 cumulativeAmount, uint256 cap);
```

This makes off-chain tooling (your indexer, your UI showing agent activity) trivial to build later.

### Pattern 6: Single-purpose enforcers

Each Bear Trap enforcer does one thing. Their `ZKPEnforcer` validates ZK proofs. `NativeTokenTransferAmountEnforcer` validates transfer amounts. `ExactCalldataEnforcer` validates calldata.

For ARP, follow the same discipline:
- `DomainScopeEnforcer` only validates domain scope. Nothing else.
- `TrustStakeCapEnforcer` only validates stake caps. Nothing else.

Resist the temptation to merge them into a single "ARPEnforcer". Composition is the whole point of the framework.

---

## Patterns to NOT copy from Bear Trap

Three things in Bear Trap are out of scope for ARP MVP:

### 1. RISC0 / Boundless ZK proof system

The entire `guests/` directory and the RISC0 toolchain are overkill for ARP enforcers. ARP enforcers validate simple on-chain conditions (domain match, cap check) — no ZK required. Skip:

- `guests/`
- `Cargo.toml` and `Cargo.lock`
- `rust-toolchain.toml`
- Any Boundless SDK dependencies
- The ZK proof verification logic in their enforcer

This is the single biggest dependency tree Bear Trap pulls in. Skipping it saves you days of setup.

### 2. The puzzle game application logic

Bear Trap's `BearTrap.sol` is the application contract for the puzzle game (ticket sales, puzzle lifecycle, prize transfer). ARP does not have an equivalent application contract — ARP has the `ModuleRegistry.sol` (already scoped in Task 02) and the enforcers (Task 02b). Don't try to write an "ARP.sol" contract that does too much.

### 3. The `ANY_DELEGATE` open delegation pattern

Bear Trap uses `delegate = 0x...0a11` to allow anyone to redeem. ARP wants the opposite: a specific delegate (the user's agent Smart Account address) that's the only entity allowed to act under the delegation. Set the delegate field to the agent's address explicitly.

### 4. Web3Auth modal

Bear Trap uses Web3Auth for wallet UX. ARP should use MetaMask's native Smart Accounts SDK directly. Skip the Web3Auth integration.

### 5. SQLite backend

Bear Trap has a Rust + axum + SQLite backend for puzzle data. ARP does not need a backend for the MVP — everything happens on-chain plus client-side reads from Intuition's graph. Don't build a backend.

---

## Concrete ARP enforcer specifications

Based on what we've extracted from Bear Trap, here's what each ARP enforcer should look like.

### `DomainScopeEnforcer.sol`

**Purpose**: Restrict the delegated agent to staking on tools whose registered domain is in the user-authorized list.

**`terms` encoding**:
```solidity
abi.encode(bytes32[] allowedDomainHashes)
```
Where each `bytes32` is `keccak256(bytes(domain))`. This avoids string comparisons on-chain (gas).

**`execution` decoding**:
The agent is calling `ModuleRegistry.registerTool(...)` or an Intuition staking method. The enforcer must extract the target tool's domain from the call and check it against the allowed list.

**Validation**:
1. Reject batch/try execution modes
2. Decode `terms` into the allowed domain hash array
3. Decode `execution` to identify the target tool
4. Look up the tool's domain (either from calldata directly, or by reading state from `ModuleRegistry`)
5. Compute `keccak256(bytes(domain))` and check membership in the allowed list
6. Revert with `DomainNotAllowed(targetDomain, allowedList)` if not allowed

**Tests required**:
- Allowed domain passes
- Disallowed domain reverts with correct error
- Empty allowed list reverts (no domains permitted)
- Batch mode reverts
- Try mode reverts
- Fuzz: random domains, random allowed lists
- Edge: domain string exactly matching another except for casing

### `TrustStakeCapEnforcer.sol`

**Purpose**: Cap the total TRUST amount the agent can stake within a rolling time window.

**`terms` encoding**:
```solidity
abi.encode(uint256 capAmount, uint256 periodSeconds)
```

**`execution` decoding**:
The agent is calling Intuition's staking method. The enforcer extracts the stake amount.

**State**:
```solidity
mapping(bytes32 delegationHash => uint256 cumulativeStake) private _cumulativeStake;
mapping(bytes32 delegationHash => uint256 windowStartTime) private _windowStart;
```

**Validation**:
1. Reject batch/try execution modes
2. Decode `terms` to get cap and period
3. Decode `execution` to get attempted stake amount
4. Check if the rolling window has expired; if so, reset cumulative for this delegation hash
5. Compute proposed cumulative = current cumulative + attempted stake
6. Revert with `StakeExceedsCap(proposedCumulative, cap)` if over the cap
7. Update state (cumulative and window start if reset)

**Tests required**:
- Stake under cap passes
- Stake at exact cap passes
- Stake over cap reverts
- Multiple stakes accumulating to cap
- Window expiration resets cumulative
- Batch mode reverts
- Try mode reverts
- Fuzz: random caps, random stake amounts, random timing

---

## Foundry test scaffolding to use

Both ARP enforcers should have a test file structure modeled on Bear Trap's `BearTrap.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DomainScopeEnforcer} from "../src/DomainScopeEnforcer.sol";

contract DomainScopeEnforcerTest is Test {
    DomainScopeEnforcer internal enforcer;
    address internal user = makeAddr("user");
    address internal agent = makeAddr("agent");

    function setUp() public {
        enforcer = new DomainScopeEnforcer();
    }

    // Test methods follow the pattern:
    // test_<scenario>_<expectedOutcome>

    function test_beforeHook_allowsValidDomain() public { ... }
    function test_beforeHook_rejectsInvalidDomain() public { ... }
    function test_beforeHook_rejectsBatchMode() public { ... }
    function testFuzz_beforeHook_acceptsValidInputs(bytes32 domainHash) public { ... }
    // etc.
}
```

Match Bear Trap's test density: 15-20 tests per enforcer minimum.

---

## Security checklist (synthesized from Bear Trap's audit + standard practices)

Run through this list before merging either enforcer:

- [ ] Reentrancy: enforcer makes no external calls during `beforeHook`/`afterHook`. View-only logic plus state writes for `TrustStakeCapEnforcer`.
- [ ] Access control: enforcer functions are public/external but only meaningful when called by `DelegationManager`. Document this clearly. Optionally add a check that `msg.sender == DELEGATION_MANAGER`.
- [ ] Integer overflow: Solidity 0.8+ reverts by default, but document any unchecked blocks.
- [ ] Replay attacks: `delegationHash` is unique per delegation, so per-delegation state tracking is replay-safe.
- [ ] Front-running: stake cap state updates happen before action execution, so front-running between two competing actions on the same delegation is handled by transaction ordering.
- [ ] Signature malleability: not applicable to enforcers directly; relevant only to delegation signing in the UI/admin layer.
- [ ] Execution mode confusion: explicitly reject batch and try modes.
- [ ] State pollution: state is scoped per `delegationHash`, so different delegations don't interfere.
- [ ] Gas limits: enforcer logic should fit within reasonable gas budget — well under 100k gas per call.
- [ ] Decoding failures: malformed `terms` or `execution` should revert with a descriptive error, not silently return false.
- [ ] Time manipulation: rolling window logic uses `block.timestamp`, which has known miner-manipulation tolerance of ~15 seconds. Document this limitation.

---

## Putting it together: the ARP delegation flow

Once both enforcers are deployed, here's the full ARP user-to-agent delegation flow that the UI in Task 04b must implement:

```
1. User creates MetaMask Smart Account for the agent
2. User configures delegation terms:
   - Allowed domains: ["solidity-audit"]  (for hackathon MVP)
   - Stake cap: 500 TRUST per 7 days
3. User signs EIP-712 typed delegation containing:
   - delegate: agent's Smart Account address
   - delegator: user's address
   - authority: ROOT_AUTHORITY (0xfff...fff)
   - caveats: [
       { enforcer: DomainScopeEnforcer, terms: encode(["solidity-audit"]) },
       { enforcer: TrustStakeCapEnforcer, terms: encode(500e18, 7 days) }
     ]
4. Signed delegation stored client-side (and optionally on-chain for permanence)
5. Agent operates: when staking, calls go through DelegationManager.redeemDelegations
   passing the signed delegation + the execution
6. DelegationManager invokes each enforcer's beforeHook
7. If all pass, the execution proceeds; otherwise the entire transaction reverts
```

This is the demo flow that must be visible in the Task 05b demo video.

---

## What you should NOT extract from this document

This document is reference material for Task 02b (enforcers) and Task 03b (Smart Account integration). It is **not**:

- A specification of ARP's overall architecture (see `docs/02_ARCHITECTURE.md`)
- An update to the hackathon scope (see `docs/00_HACKATHON_PIVOT.md`)
- A replacement for reading the Bear Trap source code directly

You must still read the Bear Trap files listed above before implementing. This document tells you what to look for; the Bear Trap repo shows you how to do it.

---

## When to escalate to the user

Stop and ask before proceeding if:

- The MetaMask DelegationManager address on Intuition Testnet cannot be confirmed
- The `ICaveatEnforcer` interface signature in the live MetaMask Delegation Framework differs from what's documented here
- A pattern in Bear Trap seems incorrect or outdated compared to current MetaMask docs
- The Intuition staking method signature is unclear (which Intuition function the agent will actually call)
- Any decision about delegation structure (delegate, authority, salt) feels underspecified

When in doubt, ten minutes of clarification saves a day of rework.
