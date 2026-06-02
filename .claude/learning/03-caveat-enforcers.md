## 03 — Caveat enforcers (Task 02b)

**Task:** `tasks/02b-caveat-enforcers.md`
**Completed:** 2026-06-02
**Commit:** uncommitted
**Verifier verdict:** PASS

## What shipped

- `contracts/src/enforcers/DomainScopeEnforcer.sol` — 152 lines incl. NatSpec. Single-purpose `ICaveatEnforcer` (via `CaveatEnforcer` base). Overrides only `beforeHook`. Decodes `_executionCallData` via `ExecutionLib.decodeSingle`, pins the selector to `IModuleRegistry.registerModule.selector` (locally re-declared interface to avoid the 0.8.24/0.8.23 pragma boundary), extracts the `domain` argument by 4-string `abi.decode`, hashes it, and asserts membership in the `bytes32[]` allowed list encoded in `_terms`. Custom errors `UnsupportedSelector(bytes4)` / `DomainNotAllowed(bytes32)` / `EmptyAllowedList()`. Stack-too-deep avoided via private helpers `_extractDomainHash` + `_enforceAllowed`. Emits `DomainScopeChecked(bytes32 indexed delegationHash, bytes32 domainHash)`. View helper `getTermsInfo`.
- `contracts/src/enforcers/TrustStakeCapEnforcer.sol` — 144 lines incl. NatSpec. Single-purpose, target-agnostic, stateful enforcer that caps the native-token `value` field of a single-call execution against a rolling per-window cap. State keyed by `_delegationHash`: `_cumulativeSpend` + `_windowStart` mappings. Resets on `block.timestamp - windowStart >= period`. Custom errors `InvalidPeriod()` / `CapExceeded(uint256, uint256)`. Emits `StakeCapChecked(bytes32 indexed delegationHash, uint256 newCumulative, uint256 cap)`. View helpers `getTermsInfo`, `getState`. `block.timestamp` tolerance documented in NatSpec.
- `contracts/test/enforcers/DomainScopeEnforcer.t.sol` — 256 lines. 14 tests (8 happy + 4 revert + 2 fuzz at 256 runs) including selector mismatch, too-short calldata, batch/try mode rejection via inherited modifiers, 50-entry allowed-list scan, event-emission check.
- `contracts/test/enforcers/TrustStakeCapEnforcer.t.sol` — 239 lines. 15 unit/fuzz + 2 invariants (`invariant_cumulativeNeverExceedsCap`, `invariant_windowStartMonotonic`) under a bounded `TrustStakeCapHandler` ghost. 256 runs × 500 calls = 128 000 calls per invariant, 0 reverts. Includes per-delegation state isolation, exact-cap, cumulative-cap, window-reset, zero-period rejection.
- `contracts/SECURITY_REVIEW.md` — appended ~250 lines under "Security review — Caveat enforcers (Task 02b)". Per-enforcer threat-model walkthrough (10 items each), coverage + gas, `contract-reviewer` agent's independent re-walk + design-decision assessment + narrative-preservation concur, three INFO items (INFO-4/5/6).
- `contracts/foundry.toml` — removed Task 02's `skip = ["lib/delegation-framework/**"]` workaround. Added full remappings for `@account-abstraction`, `@erc7579`, `@openzeppelin/contracts`, `@bytes-utils`, `@solidity-stringutils`, `delegation-framework/`. Enabled `auto_detect_solc = true` so `ModuleRegistry` stays `^0.8.24` while enforcers stay `0.8.23` strict to match the vendored framework. Trimmed `lib/delegation-framework/lib/{FCL,FreshCryptoLib,SCL}` + `lib/delegation-framework/test/` at install time — they don't compile under our remappings and we don't consume them.
- `tasks/02b-caveat-enforcers.md` — task spec authored from the hackathon pivot brief; marked COMPLETE with this post-mortem reference.

## Surprises

- `CaveatEnforcer` (the abstract base) ships with **inherited `require` strings** in its mode modifiers (`"CaveatEnforcer:invalid-call-type"`, `"CaveatEnforcer:invalid-execution-type"`). The rule against `require` strings only applies to our own code; tests assert against these inherited strings because we cannot rewrite the vendored file. Flagged in the security review so a future reviewer doesn't re-flag it.
- Inlining `beforeHook` hit Solidity's 16-local-variable stack-too-deep limit because `(target, value, callData)` + selector + `(name, domain, schemaURI, description)` + `allowed` + `len` + `i` all live in the same frame. Extraction into two `private` helpers (`_extractDomainHash`, `_enforceAllowed`) is semantics-preserving and the optimizer inlines them — no gas penalty. Worth recording because the failure mode is non-obvious from the symptom.
- Cross-pragma `IModuleRegistry` re-declaration is correct because **function selectors are derived from the canonical ABI signature string, not the compiler pragma**. Independently confirmed by `cast sig "registerModule(string,string,string,string)" → 0x60eaf85f`. Pattern is sound and the canonical way to consume the selector of a different-pragma contract.
- The forbidden `require` rule in `.claude/rules/solidity.md` was never violated by us — only the inherited base uses them. The grep for `require` in `src/enforcers/` returned empty. Both the pre-merge and the `contract-reviewer` independent passes confirmed this.

## Decisions made

- **Pragma `0.8.23` strict on both enforcers** (deviation from project default `^0.8.24`). Mandatory because the vendored `delegation-framework/src/enforcers/CaveatEnforcer.sol` is pinned strict 0.8.23. Mitigated with `auto_detect_solc = true` in `foundry.toml` — Foundry picks the right compiler per compilation unit. Documented as INFO-5 in `SECURITY_REVIEW.md`. No ADR yet; this is a vendored-dep constraint, not a project-level choice.
- **No `msg.sender == DELEGATION_MANAGER` access control on the hooks.** Bear Trap's audit recommends adding it; `metamask-delegation.md` defers it to a future ADR. `contract-reviewer` concurs with the deferral for the hackathon and recommends opening the ADR before any mainnet deploy of `TrustStakeCapEnforcer` (the stateful one). Risk model: a direct caller can pollute their own `_delegationHash` state but cannot grief another delegation. INFO-4.
- **`DomainScopeEnforcer` purpose-built for `ModuleRegistry.registerModule`** (selector + 4-string ABI hardcoded). Composition with `AllowedTargetsEnforcer` is how MetaMask docs recommend pinning the target. A "generic" enforcer would need a selector dispatch table and become a footgun.
- **`TrustStakeCapEnforcer` target-agnostic** — reads only `value`. The native-token spend axis is the dimension being capped; target restriction belongs in a separate enforcer.
- **Stack-too-deep refactor via `_extractDomainHash` / `_enforceAllowed`.** Semantics-preserving; readability slightly improved; no gas penalty.
- **Trim `lib/delegation-framework/{FCL,FreshCryptoLib,SCL}` + framework's own `test/`** at install time. These either don't compile under our remappings or are not consumed by the enforcers. Documented in `foundry.toml`'s remappings comment block.

## Rules touched

- `.claude/rules/code.md` — sufficient. No `any` (n/a, Solidity). No commented-out code, no `console.log`, no untagged TODOs. Custom errors as typed values at boundary. Service/presentation separation N/A for contract-only work.
- `.claude/rules/solidity.md` — sufficient with one accepted deviation. Pragma `0.8.23` strict instead of project default `^0.8.24` — required by the vendored framework. Custom errors only, NatSpec on every external function + the contract + events + errors, events on every state change, private storage with explicit getters, layout order matches. No `Upgradeable`, no `delegatecall`, no `nonReentrant` (no external calls).
- `.claude/rules/security.md` — sufficient. Threat-model walkthrough hit all ten items per enforcer; clean pass on each (one documented risk acceptance: deferred `DELEGATION_MANAGER` guard).
- `.claude/rules/metamask-delegation.md` — sufficient and correctly authoritative on the four-hook `ICaveatEnforcer` interface. The rule's `_terms` encoding spec (`bytes32[]` for DomainScope, `(uint256, uint256)` for TrustStakeCap), the `_delegationHash`-keyed state pattern, the inherited mode modifiers, and the deferred `DELEGATION_MANAGER` guard all matched implementation cleanly.
- `.claude/rules/workflow.md` — sufficient. Hackathon-tagged task; four-bullet completion report applied (the narrative-preservation answer is below).

No rule needs revision.

## Suggestions for future tasks

- Task 03 deployment script should deploy both enforcers + `ModuleRegistry` together. Write deployed addresses to `deployments/13579.json::arp.{moduleRegistry, domainScopeEnforcer, trustStakeCapEnforcer}`. Constructor on each enforcer takes no args. Idempotent skip-if-set guard recommended.
- Task 03b (Smart Account integration) constructs the `caveats` array in TypeScript. Each entry references one of the deployed enforcer addresses + an ABI-encoded `terms` blob. Use `viem`'s `encodeAbiParameters` for the terms; the encoding must match the on-chain `abi.decode` signatures exactly:
  - `DomainScopeEnforcer.terms` = `encodeAbiParameters([{ type: 'bytes32[]' }], [allowedDomainHashes])`
  - `TrustStakeCapEnforcer.terms` = `encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [cap, period])`
- Task 04b UI should surface both axes of the delegation in the configuration screen — "Allowed domains" (multi-select of registered domain strings, hashed at submission) and "Cap per period" (number + unit selector). The two axes map 1:1 to the two enforcers; explain this in copy without naming the enforcers.
- The deferred `msg.sender == DELEGATION_MANAGER` guard ADR should be opened before any **mainnet** deploy of `TrustStakeCapEnforcer`. `DomainScopeEnforcer` is stateless and structurally immune. Suggested ADR path: `.claude/choices/0008-delegation-manager-access-control.md`.
- If a future enforcer needs a generic call-shape gate (e.g., multiple selectors), reach for `AllowedMethodsEnforcer` from the framework's stock library before writing a custom enforcer. The framework idiom is composition.
- The cross-pragma selector trick (local `interface` re-declaration to extract `.selector`) is portable to any caller of a different-pragma contract. Worth remembering for Task 03b if the TS-side encoding ever needs to be sanity-checked against an on-chain selector.

## Narrative preservation (hackathon tasks only — 02b, 03b, 04b, 05b)

**Does this preserve the hackathon submission narrative?**

Yes — the two enforcers deliver the on-chain leg of the pivot narrative ("an agent operates under a scoped ERC-7710 delegation bounded by ARP-specific caveat enforcers that restrict staking to declared domains and cap exposure per period"). `DomainScopeEnforcer` is the "restrict to declared domains" axis; `TrustStakeCapEnforcer` is the "cap exposure per period" axis. Both compose with the MetaMask Delegation Framework v1.3.0 and are ready to be referenced by the Smart Account delegation built in Task 03b. `contract-reviewer` independently concurred.
