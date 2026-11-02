# 0105 — x402 on the official packages, off by default, settled after the work

**Status:** Proposed. x402 in USDC, everything sponsored on testnet and no subscription are the
user's decisions (ADR `0094` §4 and its testnet amendment); the shape below is task 41's.
**Parked for the mainnet port.** Written as `0102` in a session before the user deferred task 41
(ADR `0102` on `dev`, "x402 waits for mainnet, consulting ARP is free on testnet", 2026-11-02), and
renumbered so the two never share a number. Nothing here is merged; the branch keeps the work for the
port.
**Date:** 2026-11-02
**Triggered by:** `docs/tasks/41-x402-in-usdc.md`.

## Context

ADR `0094` §4 makes agents pay ARP per call in USDC through x402, Base Sepolia while on testnet,
with no account. The task file adds a user decision of 2026-10-30: depend on the official x402
packages, not a hand-rolled 402, and ask before guessing if the testnet facilitator needs an API key.

What was read on 2026-11-02, before any code:

- **Packages.** The repository is now `x402-foundation/x402` (the `repository` field of `@x402/core`
  on npm, 2026-11-02; the task file names `coinbase/x402`). The TypeScript packages are `@x402/core`,
  `@x402/evm` and per-framework adapters (`@x402/fetch`, `@x402/hono`, `@x402/express`, `@x402/mcp`,
  …, as its README lists them). The v1 packages (`x402`, `x402-fetch`, `x402-hono`) have 1.2.0, of
  2026-04-16, as their latest.
  `@x402/core` and `@x402/evm` 2.29.0 were published 2026-10-28, five days earlier; **2.28.0**
  (2026-09-29) is the version taken, the newest more than two weeks old. Its `zod` is `^3.24.2`, so
  the workspace's hoisted `zod` moved from 4.4.3 to 3.25.76 and `eslint-plugin-react-hooks` keeps
  its own 4.4.3 (`bun.lock`).
- **The facilitator needs no API key.** `curl -s https://x402.org/facilitator/supported`, unauthenticated,
  answered 200 and listed `{"x402Version":2,"scheme":"exact","network":"eip155:84532"}`.
  docs.x402.org (`dev-tools/facilitators.md`) says it "requires no setup" and is "not intended for
  mainnet routes". `https://x402.org/facilitator` is also the URL `@x402/core`'s README uses.
- **USDC on Base Sepolia** is `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, the default asset
  `@x402/evm` 2.28.0 prices a `$` amount in on `eip155:84532` (its `defaultAssets` table), and the
  address docs.x402.org lists.

## Decision

1. **The gate is `@x402/core`'s `x402HTTPResourceServer` with `@x402/evm`'s `exact` scheme.** What
   ARP wrote is the adapter from a WHATWG `Request` to its `HTTPAdapter` and from its
   `HTTPResponseInstructions` to a `Response` (`packages/protocol/src/x402/gate.ts`), because both
   of ARP's servers are hand-rolled fetch handlers and the server adapters ship per framework.
   Headers, encoding, price conversion, verification and settlement are the package's.
2. **A subpath with optional peers.** `@arp-protocol/core/x402`, with `@x402/core` and `@x402/evm`
   optional peer dependencies of the package and plain dependencies of `apps/mcp` and `apps/node`.
   A consumer that never charges never loads them, the same arrangement as
   `@metamask/smart-accounts-kit`.
3. **Off unless configured, by an address and a price, both stated.** `<PREFIX>_PAY_TO` turns it on;
   `<PREFIX>_PRICE` is then required, because a default price would be a number nobody chose.
   The prefix is `ARP_X402` for the MCP server and `AGENT_NODE_X402` for the node, one parser for
   both. An operator running their own MCP server charges nobody unless they decide to (ADR `0045`).
4. **Base Sepolia only.** Any other network is refused at start, mainnet Base included: a mainnet
   facilitator is an open decision, and the public one says it is not for mainnet. The chain
   constants live in `packages/protocol/src/arp/x402.ts`, the namespace allowed to name a chain.
5. **Settled after the work, and only when something was served.** The `exact` scheme's default
   `authorization` flow: verify, run, settle. A response at 400 or above is not settled. On the MCP
   server a JSON-RPC error inside an HTTP 200 is not settled either, so "unknown tool" costs
   nothing. A settlement that fails withholds the answer.
6. **What is priced on the MCP server:** every `tools/call` and every `GET /content/:atomId`, over
   HTTP. **Free:** the info document, which states the price, and the JSON-RPC handshake
   (`initialize`, `tools/list`, `ping`, notifications); a client that cannot list what it would pay
   for cannot decide to pay. stdio is never gated: nobody is on the other end to pay.
7. **The node keeps its native rail.** A `POST /task` naming a `paymentTxHash` is the native path,
   unchanged. One naming none, with x402 on, is the x402 path. The ledger keys on the keccak256 of
   the payment header, since the settlement transaction does not exist while the handler runs, and
   the handler's `TaskContext` gains `rail` with `paymentTxHash: null` on x402. The hire receipt's
   `payment` is the settlement transaction and its domain `chainId` is 84532, where that
   transaction is.
8. **The count is of settled calls, per UTC day and route, in an append-only file**
   (`PaidCallCounter`), the device `PaymentLedger` and `apps/sponsor` already use. Each row carries
   the settlement transaction that backs it. The MCP server publishes the counts in its info
   document under `x402.paid_calls`; the node keeps its file and publishes only its terms.
9. **`x402Support` in a registration file is computed** by `x402SupportOf` from the node's info
   document: true only when it states `exact` terms with a CAIP-2 network, an address and a price.

## Alternatives considered

- **A hand-rolled 402.** Refused by the user's decision on 2026-10-30.
- **`@x402/hono` or `@x402/express`.** Neither server uses a framework, and adopting one to get an
  adapter would replace two working transports to save two short functions.
- **`@x402/mcp`**, payment in the MCP `_meta` field. It is built for servers on the MCP SDK; this
  server hand-rolls JSON-RPC (`apps/mcp/src/server.ts`). An HTTP 402 is what an x402-aware HTTP
  client already handles. Whether MCP clients handle a 402 on `tools/call` is not measured here.
- **`upfront` settlement on the node**, matching the native rail, where the payment is mined before
  the work. Rejected: a handler that fails would leave the requester charged for nothing, and the
  `exact` scheme has no refund.
- **2.29.0.** Five days old on the day of the choice.
- **Default price.** Rejected for the reason in item 3.

## Consequences

**Positive:**

- The number of paid calls exists as a file of settled transactions, re-derivable by anyone holding
  it, and the MCP server publishes it.
- Nothing about the wire format is ARP's: an x402 client from any vendor pays these routes.
- With the variables unset, both servers behave exactly as before.

**Negative:**

- **A content receipt is still not bound to its payment.** ADR `0096` says task 41 turns the content
  proof on "by binding a fetch to its x402 settlement". It does not: the receipt's signed fields are
  unchanged, and the settlement rides only in the `PAYMENT-RESPONSE` header. And binding it would
  meet ADR `0096` item 1, which prices a proof only on the chain of the deposit: USDC on 84532 is
  not in the unit of a deposit on 13579. That is a decision for the user, not a default.
- An x402-paid hire receipt is refused by the sponsoring service for the same reason. It says
  truthfully where its payment is; nothing yet prices it.
- Every `tools/call` is priced, the two planners included. Charging an agent to prepare a
  declaration may deter the declarations that are the signal (`docs/12` point 3). ADR `0094` names
  "the MCP tools" without an exception, so none was made; the user may want one.
- The facilitator is a third party in the path of a paid call, by the design of x402. With it down,
  a paid route answers nothing; the free ones are unaffected.

**Neutral (worth knowing):**

- Two chains: USDC settles on Base Sepolia 84532, positions are on Intuition 13579.
- No transaction was sent and no key was used to build or test this. Tests sign USDC authorisations
  offline with keys generated per test, and the facilitator is an in-memory fake.
- `scripts/measure/node-outbound.ts` gained the four x402 modules and stopped labelling the listener
  `serveFetch(` as outbound. Both changes are in `data/measurements/node-outbound-2026-11-02.json`.

## References

- Related doc: `docs/12_THE_IDEA.md`, `docs/22_RUNNING_THE_NODE.md`, `docs/tasks/41-x402-in-usdc.md`
- Related ADR: `0045`, `0094`, `0096`, `0101`
- Related rule: `.claude/rules/portability.md`, `.claude/rules/claims.md`
