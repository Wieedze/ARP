# 0096 — The sponsoring service sponsors only a proof with a price, and keeps its record on disk

**Status:** Proposed
**Date:** 2026-10-30
**Triggered by:** `docs/tasks/40-the-sponsoring-service.md` and `docs/tasks/37-the-delegation-register.md`
(37b, 37c), built together as `apps/sponsor`.

## Context

ADR `0094` §2 lists two proofs that unlock a sponsored deposit: an agent-to-agent hire (payment on
chain plus the callee's hire receipt) and a skill fetched through ARP (ARP's content receipt). The
same section records a user decision: **a sponsored amount stays below the cost of the proof that
unlocks it**. ADR `0094` adds "self-dealing then costs more than the sponsorship it earns", and that
holds between two operators only. The hire payment is a **transfer** from the requester to the
callee, not a burn. One operator holding both keys, which ADR `0094` §2 as corrected admits, gets the
payment back and is out only the gas. For that operator the price rule bounds nothing; the per-agent
daily count and the daily budget do.

A hire proof has a cost: the payment, read from the chain. A content receipt has none today. A fetch
through ARP is free until x402 puts a price on it (`docs/tasks/41`). So the two statements of ADR
`0094` §2 cannot both hold for the content path. Nothing is "below" an unknown price.

Five smaller choices were forced while building it, and none is written anywhere else. Items 4 and 5,
and the second half of item 2, were added on review the same day.

## Decision

**A proof unlocks a sponsorship only when it has a price, and the sponsored amount is strictly below
that price.** A content receipt is verified (signature, accepted signer, `corroborationOf` against
the receiver) and then refused with "no price yet". Task 41 turns it on by binding a fetch to its
x402 settlement. The service's info route says so.

Five more choices go with it:

1. **A hire proof is priced only on the chain where the deposit is made.** A payment on another chain
   is in another unit, and comparing the two would be summing across chains (`claims.md` check 2).
   It is refused.
2. **The record is an append-only file, not memory.** `docs/tasks/37` 37c said the daily counts live
   in memory and a restart resets them. That was safe for publications, which are idempotent. It is
   not safe for deposits: a restart would let every proof sponsor a second deposit and every agent
   receive its gas twice. So the service uses one JSONL file, the device `apps/node`'s
   `PaymentLedger` already uses. It is still not a database.
   **And it is written before the send, not after.** Each deposit and gas transfer is reserved as a
   `pending` row before the key is used, then settled `success` or `reverted`. A send whose outcome
   is lost (the receipt wait throws, a read after the send throws, the process dies) stays pending,
   and pending counts as spent. Recording only after a success let a flaky RPC replay a proof, which
   is the replay this item exists to stop. The cost the other way is a proof refused that did not
   in fact spend; the info route prints the pending count for the operator to reconcile. A
   reverted row is not spent, because the chain returned the value.
3. **The agent's approval is `DEPOSIT` only, never `BOTH`.** `BOTH` would also let the sponsor redeem
   the agent's shares to any receiver (`_isApprovedToRedeem`). The agent owns the position because
   only the agent can leave it.
4. **A hire receipt counts only when its signer is the agent it names.** `hire-receipt.ts` leaves
   that read to the verifier. The service reads the registry: the receipt's `agentRegistry` must be
   one the service accepts, `agentId` must exist in it, and the signer must be its holder or its
   `agentWallet`. Without the read, the callee could be any key.
5. **The deposit is on the proof's edge and no other.** The triple must be `(requester's identity
atom, uses, X)`, where X is the content receipt's tool atom, or the hired agent's identity atom
   for a hire (`hire-receipt.ts`: the edge is `(hirer, uses, agent)`). Both identity atoms are
   resolved through `same as` (ADR `0032`) by `resolveIdentityAtomStrict`, which answers
   _ambiguous_ instead of taking the first row when two atoms claim one identity: `same as` is
   permissionless and the read is unordered, so with a second claimant the edge paid for would be
   chosen by whoever wrote it. An ambiguous identity is a 409, an absent one a 403, and neither is
   sponsored on the operating wallet's atom. The predicate is the canonical `uses` term the declare
   path writes, not a setting. Without this, any registered agent with any hire could have a
   sponsored, and so _proven_, deposit put on any `uses` triple.
6. **A hire of oneself is refused, by identity and by atom.** The signer check in item 4 accepts an
   `agentWallet`, so a holder paying its own agent's `agentWallet`, which then signs a receipt naming
   that same agent, passes `callee !== receiver`. ADR `0094` accepts two agents under one operator;
   this is one agent, and the edge would be `(A, uses, A)`. `checkSponsorProof` refuses a receipt
   whose `(agentRegistry, agentId)` is the request's own, and the service refuses a triple whose
   subject and object atoms are equal, for two ids that resolve to one atom.

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
- **Ship hire deposits unbound to the hire's two agents, and label them _proven_ anyway.** Refused:
  the label would then describe the payment, not the edge the deposit is on. Leaving them unbound
  would need the user's decision, and none was given.

## Consequences

**Positive:**

- Every sponsored hire deposit is backed by a payment on chain larger than the sponsorship, and sits
  on the edge between the two agents that payment connects. Between two operators, faking one costs
  more than it earns. One operator holding both agents recovers the payment, so for that operator
  the bound is the daily count per agent and the daily budget, not the price.
- Neither a restart nor a send whose outcome was lost can replay a proof.

**Negative:**

- Until task 41, the only sponsored path is agent-to-agent hire. A skill fetched through ARP is
  indexed as _declared_, as an unsponsored deposit would be.
- A sponsored deposit needs both agents to have an identity atom on the graph. On testnet nobody
  mirrors ARP's registry, so ARP writes them (ADR `0047`); until it has, a hire between those agents
  is refused.
- The service now reads the graph (two `same as` resolutions per deposit) as well as the chain. A
  graph that fails answers 500 and spends nothing. An agent whose CAIP-19 has a second `same as`
  claimant cannot be sponsored until that is resolved, and anyone can write that second claim: a
  griefing route against one agent's sponsorship, not against its capability.

**Neutral (worth knowing):**

- The MultiVault facts behind the approval were re-read off the deployed contract on 13579,
  2026-10-30, block 9374997, read-only: `scripts/measure/multivault-sponsor-abi.ts`, output in
  `data/measurements/multivault-sponsor-abi-2026-10-30.json`. The proxy's implementation
  (`0x7b320b9a…2f94`) dispatches `approve(address,uint8)` and
  `deposit(address,bytes32,uint256,uint256)`; `approve(self, 1)` reverts
  `MultiVault_CannotApproveOrRevokeSelf()`, `approve(other, 4)` reverts as an out-of-range enum, an
  unapproved `deposit` reverts `MultiVault_SenderNotApproved()`, and `sender == receiver` passes the
  approval check.
- The daily budget counts the `value` the service sends. The gas of its own transactions is not
  counted; its balance bounds that.

## References

- Related ADR: `0094` (the proof doctrine), `0092` (the limits), `0089` §3 (keys in files), `0083`
  (the hire receipt), `0080` (the content receipt)
- Related rule: `.claude/rules/security.md` (the signing table's testnet row)
- Code: `packages/protocol/src/sponsor/`, `packages/protocol/src/delegation/register.ts`,
  `apps/sponsor/`
- Measurement: `scripts/measure/multivault-sponsor-abi.ts`
