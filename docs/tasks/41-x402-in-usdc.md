# Task 41 — x402 in USDC: agents pay to consult ARP

**Status:** **PLAN**, 2026-10-30. Not started.
**ADR:** `0094` §4.
**Rules:** `code.md`, `security.md`, `portability.md`, `claims.md`, `workflow.md`.
**Reviewers:** `task-verifier`.

---

## 1. Why

ARP's revenue is agents paying per call to consult it. The number of paid calls is also the
measure of whether ARP is useful to them. Tools never pay.

## 2. Deliverables, in order

### 41a — The 402 answer

- The index, the MCP tools and `GET /content/:atomId` (`apps/mcp/src/content.ts:281`) answer HTTP
  402 with x402 payment requirements when unpaid.
- The standard is used: a signed USDC authorisation, settled by a facilitator. Base Sepolia while
  on testnet. Check the facilitator's current docs and supported networks before choosing one.

### 41b — The node

- The operator node can answer 402 the same way. It already verifies a native payment
  (`apps/node/src/task.ts:202`); x402 is added beside it, not in place of it.
- `registration-file.ts:137` writes `x402Support: false` as a constant. It becomes a computed claim.

### 41c — The count

- Paid calls are counted per route and per day, and that count is the figure the user asked for.

## 3. Do not do in this task

- No subscription. Later, if at all, as a pass bought once through x402.
- No charge to tools.
- No sale or swap of TRUST.

## 4. Evidence ladder

None directly. It funds the sponsoring of task 40 and measures demand.
