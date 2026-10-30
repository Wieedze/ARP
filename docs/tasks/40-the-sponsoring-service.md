# Task 40 — The sponsoring service: a proven deposit, paid by ARP, owned by the agent

**Status:** **BUILT**, 2026-10-30, not running: no key file, no deployment, no transaction sent.
Built with task 37 (37b, 37c) as one service, `apps/sponsor`: the same treasury key, the same
limits. Completion note at the end.
**ADR:** `0094` §2 and §3, `0092`.
**Required skills:** `intuition`, `ethskills`.
**Rules:** `code.md`, `security.md`, `portability.md`, `claims.md`, `workflow.md`.
**Reviewers:** `intuition-integrator`, then `task-verifier`.

---

## 1. Why

ARP sponsors a deposit only when the use is proven. The position must stay the agent's, so its
identity is tied to its stake. Sending tokens to the agent's wallet is refused: it would be a
faucet.

## 2. Deliverables, in order

### 40a — The deposit, `receiver = agent`

- Re-read the **deployed** MultiVault ABI on 13579 first. ADR `0094` cites a local checkout
  (`2bb93d2`, 2025-09-26): `approve` at `MultiVault.sol:362`, `deposit` at `:661-679`,
  `_isApprovedToDeposit` at `:1591`. The deployed contract may differ.
- The service calls `deposit(receiver = agent, …)` and pays the value. It calls the MultiVault and
  nothing else (an allow-list).

### 40b — The one-time `approve`

- The agent's `approve(sponsor, DEPOSIT)` is its own transaction. The service sends each registered
  agent the gas for that one transaction, once (user decision).

### 40c — The proof gate

- Before it sends, the service checks the agent's signed request and the proof:
  - agent calls agent: the caller's payment on chain and the callee's hire receipt;
  - skill fetched through ARP: ARP's content receipt.
- `corroborationOf` (`packages/protocol/src/receipt.ts:367`) compares the receipt's `to` against
  the declarer. Change it to compare against the `receiver`, or every sponsored declaration reads
  as `other-caller`.

### 40d — Limits (and, for mainnet only, the withdrawal rule)

**Testnet: everything is sponsored** (user decision, 2026-10-30, ADR `0094` status line). Build the
limits below; the withdrawal rule is not built on testnet.

- ADR `0092`'s limits: 2 per delegator per day, about 1 tTRUST a day overall, registered ERC-8004
  agents only. Configuration, printed in the service's info route.
- Withdrawal is allowed. Past a threshold of what an agent was sponsored, the service stops
  sponsoring it. The threshold is configuration; the user has not set it.

## 3. Do not do in this task

- No mainnet. `security.md`'s row: testnet 13579 only.
- No transfer of TRUST to an agent's wallet, apart from the one-time `approve` gas.
- No deposit where the service is the receiver.

## 4. Evidence ladder

Staked → proven: this is the step that lets ARP say _proven_ about a deposit.

## 5. Completion note — 2026-10-30

On `feat/40-sponsoring-service`. ADR `0096`, post-mortem `.claude/learning/32-the-sponsoring-service.md`,
`task-verifier` PASS on the second pass.

- **40a.** `POST /deposit` sends `deposit(receiver = agent, …)` to the MultiVault and nothing else; the
  allow-list is checked before the spend is reserved and again before the key is used. The deployed
  ABI was re-read on 13579 first, read-only: `scripts/measure/multivault-sponsor-abi.ts`, output in
  `data/measurements/multivault-sponsor-abi-2026-10-30.json`.
- **40b.** `POST /gas` sends the gas for the agent's `approve(sponsor, DEPOSIT)` once ever. `BOTH` is
  never asked for (ADR `0096` item 3).
- **40c.** The signed request and the proof are checked before anything is sent. A hire proof is
  sponsored; a content receipt is verified and then refused until `docs/tasks/41`. `corroborationOf`
  compares against the `receiver`.
- **40d.** ADR `0092`'s limits, in configuration and printed on `GET /`. **Testnet sponsors every
  proven hire** (ADR `0094` as amended): the withdrawal threshold is optional and unset, and the
  cost-of-proof rule is `belowProofCost: false`. Both are mainnet rules. The agent needs no TRUST of
  its own (ADR `0096` item 8).
- **§3.** No mainnet: `main.ts` refuses any chain but 13579. No transfer to the agent's wallet but
  the approval gas. No deposit with the service as receiver: `/gas` and `/deposit` refuse an agent
  whose ERC-8004 holder is the sponsor wallet (ADR `0096` item 7).
- **Gates**, each with its scope: `apps/sponsor` `bun run test` (41 tests, `apps/sponsor/test/`) and
  `bun run lint` (`tsc --noEmit` over `apps/sponsor`); `packages/protocol` `bun run test` (vitest over
  `packages/protocol/test`) and `bun run lint` (`tsc --noEmit` over the package). No gate exercises
  the service against a live chain; that run has not happened.
