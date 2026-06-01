# Security rules

Load for every task that touches a contract, an admin-callable function, or handling of value. ARP will eventually manage TRUST stakes — the MVP must already obey production-grade security discipline.

## Threat model checklist

Walk through each item for every contract change. Document the result (clean pass or mitigation) in `contracts/SECURITY_REVIEW.md`.

### Reentrancy
- List every external call in the change.
- For each: confirm checks-effects-interactions order, or document why reentrancy is structurally impossible (no external calls, no callbacks).

### Access control
- Every state-changing function: who can call it? Is the restriction enforced explicitly (modifier, require, custom error)?
- Owner functions: is ownership transferable? Renounceable? Is the choice deliberate?
- Permissionless functions: is `msg.sender` the right binding for whatever identity matters?

### Integer arithmetic
- Solidity 0.8+ reverts on over/underflow — confirm we're not using `unchecked` blocks unless necessary and documented.
- Division by zero: where can it occur?
- Loss of precision: is there a division before multiplication anywhere?

### Input validation
- Every external function validates every input parameter. No "trusted caller" assumptions.
- String length bounds are explicit.
- Address parameters are checked for zero address where zero would be invalid.

### Front-running / MEV
- Is the order of transactions observable + exploitable? Registration of a module is first-come-first-served on `id`, but the `creator` is bound to `msg.sender` — no front-runnable identity.
- Any auction-like mechanic must be reviewed against the global `secure-workflow-guide` MEV section.

### Signature replay
- If signatures are used (EIP-712, EIP-1271), they include a nonce + chainId + verifying contract.
- The MVP does **not** use signatures. If a future task introduces them, this section must be revisited.

### Oracles / external data
- The MVP does not depend on oracles. If a future task introduces one, document the failure mode if the oracle is stale or wrong.

### DoS via unbounded loops
- Any loop in the contract has a constant bound or a documented external invariant.
- View functions returning dynamic arrays document the off-chain consumer cost.

### Upgradeability
- The MVP is not upgradeable. Confirm no proxy patterns, no `delegatecall` to user-controlled targets.

### Events
- Every state change emits an event. Confirm no silent writes by grepping for state mutations and pairing each with an `emit`.

## Skills to invoke

When the threat model identifies something non-trivial, escalate to the matching Trail of Bits skill:

| Concern | Skill |
|---|---|
| Initial overview before changes | `secure-workflow-guide` (global) |
| Best-practice patterns | `guidelines-advisor` (global) |
| Final scorecard before deployment | `code-maturity-assessor` (global) |
| If a token integration appears | `token-integration-analyzer` (global) |
| Pre-audit prep at end of milestone | `audit-prep-assistant` (global) |

The `contract-reviewer` agent (in `.claude/agents/`) orchestrates these for you on contract changes.

## Operational security

- Never commit `.env`, private keys, or RPC URLs containing API keys.
- Deployment secrets live in the user's local `.env`, never in the repo.
- The `Deployer` script reads from env and fails loudly if a required key is missing — no silent fallbacks.

## Deployment posture

- Default deployment target: **Intuition Testnet** (changed from Base Sepolia per `docs/00_HACKATHON_PIVOT.md`; ADR `0002`).
- Mainnet deployment (Intuition mainnet or any other) requires explicit user confirmation per session and is out of scope for the hackathon submission.
- Every deployment writes its addresses to `deployments/<chainId>.json`. Idempotent — re-running on the same chain does not redeploy unless `--force` is passed.
- `.env.example` documents the Intuition Testnet RPC, explorer URL, and chain ID. Update it whenever a new env var is introduced.
