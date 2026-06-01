## 02 — Module Registry contract

**Task:** `tasks/02-contract-mvp.md`
**Completed:** 2026-06-01
**Commit:** uncommitted
**Verifier verdict:** PASS

## What shipped

- `contracts/src/ModuleRegistry.sol` — 238 lines incl. NatSpec. Permissionless append-only registry. `registerModule` / `getModule` / `totalModules` / `getModulesByDomain`. Validates name (1–64 bytes), domain regex `^[a-z][a-z0-9-]{1,62}$` byte-by-byte, schemaURI `ipfs://` + 7–128 bytes via `calldataload` + `bytes7` cast, description ≤512 bytes. Six custom errors. Single `ModuleRegistered` event with indexed `id`, `creator`, `domain`. Two `unchecked` blocks (nextId increment, totalModules decrement) — both justified by structural invariants. No external calls, no admin, no proxy.
- `contracts/test/ModuleRegistry.t.sol` — 392 lines. 32 unit/fuzz tests in `ModuleRegistryTest` (9 happy-path, 18 revert-path, 3 fuzz at 256 runs) + 2 invariants in `ModuleRegistryInvariantTest` with bounded `Handler` ghost (256 × 500 = 128 000 calls each, 0 reverts). Re-verified: `forge test --no-match-test invariant` → 32 / 32. `forge test --match-contract ModuleRegistryInvariantTest` → 2 / 2.
- `contracts/SECURITY_REVIEW.md` — 264 lines. Threat-model walkthrough against all ten items in `.claude/rules/security.md` (clean pass on each), reproduced coverage / gas numbers, `contract-reviewer` agent verdict section with independent threat-model re-walk and gas-target rationale.
- `contracts/foundry.toml` — added `skip = ["lib/delegation-framework/**"]`. Task 02 imports nothing from delegation-framework; this is a setup-time workaround for the transitive-submodule bloat documented as INFO-1. Task 02b owns the surgical re-add.

## Surprises

- `forge install --no-git --shallow` does not actually skip transitive submodules. delegation-framework pulled 531 MB of FCL / FreshCryptoLib / SCL / account-abstraction / erc7579-implementation plus internal test files importing `@erc7579`, `@openzeppelin`, `truffle/`, `ds-test/` paths that fail under our remappings. Hand-deletion of `lib/delegation-framework/{lib,test}` + the `foundry.toml` `skip` were both needed to get `forge build` green. Task 02b setup notes need this captured.
- Spec gas target of 200k for `registerModule` is structurally unachievable with the on-chain schema as written. Floor is ~215–230k (7 cold SSTOREs for struct fields + array push + nextId + event + base tx). Real short-input success: ~280k. Fitting 200k would require dropping `description` or moving strings to hash pointers — both weaken auditability. Accepted; the contract-reviewer concurs.
- The `bytes7` IPFS-prefix check via `calldataload(raw.offset)` reads 32 bytes when the string may be only 7. Calldata reads zero-pad past the end and the `bytes7` cast keeps only the high-order 7 bytes — safe. Worth flagging (INFO-3) so the next reviewer doesn't have to re-derive it.

## Decisions made

- **Two `unchecked` blocks.** `_nextId = id + 1` and `_nextId - 1` in `totalModules()`. Both bounded by the structural invariant `_nextId >= 1, monotonic`. Saves a per-call overflow check. Justified inline in NatSpec.
- **`bytes7` calldata-load prefix check** instead of byte-by-byte comparison or `keccak256` equality. Single 32-byte calldata read + one comparison. ~hundreds of gas cheaper than the alternatives; correctness explained in `SECURITY_REVIEW.md` INFO-3.
- **Trim `lib/delegation-framework/{lib,test}` + `foundry.toml` skip.** No Task 02 dependency on delegation-framework; the lib's transitive deps would otherwise have to be unblocked twice (once here, once in 02b). 02b will re-add the specific files it needs.
- **Gas target revision (200k → ~300k for short inputs) acknowledged, not implemented.** No ADR written yet; verifier-pass note flags it as caller follow-up if the user concurs. Refactor would weaken the audit story.

## Rules touched

- `.claude/rules/solidity.md` — sufficient. Pragma, custom errors, NatSpec on public surface, events on every state change, private storage with explicit getters, layout order all match. No `Upgradeable`, no `delegatecall`, no `nonReentrant` (no external calls).
- `.claude/rules/security.md` — sufficient. Threat-model walkthrough hit all ten items; clean pass on each. Documented one accepted deviation (gas target) with justification.
- `.claude/rules/code.md` — sufficient. No commented-out code, no `console.log`, no untagged TODOs. Validation at boundary, custom errors as typed values. No `any` (n/a — Solidity).
- `.claude/rules/workflow.md` — sufficient. Task not hackathon-tagged (02b/03b/04b/05b are). Three-bullet completion report applies (not four).

No rule needs revision.

## Suggestions for future tasks

- Task 02b (caveat enforcers) needs to undo the delegation-framework trim surgically. Probably keep only `lib/account-abstraction` and `lib/erc7579-implementation` from the transitive set; bring back internal `test/` only if a borrowed harness is needed. Remove `skip = ["lib/delegation-framework/**"]` from `foundry.toml` once the imports resolve cleanly.
- Task 03 (deployment) will deploy `ModuleRegistry` and populate `deployments/13579.json::arp.moduleRegistry`. Use `vm.broadcast`-style script, idempotent (skip-if-set unless `--force`). Constructor takes no args.
- The gas-target ADR (if the user concurs the deviation should be formalized) belongs under `.claude/choices/0007-*.md`. Link to SECURITY_REVIEW.md §Gas, lines 156–166 and 240–249.
- The `ModuleRegistered` event indexes `domain` as a string → topic hash. UI consumers in Task 04 must filter by `keccak256(toUtf8Bytes(domain))`, not by the raw string. Document this in the off-chain wrapper when it's written.
- `contract-reviewer` agent's INFO-2 / INFO-3 are informational only; no follow-up needed beyond carrying them in `SECURITY_REVIEW.md` for the next reviewer.
