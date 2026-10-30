# Task 40 — The sponsoring service: a proven deposit, paid by ARP, owned by the agent

**Status:** **PLAN**, 2026-10-30. Not started. To be built with task 37 (the delegation register):
the same treasury key, the same limits, one service.
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
