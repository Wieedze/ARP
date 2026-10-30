# 0096 — The sponsoring service sponsors only a proof with a price, and keeps its record on disk

**Status:** Proposed
**Date:** 2026-10-30
**Triggered by:** `docs/tasks/40-the-sponsoring-service.md` and `docs/tasks/37-the-delegation-register.md`
(37b, 37c), built together as `apps/sponsor`.

## Context

ADR `0094` §2 lists two proofs that unlock a sponsored deposit: an agent-to-agent hire (payment on
chain plus the callee's hire receipt) and a skill fetched through ARP (ARP's content receipt). The
same section records a user decision: **a sponsored amount stays below the cost of the proof that
unlocks it**, so self-dealing costs more than it earns.

A hire proof has a cost: the payment, read from the chain. A content receipt has none today. A fetch
through ARP is free until x402 puts a price on it (`docs/tasks/41`). So the two statements of ADR
`0094` §2 cannot both hold for the content path. Nothing is "below" an unknown price.

Three smaller choices were forced while building it, and none is written anywhere else.

## Decision

**A proof unlocks a sponsorship only when it has a price, and the sponsored amount is strictly below
that price.** A content receipt is verified (signature, accepted signer, `corroborationOf` against
the receiver) and then refused with "no price yet". Task 41 turns it on by binding a fetch to its
x402 settlement. The service's info route says so.

Three more choices go with it:

1. **A hire proof is priced only on the chain where the deposit is made.** A payment on another chain
   is in another unit, and comparing the two would be summing across chains (`claims.md` check 2).
   It is refused.
2. **The record is an append-only file, not memory.** `docs/tasks/37` 37c said the daily counts live
   in memory and a restart resets them. That was safe for publications, which are idempotent. It is
   not safe for deposits: a restart would let every proof sponsor a second deposit and every agent
   receive its gas twice. So the service uses one JSONL file, the device `apps/node`'s
   `PaymentLedger` already uses. It is still not a database.
3. **The agent's approval is `DEPOSIT` only, never `BOTH`.** `BOTH` would also let the sponsor redeem
   the agent's shares to any receiver (`_isApprovedToRedeem`). The agent owns the position because
   only the agent can leave it.

And one place where the task text and the rules disagreed: the workflow asked for the key "read from
env". ADR `0089` §3 and task 37c say a 0600 file, never an environment variable. The environment
names the file (`SPONSOR_KEY_FILE`), and the file's mode is checked before it is read.

**Rule change.** `security.md`'s list of signature sites goes from five to six: the agent's sponsor
request (`packages/protocol/src/sponsor/request.ts`). Its domain carries the chain and no verifying
contract, because no contract checks it. Its nonce is the proof it is bound to, which the service
spends once.

## Alternatives considered

- **Sponsor content receipts at a nominal price.** That would invent a cost the agent never paid, so
  the rule would hold on paper and not in fact.
- **Sponsor content receipts with no price check.** That breaks the user's rule on the one path where
  self-dealing is free: an operator runs a content node and has it sign for its own agent.
- **Keep the counts in memory, as task 37 said.** Refused for the reason in item 2.

## Consequences

**Positive:**

- Every sponsored deposit is backed by a payment worth more than the sponsorship.
- A restart cannot replay a proof.

**Negative:**

- Until task 41, the only sponsored path is agent-to-agent hire. A skill fetched through ARP is
  indexed as _declared_, as an unsponsored deposit would be.
- The triple's subject and object are not yet tied to the hire proof's two agents. The service checks
  that the term is a `uses` triple and that its id matches the three terms named. It does not check
  that the subject is the requester's identity atom, or that the object is the callee's. That needs
  ADR `0047`'s identity resolution and is left open.

**Neutral (worth knowing):**

- The MultiVault facts behind the approval come from a local `intuition-contracts-v2` checkout, not
  from the deployed contract on 13579. The re-read is still owed before the first live call.

## References

- Related ADR: `0094` (the proof doctrine), `0092` (the limits), `0089` §3 (keys in files), `0083`
  (the hire receipt), `0080` (the content receipt)
- Related rule: `.claude/rules/security.md` (the signing table's testnet row)
- Code: `packages/protocol/src/sponsor/`, `packages/protocol/src/delegation/register.ts`,
  `apps/sponsor/`
