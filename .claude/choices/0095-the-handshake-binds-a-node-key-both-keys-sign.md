# 0095 — The install handshake binds a node key that both the owner and the node sign for

**Status:** Proposed
**Date:** 2026-10-30
**Triggered by:** `docs/tasks/39-the-install-handshake.md`, implementing ADR `0094` §1. Proposed,
not accepted: the user has not reviewed these choices.

## Context

ADR `0094` §1 fixes the shape: the node generates a key, sends the agent id and its public key, the
directory reads the token's owner and returns a challenge, the owner signs it in the shape of
Sign-In with Ethereum, and the binding goes on Intuition as a triple with a predicate read from the
graph. Building it forced seven choices the ADR does not make.

## Decision

1. **The node key signs the challenge too.** Proof of possession. Without it an owner can bind a
   public key they do not hold, and the receipts that key's real node signs for its own agent would
   also read as coming from a node bound to theirs.
2. **The node key is the receipt key and the payment address.** One key: `AGENT_PRIVATE_KEY` when
   set, otherwise `~/.arp/node.key`, generated 0600 and refused if others can read it.
   `apps/node/src/task.ts` accepts a payment only when it was sent to the signing key, so a
   generated key is also where hirers pay. A hirer learns it from the binding's `nodeAddress`; it
   used to be the registry's `agentWallet`. Task 41 replaces the native payment with x402 and may
   separate the two again.
3. **A transfer voids the binding at read time.** `verifyEndpointBinding` compares the owner who
   signed with `ownerOf` now and answers `transferred`. Nothing is revoked on chain; nothing needs to
   be. A chain that cannot be read is `unknown`, never `bound` and never `invalid`.
4. **The predicates are `has endpoint` and `in context of`, as they already exist on testnet
   13579** (`scripts/measure/endpoint-predicate.ts`, 2026-10-30; ids in `data/deployments/13579.json`
   `arp.endpointBinding`). `reachable at` does not exist there. The endpoint atom is the URL string
   itself, so the directory compares it with the binding byte for byte. The three `has endpoint`
   subjects already on testnet point at `ipfs://` Thing documents instead, and read as `unproven`
   (`scripts/verify/verify-directory-queries.ts`).
5. **The command is `arp init --node`**, as ADR `0094` writes it, routed before the runtime
   installer so neither loads the other. The owner signs by hand: the CLI prints the message, saves
   it to `~/.arp/handshake-message.txt` and waits for a pasted signature. It never asks for the
   owner's key, and it refuses to run without a terminal.
6. **The directory's two queries live in `packages/protocol/src/directory.ts`**, not in
   `@arp-protocol/graphql` where every other query document is. Task 42 is editing that package in
   the same wave, and task 39 owns only new files in `packages/protocol`. Moving them is one
   mechanical commit once both are merged.
7. **A proof counts only for the agent the reader asked about.** `getAgentEndpoints` takes the
   agent (`agentRegistry` + `agentId`) beside its atom, and a binding that names another agent reads
   `invalid`. Both triples on the read path are permissionless: without this, the owner of any token
   could make a genuine handshake for their own token, write `(victim's atom, has endpoint, E)`,
   attach their binding, and become the victim's newest `bound` endpoint — the one hirers pay. The
   write side refuses the same pairing: `prepareEndpointBinding` takes the binding itself, reads the
   endpoint off it, and requires the agent atom's `same as` edge to the binding's CAIP-19 id. Found
   in review on 2026-10-30, before any directory was hosted; the three `has endpoint` subjects on
   testnet all read `unproven` (`scripts/verify/verify-directory-queries.ts`), so it was **latent**.

   **What a third party can still do is deny, not divert.** The read keeps the newest `limit`
   claims (default 10) and, per claim, the oldest `maxProofsPerClaim` proofs (default 5), each its
   own query. Two griefs survive, and both end in `null`, never in the griefer's endpoint:
   - **Crowding out the claim.** Ten newer `has endpoint` claims push the genuine one out of the
     window. Each needs a new triple and a new endpoint atom, so at least ten triple fees and ten
     atom fees: about 0.02 TRUST on 13579 and about 2 TRUST on 1155, from the costs
     `portability.md` measured on 2026-10-19 (0.001000000002 and 0.001000000001 against
     0.100000000002 and 0.100000000001). The birth deposits come back; the fees do not. A reader
     who suspects it raises `limit`.
   - **Crowding out the proof.** Junk contexts on a claim that predate its genuine proof. A context
     triple names an existing claim, so this needs the claim written before its owner writes it,
     which means guessing the endpoint, or a re-handshake on an endpoint already buried in junk.
     Five junk contexts cost five triple fees and five atom fees, one document atom each.

   `maxProofsPerClaim` also bounds what one claim can make a reader spend: at most five document
   fetches and ten chain reads. A ranking that cannot be crowded (by stake, or by the binding's
   document atom) would need either a field this read has not validated or the document before the
   query, and was not built.

## Alternatives considered

- **Bind the owner's signature alone**, as ADR `0094` describes — refused for the reason in 1.
- **A separate receipt key and node key** — two keys for the operator to keep, and the binding
  would vouch for a key that signs nothing anybody checks.
- **Revoke on transfer by writing a counter-position** — a write for every transfer, by somebody
  who has to notice it. The registry already answers the question.
- **Mint a `reachable at` predicate** — `portability.md` says read the vocabulary first, and an
  existing predicate was there.
- **Sign in the CLI with the owner's key from the environment** — the CLI would then hold the one
  key the whole handshake exists to keep away from the node.

## Consequences

**Positive:**

- A stranger re-checks a binding with the registry and a signature library, and nothing of ARP's.
- A receipt's signer and a binding's `nodeAddress` are one key, so task 40's _proven_ path has one
  comparison to make.

**Negative:**

- A generated node key now receives hire payments, so `~/.arp/node.key` is worth what that address
  holds.
- Quick tunnels hand out a new hostname on every start, so a binding needs a tunnel the operator
  runs with a stable name (`ARP_NODE_PUBLIC_URL`). The node says so when it starts a quick one.
- No directory is hosted. `handshakeFetchHandler` is the handler a hosted service mounts; where it
  runs is open.
- A reader has to know the agent's id, not only its atom (7). The atom alone says where claims hang,
  not whose they are.
- A third party can still make an agent unresolvable for the price of its fees (7).

**Neutral (worth knowing):**

- The SIWE expiry bounds the live handshake only. A binding read a month later is past it and still
  means what the owner signed; the single-use nonce is what stops a replay.
- An owner that is a contract account verifies through `verifyMessage`'s ERC-1271 path in
  `handshakeChain`. Only EOAs are exercised by the tests.

## References

- Related ADR: `0094` (§1), `0038` (plans, never signs), `0083` (the hire receipt), `0092` (the
  same `in context of` shape for delegations)
- Related rule: `.claude/rules/portability.md`, `.claude/rules/security.md` (signature replay)
- Related doc: `docs/22_RUNNING_THE_NODE.md` (the node)
