# Task 02 — Module Registry Contract

> **Status: COMPLETE** (2026-06-01). Post-mortem: `.claude/learning/02-contract-mvp.md`. `contract-reviewer` PASS recorded in `contracts/SECURITY_REVIEW.md`. Gas-target deviation (200k → ~300k success path) accepted — ADR `0007-module-registry-gas-target-revision.md` recommended.

## Objective

Write, test, and security-review the `ModuleRegistry.sol` contract. This is the on-chain core of the MVP.

## Required skills for this task

- ethereum-smart-contracts
- trail-of-bits-audit-security

Load both before starting.

## Deliverables

- [ ] `contracts/src/ModuleRegistry.sol` — the contract, fully documented with NatSpec
- [ ] `contracts/test/ModuleRegistry.t.sol` — Foundry tests covering 100% of public surface and all revert paths
- [ ] Fuzz tests for the register function (domain string, schema URI)
- [ ] Coverage report showing 100% on `ModuleRegistry.sol`
- [ ] Written security review pass in `contracts/SECURITY_REVIEW.md`, using the Trail of Bits skill checklist

## Contract specification

### State

```solidity
struct Module {
    uint256 id;
    string name;
    string domain;
    string schemaURI;
    string description;
    address creator;
    uint256 createdAt;
}

mapping(uint256 => Module) private _modules;
mapping(bytes32 => uint256[]) private _modulesByDomainHash;
uint256 private _nextId;  // starts at 1
```

### External / public functions

```solidity
function registerModule(
    string calldata name,
    string calldata domain,
    string calldata schemaURI,
    string calldata description
) external returns (uint256 id);

function getModule(uint256 id) external view returns (Module memory);

function totalModules() external view returns (uint256);

function getModulesByDomain(string calldata domain) external view returns (uint256[] memory);
```

### Events

```solidity
event ModuleRegistered(
    uint256 indexed id,
    address indexed creator,
    string indexed domain,  // indexed string → keccak256 hash in topic
    string name,
    string schemaURI
);
```

### Invariants and validation

- `name` must be non-empty and at most 64 characters
- `domain` must match regex `^[a-z][a-z0-9-]{1,62}$` — enforce via inline checks (Solidity doesn't do regex, implement the equivalent character-by-character)
- `schemaURI` must start with `ipfs://` and be at most 128 characters
- `description` is optional, max 512 characters
- `id` starts at 1 — ID 0 is reserved as a null sentinel
- Once registered, modules are immutable for MVP (no update, no delete)
- `getModule` reverts with a custom error if the module does not exist

### Custom errors

Use custom errors (not `require` with string) for gas efficiency and clarity:
- `EmptyName()`
- `NameTooLong()`
- `InvalidDomain()`
- `InvalidSchemaURI()`
- `DescriptionTooLong()`
- `ModuleNotFound(uint256 id)`

### Access control

No admin roles in the MVP. Registration is permissionless. `msg.sender` is recorded as the creator.

## Test coverage requirements

Write tests for:

**Happy path**
- `test_registerModule_returnsIncrementingIds` — first is 1, next is 2, etc.
- `test_registerModule_emitsEvent` — verify all event fields including indexed domain hash
- `test_registerModule_storesCorrectData` — retrieve via getModule, assert all fields
- `test_getModulesByDomain_returnsCorrectIds` — register in multiple domains, verify filtering

**Revert paths**
- `test_registerModule_revertsOnEmptyName`
- `test_registerModule_revertsOnNameTooLong` — exactly 65 chars
- `test_registerModule_revertsOnInvalidDomain` — several cases: empty, uppercase, starts with digit, contains space, too long, contains underscore
- `test_registerModule_revertsOnInvalidSchemaURI` — http://, no scheme, too long
- `test_registerModule_revertsOnDescriptionTooLong` — exactly 513 chars
- `test_getModule_revertsOnNonexistentId` — id 0, id beyond totalModules

**Fuzz tests**
- `testFuzz_registerModule_acceptsValidInputs` — random valid inputs
- `testFuzz_registerModule_rejectsInvalidDomains` — random strings that don't match the regex

**State invariants**
- `invariant_totalModulesMatchesHighestId` — total is always exactly the highest id

Aim for 100% line and branch coverage on `ModuleRegistry.sol`. Run `forge coverage --report lcov` and confirm.

## Security review checklist

Use the trail-of-bits-audit-security skill to walk through each of these. Document findings (or clean passes) in `SECURITY_REVIEW.md`.

### Reentrancy
- No external calls in `registerModule`, so reentrancy is structurally impossible. Document this explicitly.

### Access control
- Permissionless by design. Confirm no hidden admin hooks.
- Confirm `msg.sender` is not spoofable via a forwarder in any flow. No meta-transactions for MVP.

### Input validation
- Confirm all string length bounds are enforced.
- Confirm domain regex equivalent is watertight.
- Confirm no UTF-8 pathologies (emoji in name should either be accepted consistently or rejected — document the choice).

### State consistency
- Confirm the `_modulesByDomainHash` mapping cannot diverge from `_modules`.
- Confirm `_nextId` increments correctly and cannot be manipulated.

### Gas
- Confirm gas usage on register is reasonable (< 200k). If higher, document why.
- Confirm no unbounded loops anywhere.

### DoS vectors
- `getModulesByDomain` returns a dynamic array. If a domain has 10,000+ modules, reading it becomes expensive for off-chain consumers. For MVP with 3 modules this is not a concern, but document it as a known-scaling-consideration.

### Upgradeability
- Contract is not upgradeable for MVP. Explicit, documented choice.

### Events
- Every state change emits an event. Confirm no silent writes.

## Gas targets

- `registerModule`: < 200k gas
- `getModule`: view, free
- `getModulesByDomain`: view, free (but memory allocation cost on client side scales with result length)

## Do not do in this task

- Do not deploy the contract yet (Task 03)
- Do not integrate Intuition yet (Task 03)
- Do not write TypeScript client bindings yet (Task 04)
- Do not add module updating or deletion
- Do not add access control beyond "anyone can register"
- Do not add any TRUST token interaction
- Do not add upgradeability

## Report format when complete

```
## Task 02 complete

**Shipped**
- ModuleRegistry.sol at <path>, <line count> lines
- <N> tests, all passing, coverage: <%>
- Security review pass: <path to SECURITY_REVIEW.md>

**Decisions made**
- [Any non-obvious choices, with reasoning]

**Security notes**
- [Any findings or noteworthy clean passes from the Trail of Bits review]

**Gas**
- registerModule average: <gas>
- [Other relevant gas numbers]

**Next**
- Ready for Task 03 (deploy + Intuition integration)
- Blocked on: <nothing, or list>
```
