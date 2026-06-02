# Task 02b — ARP Caveat Enforcers

> **Status: COMPLETE** (2026-06-01). Post-mortem: `.claude/learning/03-caveat-enforcers.md`. `contract-reviewer` PASS + narrative-preservation concur recorded in `contracts/SECURITY_REVIEW.md`.

> **Hackathon track**: MetaMask Dev Cook-Off. Narrative-preservation check required in completion report.

## Objective

Build the cryptographic enforcement layer of ARP — two custom `ICaveatEnforcer` contracts deployed on Intuition Testnet (chainId 13579) that compose with the MetaMask Delegation Framework v1.3.0 (DelegationManager at `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3`).

The enforcers bound an agent's delegated authority along two axes:

- `DomainScopeEnforcer` — restricts module-registration actions to a user-authorized list of domains
- `TrustStakeCapEnforcer` — caps the total native-token spend per rolling time window

## Required skills

- **Canonical**: `mms-smart-accounts-kit` (read `references/delegations.md` first — authoritative on `ICaveatEnforcer` four-hook interface)
- **Plus**: `ethskills`, `secure-workflow-guide`, `guidelines-advisor`, `mms-gator-cli` (CLI-driven delegation testing)
- **Supplementary**: `docs/06_BEAR_TRAP_REFERENCE.md` (production enforcer patterns + test density — MetaMask wins on any conflict)

## Required rules

- `.claude/rules/code.md`
- `.claude/rules/solidity.md`
- `.claude/rules/security.md`
- `.claude/rules/metamask-delegation.md`

## Deliverables

- [ ] `contracts/src/enforcers/DomainScopeEnforcer.sol` — full NatSpec, custom errors, single-purpose
- [ ] `contracts/src/enforcers/TrustStakeCapEnforcer.sol` — full NatSpec, custom errors, single-purpose
- [ ] `contracts/test/enforcers/DomainScopeEnforcer.t.sol` — 15+ tests minimum (match Bear Trap density)
- [ ] `contracts/test/enforcers/TrustStakeCapEnforcer.t.sol` — 15+ tests minimum
- [ ] Coverage 100% line + branch on both enforcers (`forge coverage`)
- [ ] Gas measurement in `contracts/SECURITY_REVIEW.md` per enforcer
- [ ] `contract-reviewer` agent PASS recorded in `SECURITY_REVIEW.md`
- [ ] Completion report includes the narrative-preservation answer

## Design

### `DomainScopeEnforcer.sol`

**Purpose**: validate that the agent is calling `ModuleRegistry.registerModule(name, domain, schemaURI, description)` with a `domain` argument whose hash is in the user-pre-approved list.

**Inheritance**: `CaveatEnforcer` (the abstract base in `delegation-framework/src/enforcers/`). Inherits `beforeAllHook`, `afterHook`, `afterAllHook` as default no-ops; only overrides `beforeHook`.

**`_terms` encoding**:
```
abi.encode(bytes32[] allowedDomainHashes)
```
Where each `bytes32` is `keccak256(bytes(domain))`. The user computes this off-chain at delegation-signing time. Empty list ⇒ no domain authorized.

**`_executionCallData` decoding**:
- Use `ExecutionLib.decodeSingle()` to get `(address target, uint256 value, bytes memory callData)`.
- Verify the first 4 bytes of `callData` match `ModuleRegistry.registerModule.selector` (the enforcer is purpose-built for this call shape — composes with `AllowedTargetsEnforcer` for target restriction).
- Decode the remaining `callData` to extract the `domain` string parameter.

**Validation order in `beforeHook`** (inherited modifiers apply mode guards first):
1. `onlySingleCallTypeMode(_mode)`, `onlyDefaultExecutionMode(_mode)` — reject batch / try.
2. Decode `_executionCallData` to extract the target, value, and callData.
3. Verify `bytes4(callData[0:4]) == ModuleRegistry.registerModule.selector` — revert `UnsupportedSelector(bytes4)` otherwise.
4. Decode the remaining calldata to recover the `domain` string.
5. Hash it: `bytes32 domainHash = keccak256(bytes(domain))`.
6. Decode `_terms` → `bytes32[] allowedDomainHashes`.
7. Linear membership scan (O(n), n is short). Revert `DomainNotAllowed(bytes32 domainHash)` if no match.
8. Emit `DomainScopeChecked(bytes32 indexed delegationHash, bytes32 domainHash, bool allowed=true)`.

**Custom errors**:
- `UnsupportedSelector(bytes4 selector)`
- `DomainNotAllowed(bytes32 domainHash)`
- `EmptyAllowedList()` — defensive; `_terms` decoding produces an empty array

**Tests** (15+ minimum):

Happy path:
- Allowed domain → pass
- Multiple allowed domains, target matches one → pass
- Single-element allowed list with exact match → pass

Revert paths:
- Disallowed domain → revert with correct error and hash
- Empty allowed list → revert
- Batch mode → revert (inherited modifier)
- Try mode → revert (inherited modifier)
- Wrong selector → revert
- Selector match but malformed calldata → revert (Solidity decode failure)

Fuzz:
- Random valid `(name, domain, schemaURI, description)` with `domain` in allowedList → pass
- Random `domain` strings hash not in list → revert

Event:
- `DomainScopeChecked` emits with correct `delegationHash` topic and `domainHash` data on every check

### `TrustStakeCapEnforcer.sol`

**Purpose**: cap cumulative native-token (tTRUST on Intuition Testnet) spend per delegation across a rolling time window.

**Inheritance**: `CaveatEnforcer`.

**`_terms` encoding**:
```
abi.encode(uint256 cap, uint256 periodSeconds)
```

**`_executionCallData` decoding**:
- `ExecutionLib.decodeSingle()` → `(target, value, callData)`.
- We only consume `value` (the native-token amount the action sends). Target is enforcer-agnostic.

**State**:
```solidity
mapping(bytes32 delegationHash => uint256 cumulativeSpend) private _cumulativeSpend;
mapping(bytes32 delegationHash => uint256 windowStartTime) private _windowStart;
```

**Validation order in `beforeHook`**:
1. `onlySingleCallTypeMode`, `onlyDefaultExecutionMode`.
2. Decode `_terms` → `(uint256 cap, uint256 period)`.
3. Decode `_executionCallData` → take `value`.
4. If `period == 0` → revert `InvalidPeriod()`.
5. If `block.timestamp - _windowStart[_delegationHash] >= period`, reset: cumulative ← 0, windowStart ← block.timestamp.
6. Compute `proposed = _cumulativeSpend[_delegationHash] + value`.
7. If `proposed > cap` → revert `CapExceeded(uint256 proposed, uint256 cap)`.
8. `_cumulativeSpend[_delegationHash] = proposed`.
9. Emit `StakeCapChecked(bytes32 indexed delegationHash, uint256 newCumulative, uint256 cap)`.

**Custom errors**:
- `InvalidPeriod()`
- `CapExceeded(uint256 proposed, uint256 cap)`

**`block.timestamp` tolerance**: documented in NatSpec — miner-manipulation tolerance ~15 s, irrelevant at day-scale period.

**Tests** (15+ minimum):

Happy path:
- Stake well under cap → pass
- Stake at exact cap → pass
- Multiple stakes summing to cap → all pass
- Window expiration resets cumulative → previously-near-cap delegation accepts a fresh stake

Revert paths:
- Single stake over cap → revert
- Cumulative exceeds cap → revert on the over-budget call
- `period == 0` → revert
- Batch mode, try mode → revert

State invariants (invariant tests):
- After any sequence, `_cumulativeSpend[h] <= cap`
- `_windowStart[h]` only ever increases (or stays the same)

Fuzz:
- Random `(cap, period, value, time)` configurations

Event:
- `StakeCapChecked` emits with correct delegationHash, newCumulative, cap

### Both enforcers

- Custom errors only. No `require` with strings.
- NatSpec on every external function, the contract itself, and the threat model in the contract header.
- Pragma: `0.8.23` strict to match the vendored `delegation-framework` (which is pinned to 0.8.23). Documented as a deviation from `solidity.md`'s default `^0.8.24` in the Task 02b post-mortem.
- Do **not** override `beforeAllHook`, `afterHook`, `afterAllHook` — inherit the default no-ops from `CaveatEnforcer`.
- Do **not** add `msg.sender == DELEGATION_MANAGER` access control on the hooks (defer to a future ADR — Bear Trap's audit recommends it but it complicates testing and adds gas).

## Do not do in this task

- Do not deploy the enforcers yet (Task 03 → after ModuleRegistry deploy + faucet acquisition).
- Do not write the TypeScript delegation-signing helper (Task 03b).
- Do not write the agent registration UI (Task 04b).
- Do not introduce a TRUST token contract — `TrustStakeCapEnforcer` operates on native-token `value`, which on Intuition Testnet IS tTRUST (the native gas asset).
- Do not change `ModuleRegistry.sol` — its calldata layout is now the enforcer's contract.

## Verification

```bash
# All from /home/max/Project/ARP/contracts
export PATH="/home/max/.bun/bin:/home/max/.nvm/versions/node/v20.19.3/bin:$PATH"
forge test --no-match-test invariant -vvv
forge test --match-contract InvariantTest --gas-report
forge coverage --no-match-coverage "test|script"
forge test --gas-report
```

Plus:
- `contract-reviewer` agent on both enforcers + the gas measurements
- `task-verifier` agent on the full deliverable, with the narrative-preservation check

## Narrative-preservation check (required for hackathon tasks)

The completion report must answer in one sentence:

> *Does this preserve the hackathon submission narrative?*

The narrative is in `docs/00_HACKATHON_PIVOT.md`. If "no", the implementation has drifted.

## Report format

```
**What shipped**
<one sentence>

**What I decided**
<non-obvious choices>

**What's next or blocked**

**Does this preserve the hackathon submission narrative?**
<one sentence yes/no with reasoning>
```
