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

| Concern                            | Skill                                 |
| ---------------------------------- | ------------------------------------- |
| Initial overview before changes    | `secure-workflow-guide` (global)      |
| Best-practice patterns             | `guidelines-advisor` (global)         |
| Final scorecard before deployment  | `code-maturity-assessor` (global)     |
| If a token integration appears     | `token-integration-analyzer` (global) |
| Pre-audit prep at end of milestone | `audit-prep-assistant` (global)       |

The `contract-reviewer` agent (in `.claude/agents/`) orchestrates these for you on contract changes.

## Operational security

- Never commit `.env`, private keys, or RPC URLs containing API keys.
- Deployment secrets live in the user's local `.env`, never in the repo.
- The `Deployer` script reads from env and fails loudly if a required key is missing — no silent fallbacks.

## Deployment posture

- Default deployment target: **Intuition Testnet** (changed from Base Sepolia per `docs/00_HACKATHON_PIVOT.md`; ADR `0002`).
- **Mainnet deployment** (Intuition mainnet or any other) requires explicit user confirmation per session. No ARP contract is deployed to mainnet today, and none is planned — the panel's staking targets Intuition's own MultiVault, not an ARP contract.
- **Mainnet transactions are not the same question as mainnet deployment.** ADR `0017` authorises one narrow class: deposits into existing `has trust provider` triple vaults and their counter-triples on chain 1155, signed by the operator in their own wallet. It does not authorise contract deployment, atom or triple creation at scale (see ADR `0021` for that cost), or any stake initiated by an agent. Read the ADR before widening it.
- **No ARP agent, script or automated process may sign a mainnet transaction with ARP's own funds.**
  Verification of staking code is unit tests over a mocked wallet client, `previewDeposit` reads, and
  `eth_call` simulation. A passing test suite is not a reason to spend real TRUST.

  **Read the scope of that sentence carefully — it was misread once, badly.** It governs _this
  repo's_ development: do not let a script spend the operator's TRUST while you are testing it. It
  does **not** govern the protocol's design, and it cannot: `docs/12` point 3 is _"the agent runs, it
  deposits TRUST on the modules it actually used"_, and point 5 is _"the agent operates under a signed
  delegation whose caveats are the guard rail"_. **An external agent depositing its own operator's
  TRUST, bounded by caveats that operator signed, is the product**, not a rule violation. A rule file
  cannot forbid the canonical mechanism.

  Two different signers, and conflating them is the error:

  | Who signs                        | What                                      | Rule                                                     |
  | -------------------------------- | ----------------------------------------- | -------------------------------------------------------- |
  | A human in ARP's panel           | a deposit on a `has trust provider` claim | ADR `0017`. The UI never auto-stakes; a human clicks.    |
  | An **external agent's operator** | one delegation, once                      | `docs/12` point 5. ARP is not a party and signs nothing. |

  ADR `0017` scopes _itself_ away from the second case — it says it does not authorise "any automated
  or agent-initiated stake". That makes agent-initiated staking **not yet authorised**, not
  forbidden, and it needs its own ADR. The risk calculus there is different in kind, because the
  TRUST at stake is the agent operator's and the bound is a caveat they signed.

- Every deployment writes its addresses to `deployments/<chainId>.json`. Idempotent — re-running on the same chain does not redeploy unless `--force` is passed.
- `.env.example` documents the Intuition Testnet RPC, explorer URL, and chain ID. Update it whenever a new env var is introduced.
