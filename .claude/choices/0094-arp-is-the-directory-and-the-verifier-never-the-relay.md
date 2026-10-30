# 0094 — ARP is the directory and the verifier, never the relay; a proof is the condition of a sponsored deposit

**Status:** Accepted
**Date:** 2026-10-30
**Triggered by:** user decisions on 2026-10-30, across sessions arp-34, arp-41 and arp-63, consolidated
in arp-63. The design was stress-tested against the MultiVault source before this ADR was written.

Amends ADR `0045`, ADR `0092` and the receipt doctrine first written in ADR `0080`. Testnet 13579
only.

## Context

Until today a receipt only **added** to a declaration. It labelled it as corroborated and never
refused one. That doctrine is written in 13 places across 8 files (listed under References). It left
ARP unable to say anything stronger than "somebody paid to say they used this".

The user set out a loop that changes this (arp-34, verbatim): _« ce n'est pas l'agent qui déclare,
c'est l'agent qui apporte la preuve et nous on déclare en son nom »_. Five points followed in arp-63,
and each was checked:

1. **Reachability.** An agent must be reachable without its operator opening a port.
2. **Who pays.** ARP sponsors the deposit. Sending tokens to an agent's wallet is refused: _« sinon
   les agents vont falsifier pour recevoir du token et ne jamais le dépenser »_. The agent must still
   own the position: _« sinon son identité ne serait jamais reliée à son stake »_.
3. **Withdrawal.** The agent may withdraw: _« je veux qu'il puisse le retirer, c'est le but »_. An
   agent that withdraws too much is no longer sponsored and pays from its gains.
4. **Revenue.** Agents pay to consult ARP, in x402 USDC. Tools do not pay. ARP buys the TRUST it
   spends and never sells any.
5. **Requests never pass through ARP**: _« j'aimerais éviter de faire passer les prompts et
   requêtes par notre système »_.

Point 5 settled a question that points 1 and 2 had opened. An earlier draft of this loop had ARP
**relay** every agent-to-agent call, which would have broken `docs/12`'s request-path invariant. It
does not need to. The proof can come from the parties and the chain rather than from ARP's view of
the traffic.

## Decision

**ARP is a directory and a verifier. It hands out endpoints, checks proofs, and sponsors the
deposits that carry a valid proof. It never relays a request, and it never sees a prompt.**

### 1. Reachability: a rented tunnel, and a handshake at install

- The operator's node gets its public address from an existing tunnel service, such as Cloudflare
  Tunnel or ngrok. Each opens an outbound connection and serves a public hostname. ARP builds no
  relay.
- The reachable identifier belongs to the operator's node. `arp init` registers it with ARP in
  three steps:
  1. the node generates its key and sends the agent's id (chain, registry, token id) and its
     public key;
  2. ARP reads the token's owner on chain and returns a challenge (nonce, expiry, chain);
  3. the owner signs the challenge, in the shape of Sign-In with Ethereum. ARP checks that the
     signer owns the token, then binds the node key to the agent.
- The binding is written to Intuition as a triple, so anyone can check it without ARP. The
  predicate is chosen when it is built (`portability.md`: read the vocabulary from the graph first).
- A transfer of the token voids the binding until a new handshake.
- ERC-8004 itself checks none of this. The registry does not even test that an endpoint answers.

### 2. A proof is the condition of a sponsored deposit

| Path                  | The proof                                                                        | Strength |
| --------------------- | -------------------------------------------------------------------------------- | -------- |
| agent calls agent     | the caller's payment on chain, plus the hire receipt signed by the callee's node | strong   |
| skill fetched via ARP | ARP's signed content receipt                                                     | access   |
| MCP called directly   | the runtime hook only                                                            | weak     |

- No single party can forge the agent-to-agent proof: the payment is on chain, and the receipt is
  signed by the other side. ARP verifies both without seeing the request.
- **The condition binds ARP's sponsorship and ARP's "proven" label, not the chain.** MultiVault is
  permissionless, so an agent can always deposit its own TRUST with no proof. ARP indexes that as
  _declared_, never as _proven_. This is also what keeps ADR `0045`'s test passing.
- **Now:** the funder checks the proof before it sends. **Later:** a caveat enforcer checks a signed
  receipt passed in the redemption, so "no proof, no deposit" is held by a contract, the same pattern
  as `DomainScopeEnforcer` and `TrustStakeCapEnforcer`.
- **MCP.** The hook's declaration stays weaker. How it combines with `apps/probe`'s reachability
  signal (used, unreachable, or a counter-triple) is left open, by the user's decision: _« ça reste
  à définir plus tard »_.

### 3. The funder pays, and the agent owns the position

- The funder is a separate service. It calls `deposit(receiver = agent, …)` and pays the value. The
  shares are the agent's.
- This needs the agent's one-time `approve(funder, DEPOSIT)`. Without it the contract refuses.
  `_isApprovedToDeposit` accepts `sender == receiver` or an approval held by the receiver.
- `approve` is the agent's own transaction, and the contract has neither a signature-based approval
  nor a forwarder. So the funder sends each registered agent **the gas for one transaction, once**.
  That amount is too small to be worth diverting. (User decision.)
- The agent signs its request. The funder checks that signature and the proof before sending.
  Nothing on chain checks the agent's signature. The on-chain link to the agent's identity is the
  `receiver`.
- **Withdrawal is allowed.** A position the agent cannot leave says nothing. Exiting a tool that
  degraded, or moving from support to oppose, is the signal. Once an agent has withdrawn more than
  a threshold of what it was sponsored, the funder stops sponsoring it, and the agent pays from its
  gains. The threshold is configuration and is not yet set.
- Limits: ADR `0092`'s (2 per delegator per day, about 1 tTRUST a day overall, registered ERC-8004
  agents only), plus an allow-list. The funder calls the MultiVault and nothing else. This is the
  shape paymaster providers use (per-user cap, global cap, contract allow-list, alerts).
- `corroborationOf` (`packages/protocol/src/receipt.ts:367`) compares the receipt's `to` against the
  declarer. It must compare against the `receiver` instead, or every sponsored declaration reads as
  `other-caller`.

### 4. Revenue: x402 in USDC, paid by the agents that consult ARP

- The index, the MCP tools and the cron's off-chain facts sit behind x402. The standard is used:
  HTTP 402, a signed USDC authorisation, and a facilitator that settles it (Coinbase's, on Base;
  Base Sepolia while on testnet). No account is needed.
- Tools never pay.
- A subscription comes later, if at all. Its shape would be a pass bought once in x402, signed by
  ARP and bound to the agent's wallet. It would still need no account.
- **ARP buys the TRUST it spends and never sells or swaps any for anyone.** A sponsored amount is
  fixed and bounded, never proportional to a payment. x402 pays for the service, and sponsorship
  stays separate from it. A sponsorship proportional to the payment would make a USDC payment that
  returns redeemable TRUST look like a sale. That has to be checked with a lawyer before mainnet.
  tTRUST has no value.
- The number of paid calls is the measure of whether ARP is useful to agents.

### The amendments

**ADR `0045`.** Unchanged, and now held in a stronger form: no request passes through ARP at all,
not even through a hosted service. The unplug test still passes. With ARP down, every
agent-to-agent call completes, and an agent can still deposit from its own wallet. What it loses is
the sponsorship and the _proven_ label. Under ADR `0092` that is money, not a capability.

**ADR `0092`.** Its sponsor relay paid for publishing delegations. The funder here pays for
deposits too, under the same limits and on the same chain. `security.md`'s row for "ARP's own,
the sponsor relay, testnet 13579 only" extends to the funder. The mainnet row is unchanged.

**The receipt doctrine (ADR `0080` and the 13 sites).** "A receipt can only add, it never refuses"
becomes "a receipt is the condition of ARP's sponsorship and of the _proven_ label". An unproven
declaration is still indexed, as _declared_.

## Alternatives considered

- **ARP relays every agent-to-agent call.** That was the user's first sketch, and it was dropped by
  their own point 5. ARP would see every prompt, become a dependency for every call, and fail
  `docs/12`'s drift signal "ARP should host the endpoint agents are reached at".
- **ARP builds its own tunnel.** Cloudflare Tunnel and ngrok already do exactly this, and building
  one adds no value to ARP.
- **The funder sends TRUST to the agent's wallet.** Rejected by the user: it is a faucet to farm.
- **The funder deposits with itself as receiver.** The position would be ARP's, nothing would link
  it to the agent, and ARP's money would enter ARP's own figures (ADR `0046`).
- **Sponsor only the non-withdrawable part (creation fees).** This was proposed to stop farming.
  The user chose to allow withdrawal and to bound it by behaviour instead.
- **ARP as an MCP gateway**, so MCP calls carry a receipt. It would mean seeing requests, which
  point 5 excludes.
- **TRUST-native payments instead of x402 USDC.** The node already verifies a native payment (ADR
  `0083`). The user chose the standard for the revenue path.

## Consequences

**Positive:**

- ARP can say _proven_ for agent-to-agent calls without seeing a single request.
- No prompt ever reaches ARP, so the security surface is proofs, ids and context, which are signed
  and travel over HTTPS. No end-to-end encryption is needed for them.
- The agent owns its position and can leave it, so a change of experience is visible on the curves.
- ARP's revenue is measured by usage, and that measure is on chain.

**Negative:**

- The funder holds a hot key that signs with ARP's own funds, automatically. That is acceptable on
  testnet only, and it is bounded by the limits and the allow-list.
- An agent can still take its sponsored deposit out. The withdrawal rule limits how much, but does
  not prevent it.
- A direct MCP call stays a weak declaration until MCP servers sign receipts themselves or charge
  through x402.
- Two chains are involved: x402 settles on Base (Sepolia), and positions are on Intuition 13579.

**Neutral (worth knowing):**

- The MultiVault facts above come from the local checkout of `intuition-contracts-v2` at `2bb93d2`
  (2025-09-26): `approve` at `MultiVault.sol:362`, `deposit` at `:661-679`, `redeem` at `:805-826`
  (assets sent to the receiver at `:900`), and `_isApprovedToDeposit` at `:1591`. The deployed
  contract may differ. `createTriplesFor`, cited in arp-41's session, is not in that checkout.
  Re-read the deployed ABI before building.
- None of this is built. The hire receipt and the payment check exist (`apps/node/src/task.ts:202`,
  `packages/protocol/src/hire-receipt.ts`). So does the content receipt
  (`apps/mcp/src/content.ts:281`). The 402 answer, the handshake, the funder and the enforcer do not.

## References

- Related doc: `docs/12_THE_IDEA.md`, `docs/14_THE_WITNESS_PROBLEM.md`, `docs/22_RUNNING_THE_NODE.md`
- Related ADR: `0045`, `0046`, `0080`, `0083`, `0085`, `0093` (the probe), `0092`
- Related rule: `.claude/rules/security.md` (the signing table)
- The 13 sites of the receipt doctrine, as arp-34 listed them: `packages/protocol/src/receipt.ts:24`,
  `:356`, `:360`; `apps/mcp/src/handlers/declare.ts:28`, `:164`, `:217`;
  `scripts/verify/verify-content-route.ts:123`; `docs/tasks/31:235`; `docs/14:59`; `docs/22:281`;
  `.claude/STATE.md:261`; ADR `0080` lines 62 and 272. Re-grep by concept before editing: the exact
  phrase finds 2 of them.
