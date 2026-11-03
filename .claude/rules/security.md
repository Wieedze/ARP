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
- Signatures are in use, so this section applies. Nine sites: `contracts/src/erc8004/IdentityRegistry.sol`
  (ARP's testnet deployment of the reference registry, which verifies signatures); MetaMask
  Delegation Framework delegations (EIP-712, signed in the app, verified by `apps/sponsor` before
  it publishes one); the operator's EIP-712 statement on import
  (`apps/web/src/services/agent-import.ts`); the MCP server's content receipt
  (`packages/protocol/src/receipt.ts`); the node's hire receipt
  (`packages/protocol/src/hire-receipt.ts`, ADR `0083`); the agent's sponsor request
  (`packages/protocol/src/sponsor/request.ts`, ADR `0096`); the address's mint-gas request
  (`packages/protocol/src/sponsor/mint-gas.ts`, ADR `0116`), which carries no verifying contract
  because no contract checks it, and whose nonce the sponsoring service spends once; the address's
  list-tool request (`packages/protocol/src/sponsor/list-tool.ts`, ADR `0123`), the same shape
  with the URL in the signed message; and `ReceiptEnforcer`
  (`contracts/src/enforcers/ReceiptEnforcer.sol`, task 43, not deployed), which verifies that hire
  receipt on chain. The content receipt and the sponsor request carry no verifying contract. For the
  content receipt the cause still holds: no contract checks it. The sponsor request's nonce is the
  proof it is bound to, which the service spends once. **The hire receipt names its verifier since
  v2** (task 44, user decision 2026-10-30, ADR `0098`, ADR `0101`): its domain carries
  `verifyingContract`, and each verifier accepts only a receipt that names it — `ReceiptEnforcer`
  its own address, `apps/sponsor` its sponsoring account — so one receipt unlocks one sponsorship,
  at the verifier it names. One payment gets one receipt only as far as the signing node's ledger
  holds: a node that signs two receipts for one payment, naming two verifiers, gets both used.
  The v1 receipt, which named no verifier, still verifies in `hire-receipt.ts` and is accepted by
  neither (`SECURITY_REVIEW.md` INFO-R1 holds the history). A new signature site gets checked
  against the bullet above, and added to this list, before it ships (ADRs `0096`, `0098`, `0117`).

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
- **Mainnet deployment** (Intuition mainnet or any other) requires explicit user confirmation per
  session. That is the rule, and it stands on its own.

  **No ARP _registry_ is on mainnet and none is planned** — `moduleRegistry` and `identityRegistry`
  are both `null` in `data/deployments/1155.json`, deliberately, by ADR `0025`. The panel's staking
  targets Intuition's own MultiVault, not an ARP contract.

  **Two ARP caveat enforcers _are_ on mainnet**, deployed 2026-09-16 under that same ADR:
  `TrustStakeCapEnforcer` `0x99921C234d4Ca518DC58ba63ff9bfD2Cc9435f34` (active — the guard rail
  that bounds an agent's spend) and `DomainScopeEnforcer`
  `0x4E20279EeE9f77673A4f1605E58607cD9A597d70` (inert; with no `ModuleRegistry` on 1155 it has
  nothing to gate). Neither has ever fired — 0 `StakeCapChecked` logs over 10,014,303 blocks,
  measured 2026-10-27 by `scripts/measure/enforcer-events.ts`.

  `data/deployments/<chainId>.json` is the record; do not restate its contents here a second time
  (ADR `0065`).

- **Mainnet transactions are not the same question as mainnet deployment.** ADR `0017` authorises one narrow class: deposits into existing `has trust provider` triple vaults and their counter-triples on chain 1155, signed by the operator in their own wallet. It does not authorise contract deployment, atom or triple creation at scale (see ADR `0021` for that cost), or any stake initiated by an agent. Read the ADR before widening it.
- **Mainnet signing, in one sentence, and the only place it is stated.** `CLAUDE.md` and
  `.claude/STATE.md` cite this bullet; if they ever restate it, they are wrong and this wins.

  **No ARP agent, script or automated process may sign a mainnet transaction with ARP's own funds.**

  The qualifier is deliberate (ADR `0035`). Whose funds and who signs are separate questions:

  | Whose funds                                             | Who signs                            | Mainnet?                                                 |
  | ------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------- |
  | **ARP's own**                                           | a script or agent, automatically     | **never**                                                |
  | ARP's own                                               | a human in the panel                 | yes, ADR `0017`, seven safeguards                        |
  | **An agent operator's**, under a delegation they signed | the agent                            | yes **after the path is proven on testnet** — ADR `0036` |
  | An agent operator's                                     | an agent session with their raw key  | **testnet 13579 only** — ADR `0037`                      |
  | ARP's own                                               | the sponsor relay, within its limits | **testnet 13579 only** — ADR `0092`                      |
  | ARP's own                                               | the sponsoring service, for a deposit that carries a verified proof, within the same limits | **testnet 13579 only** — ADR `0094`                      |
  | ARP's own                                               | the sponsoring service, for a new agent's mint gas, its identity atoms and its first `uses` triple, within the same budget | **testnet 13579 only** — ADR `0110`                      |
  | ARP's own                                               | the sponsoring service, for a tool listing (the tool's atom, a skill's repository and `source`), within its own daily caps and the same budget | **testnet 13579 only** — ADR `0123`                      |
  | ARP's own                                               | the sponsoring service, for an accepted category (its atom, its parent edge, one skill's tag), as an attestor the index reads, within its own daily cap and the same budget | **testnet 13579 only** — ADR `0124`                      |

  Row 3 is the product (`docs/12` points 3 and 5), so a flat "no agent may ever sign a mainnet
  transaction" forbids the thing being built. Row 1 is the development hazard the rule exists for.
  Verification of staking code is unit tests over a mocked wallet client, `previewDeposit` reads, and
  `eth_call` simulation. A passing test suite is not a reason to spend real TRUST.

  **Read the scope of that sentence carefully.** It governs _this
  repo's_ development: do not let a script spend the operator's TRUST while you are testing it. It
  does **not** govern the protocol's design, and it cannot: `docs/12` point 3 is _"the agent runs, it
  deposits TRUST on the modules it actually used"_, and point 5 is _"the agent operates under a signed
  delegation whose caveats are the guard rail"_. **An external agent depositing its own operator's
  TRUST, bounded by caveats that operator signed, is the product**, not a rule violation. A rule file
  cannot forbid the canonical mechanism.

  Two different signers, and conflating them is the error:

  | Who signs                        | What                                      | Rule                                                                                                              |
  | -------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
  | A human in ARP's panel           | a deposit on a `has trust provider` claim | ADR `0017`. The UI never auto-stakes; a human clicks.                                                             |
  | An **external agent's operator** | one delegation, once                      | `docs/12` point 5. ARP does not sign the delegation. On testnet its relay may pay to **publish** it (ADR `0092`). |

  **Testnet 13579 is permitted** (ADR `0037`). An agent
  session may sign there with the operator's key when the user asks for that specific action, on
  three conditions: the key is never read into the agent's context, its address is verified against
  the expected account first, and the effect is recorded where a later reader looks. It covers the
  action asked for and not a standing licence — approval of one mint is not approval of a loop.

  **One standing licence exists, and it is narrow** (ADR `0092`, the user's decision 2026-10-30):
  the sponsor relay may publish an operator's **signed, verified** delegation to IPFS and index it
  on Intuition **testnet 13579**, paid by ARP's treasury key, within a per-delegator daily limit and
  a global daily budget. It verifies the signature before it pins or writes anything. Mainnet needs
  a new ADR.

  ADR `0017` scopes _itself_ away from the second case — it says it does not authorise "any automated
  or agent-initiated stake". That makes agent-initiated staking **not yet authorised**, not
  forbidden, and it needs its own ADR. The risk calculus there is different in kind, because the
  TRUST at stake is the agent operator's and the bound is a caveat they signed.

- Every deployment writes its addresses to `data/deployments/<chainId>.json`. Idempotent — re-running on the same chain does not redeploy unless `--force` is passed.
- `.env.example` documents the Intuition Testnet RPC, explorer URL, and chain ID. Update it whenever a new env var is introduced.
