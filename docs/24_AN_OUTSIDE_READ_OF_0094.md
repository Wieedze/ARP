# 24 — An outside read of ADR 0094

**Status**: analysis, not commitment. Read it against ADR `0094`, which it questions. Nothing here
changes a decision until an ADR does.
**Date**: 2026-10-30

ADR `0094` closed with seven points its authors were least sure of: withdrawal farming, the receipt
enforcer, ARP as a signer, MCP calls, one operator with many agents, two chains, and the tunnel. This
document answers them from the outside, as a reviewer who had only the repo.

**One decision came out of it, and the user took it on 2026-10-30:** a sponsored amount stays below
the cost of the proof that unlocks it. ADR `0094` records it since commit `601bc66`.

---

## The finding that runs under four of the seven

**One operator can produce the "strong" proof alone.**

ADR `0094` line 67 said, until `601bc66` corrected it, "no single party can forge the agent-to-agent proof: the payment is on chain,
and the receipt is signed by the other side". That holds for a *party*. It does not hold for an
*operator* who runs both sides.

Agent A pays agent B, and B's node signs the hire receipt. The node checks that the payment is mined,
succeeded, went to its own address, cleared the floor, and came from the declared requester
(`apps/node/src/task.ts:202-224`). Nothing checks that A and B belong to different people, and nothing
can. The payment goes back to the operator who sent it, so the proof costs that operator gas.

The fix is the decision recorded above:

> **sponsored amount < cost of the proof, fees included.**

Above that line, producing a proof is a way to earn money. Below it, there is no profit in faking one.
Every other lever in this document is secondary to this one.

---

## 1. Withdrawal farming

ADR `0094` §3: past a threshold of what it was sponsored, an agent stops being sponsored.

- **A per-agent threshold resets with a new identity.** Anyone can mint into the canonical ERC-8004
  registry: `register()` simulates from an arbitrary address (`scripts/measure/registry-mintability.ts`,
  measured 2026-10-21). A cap per identity is a cap per mint.
- **What the farmer earns** is the sponsored amount, less what the MultiVault keeps on entry and exit,
  less the proof's cost. The proof's cost is the term ARP controls, which is why the cap above
  matters more than the threshold. Read the fees from the deployed contract and do not assume them
  (`portability.md`, "Read it from the chain").
- **A better signal is holding time, not share withdrawn.** A deposit pulled within N blocks is a
  hit-and-run. A position exited after weeks, from a tool that degraded, is the signal ADR `0094`
  wants to keep.
- **Reputation is not at risk here, money is.** Withdrawn shares leave the vault, so they leave
  the figure.

## 2. The receipt enforcer

ADR `0094` line 72: later, a caveat enforcer checks a signed receipt passed in the redemption.

- **Gas is not the issue.** One `ecrecover` plus EIP-712 hashing is cheap, even with the `string`
  field in the hire receipt's struct.
- **Bind the receipt to the execution.** The receipt has to commit to the `termId`, the `receiver`
  and the amount. Otherwise a valid receipt funds a deposit on any vault.
- **The enforcer cannot know which key to expect.** The node binding is a triple on Intuition
  (ADR `0094` line 54), and the agent's wallet is on the ERC-8004 registry, which in production is
  on Base. A contract on the deposit chain reads neither. In practice it will trust one attester
  key, and that key is ARP's, which is question 3 again.
- **Replay.** Store the receipt's hash as consumed in `beforeHook`. If the execution reverts, the
  write reverts with it, so there is nothing else to handle.
- **Key rotation.** Include `issuedAt` and a short expiry. Without them, a receipt signed by a
  revoked key verifies for as long as anyone holds it.
- **Signatures.** Use OpenZeppelin's ECDSA, which rejects high-`s` signatures, and support EIP-1271
  if the signer may be a smart account.
- **The enforcer's real value is elsewhere.** If the delegator is ARP's treasury, the enforcer bounds
  what a stolen sponsoring key can spend. The negative consequence ADR `0094` names, a hot key
  signing ARP's funds automatically, is exactly what that bound addresses.

## 3. ARP as a signer

ADR `0094` line 64: for a skill fetched through ARP, ARP's content receipt is the proof.

- **ARP issues the proof, verifies it, and pays on it.** That is in tension with ADR `0046` (ARP
  scores nobody), because ARP's own signature becomes the input to an ARP-funded position.
- **A TEE or a second signer is premature.** There is a free second party: **each content receipt
  names the x402 settlement transaction that paid for the fetch.** The facilitator is a third party
  and the settlement is on chain, so ARP cannot issue a receipt without a matching payment. Publish
  the receipts issued, and anyone can compare the two counts.
- **The cap applies here too.** If the sponsored amount exceeds the price of the fetch, a fetch is a
  discounted purchase of TRUST: USDC in, a redeemable position out. That is the "not an exchange" risk
  ADR `0094` §4 already flags for a lawyer.

## 4. MCP calls

ADR `0094` line 65: a direct MCP call is "weak", the runtime hook only.

- **Without a proxy, the only possible second party is the MCP server itself.** Two realistic routes:
  1. a signed receipt in the response's `_meta`, offered to servers as SDK middleware;
  2. the server charges through x402, and the payment is the proof.
- **zkTLS (TLSNotary)** proves an HTTPS exchange with a server without its cooperation and without a
  proxy. It is research-grade, and it does not reach stdio servers.
- **Keeping "weak" is right** until one of the routes above exists.

## 5. One operator, many agents

- **Not a money problem on testnet**, since tTRUST has no value.
- **A data problem now.** Figures of "N distinct agents" produced on testnet can be inflated, and the
  metric chosen now is the one that ships to mainnet. The identity cost is zero (question 1).
- **ARP's own gas drop erases the usual clustering signal.** ADR `0094` §3 sends every registered
  agent the gas for one transaction. After that, every wallet has the same funding source, ARP, so
  funding-graph clustering stops working.
- **What holds up:** show sponsored and self-funded deposits separately, and weight by the agent's
  own money. A fleet of wallets costs its operator real TRUST on the second figure, and nothing on
  the first.

## 6. Two chains

ADR `0094` line 167: x402 settles on Base Sepolia, positions are on Intuition 13579.

- **The split is right in principle.** It rehearses the production shape, with identity on Base and
  staking on 1155 (`portability.md`, point 2).
- **The verifier needs two RPCs and two finality rules.** A payment can still reorg on one chain while
  the deposit lands on the other.
- **No contract on 13579 sees a payment on Base.** A proof built on an x402 payment can only be
  checked off chain, which limits what the enforcer in question 2 can hold.
- **The payer and the receiver need a signed link.** A smart account does not necessarily have the
  same address on both chains, so the address that paid on Base and the `receiver` on 13579 must be
  tied by a signature.

## 7. The tunnel

ADR `0094` line 44: the node gets its public address from Cloudflare Tunnel or ngrok.

- **Acceptable, if the handshake binds a URL and not a provider.** Then a tunnel, a public IP and a
  reverse proxy all work, and ARP builds nothing more.
- **Free ngrok URLs change on every restart.** If the URL is in the triple, every restart is an
  on-chain write. Put the node's key in the triple instead, and serve the current URL off chain,
  signed by that key.
- **The tunnel provider sees the prompts.** Cloudflare terminates TLS, so it sees the traffic in
  clear. "ARP never sees a prompt" stays true. `docs/22_RUNNING_THE_NODE.md` should say who does.

---

## What to do with this

| Point                                    | Proposed action                                                 |
| ---------------------------------------- | --------------------------------------------------------------- |
| sponsored < proof cost                   | **done**: decided by the user 2026-10-30, in ADR `0094` since `601bc66` |
| line 67, "no single party can forge"     | **done**: struck through and corrected in ADR `0094`, `601bc66` |
| content receipt                          | name the x402 settlement tx in it                               |
| receipt enforcer                         | commit to `termId`, `receiver`, amount; `issuedAt` + expiry      |
| withdrawal                               | measure holding time rather than share withdrawn                |
| reputation figures                       | separate sponsored from self-funded                             |
| handshake                                | bind the node key, not the URL                                  |
| `docs/22_RUNNING_THE_NODE.md`            | name the tunnel provider as a party that sees requests          |

## What came of it

The cap made one problem visible. A self-dealt payment comes back to the operator, so applied to a
deposit paid up front, the cap leaves agent-to-agent sponsorship at about the price of gas. The user
chose a different shape on 2026-10-30, in ADR `0099`. The agent deposits its own TRUST with a proof,
and once the position has been held for T, ARP adds `r ×` that deposit. `r` stays below the
MultiVault's round-trip fees, so a forged proof loses money. It replaces the withdrawal threshold
in points 1 and 5.

The user then deferred it the same day. On testnet everything with a proof is sponsored, because
asking agents to buy TRUST on an L3 is too much friction. ADR `0099`, the cap and the withdrawal
threshold wait for mainnet. There, the user leans toward x402 USDC in, a TRUST sponsorship below
the x402 price.
