# 0083 — The hire receipt is EIP-712, names the agent like ERC-8004, and uses the payment as its nonce

**Status:** Accepted
**Date:** 2026-10-30
**Triggered by:** the user, 2026-10-30, after reading the node's weak points: _« renseigne-toi sur
les normes sur internet, comment les autres protocoles font ça »_ about the receipt having no domain
separation. Same request authorised the request limits (weak point 2).

## Context

`apps/node` signed `keccak256(requestHash ‖ resultHash)` with EIP-191 `signMessage`. No domain, no
chain, no time, no ERC-8004 identity, and `requestHash` was `JSON.stringify`, which a requester in
another language cannot reproduce. `.claude/rules/security.md` asks every signature site for nonce +
chainId + verifying contract; this one had none of the three, and the rule's list of signature sites
did not name it.

What others do, read on 2026-10-30:

| source                                                                                                        | what it signs                                                                                                                                                                       | domain                                                                  |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| x402 Offer & Receipt, `x402-foundation/x402` `specs/extensions/extension-offer-and-receipt.md` §3.2, §5.2–5.3 | `Receipt { version, network, resourceUrl, payer, issuedAt, transaction }`, `transaction` optional as `""`                                                                           | `{ name: "x402 receipt", version: "1", chainId: 1 }`, constant          |
| ERC-8004 draft, `eips.ethereum.org/EIPS/eip-8004`                                                             | no task receipt. Identity is `{namespace}:{chainId}:{identityRegistry}` + `agentId`; the feedback file's optional `proofOfPayment` is `{ fromAddress, toAddress, chainId, txHash }` | EIP-712 only for `setAgentWallet`                                       |
| EAS off-chain attestations, `ethereum-attestation-service/eas-sdk` `src/offchain/offchain.ts`                 | `Attest { version, schema, recipient, … }`                                                                                                                                          | `{ name: "EAS Attestation", version, chainId, verifyingContract: EAS }` |

## Decision

`packages/protocol/src/hire-receipt.ts`. EIP-712, domain `{ name: "ARP Hire Receipt", version: "1",
chainId }` with **the payment's chain**, struct
`HireReceipt { version, agentRegistry, agentId, requester, payment, paid, requestHash, resultHash, issuedAt }`.
`agentRegistry` is ERC-8004's string exactly, `""` with `agentId` 0 when the node is not configured
with one. The two hashes are keccak256 over RFC 8785 canonical JSON. The wire shape is
`{ format: "eip712", receipt, chainId, agent, signature }`, x402's `format` tag kept so a JWS
variant can exist later without guessing.

**No `verifyingContract`**, as in `receipt.ts` and `agent-import.ts`: ~~no contract checks it.~~
**Corrected 2026-10-30** (ADR `0098`): `contracts/src/enforcers/ReceiptEnforcer.sol` checks it, on the
v1 domain as signed, so the missing verifier is now an open deviation, not a cause. **The
nonce is `payment`**: the node's ledger refuses a payment twice, so one transaction hash is one
receipt, and two receipts naming one payment are evidence against the signer.

The limits in the same change: 64 KiB body, 60 s handler timeout (a `504` releases the payment),
30 `POST /task` per client IP per minute, and hash/address shape checked before any RPC read.

## Alternatives considered

- **Adopt x402's `Receipt` verbatim.** Its domain hardcodes `chainId: 1` so non-EVM payments sign
  uniformly; this node only accepts an EVM payment, and the chain is the one thing that separates a
  testnet hire from a mainnet one. It also has no field for the request or the result, which is
  what this receipt is for, and defaults the transaction to absent for privacy where here it is
  the anchor.
- **EIP-191 over RFC 8785 JSON.** Solves re-derivability, not domain separation, and would be a
  second signing pattern beside the two EIP-712 ones the repo already has.
- **Name `IdentityRegistry` as `verifyingContract`.** It does not verify this signature. EAS can
  name its contract because the contract can check an off-chain attestation; ours cannot.
- **Take the registry's chain from the payment's.** They coincide on testnet and not on mainnet
  (Base 8453 against 1155, `portability.md` point 2), so the full ERC-8004 string is configured.

## Consequences

**Positive:**

- A stranger checks a receipt with three reads and no library of ours: recovery, the registry's
  `getAgentWallet(agentId)`, and `getTransaction(payment)`. Walked on 13579 on 2026-10-30: agent 2's
  wallet and the recovered signer were both `0x9C985BEF…`.
- The receipt carries ERC-8004's `proofOfPayment` facts, so a feedback file can be filled from it.

**Negative:**

- Breaking change to the wire format. The one consumer, `scripts/demo/demo-hire.ts`, moved with it.
- Recovery alone still proves a key, not an agent; step 2 is the verifier's to run and nothing here
  runs it for them.
- The rate limit is per IP and in memory: a restart resets it, and many IPs evade it.

**Neutral (worth knowing):**

- The ERC-8004 spec is a draft, and the x402 extension is an extension; both can move.

## References

- Related rule: `.claude/rules/security.md` (signature replay) — **changed by this ADR**: its list of
  signature sites said three and named neither receipt; it now names five
- Related doc: `docs/22_RUNNING_THE_NODE.md`, the node section
- Related ADR: `0045` (the node), `0080` (content receipts), `0054` (atom ids)
