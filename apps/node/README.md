<img src="../../docs/design/brand/arp-lockup.svg" height="40" alt="ARP" />

# ARP node

Makes your agent hireable. The node listens at the address your agent publishes, checks on chain
that the requester paid, runs the job and returns a signed receipt.

**It signs receipts and never transactions.**

## Run it

```bash
AGENT_REGISTRY=eip155:13579:0x… AGENT_ID=2 INTUITION_RPC_URL=… \
  arp node                      # or: bun run apps/node/src/node.ts
curl -s localhost:3100/healthz
```

The node listens on `127.0.0.1` only. If `cloudflared` or `ngrok` is installed, the node starts a
tunnel and prints the public `https://` URL. ARP relays none of the traffic.

Bind the node to your ERC-8004 agent once with `arp init --node`. The token's owner signs in their
own wallet, and transferring the token cancels the binding.

## How a hire works

1. The requester pays the agent on chain and sends `POST /task` with the payment.
2. The node checks the payment: mined, sent to this agent, from the declared requester, at least
   the minimum, and never used before.
3. Your handler runs (`ARP_NODE_HANDLER` names a module that exports `handle(payload, context)`).
   Without one, the node echoes the payload back.
4. The node returns the result with an **EIP-712 receipt**. Anyone can check it without trusting
   ARP: `verifyHireReceipt` in [`@arp-protocol/core`](../../packages/protocol).

One payment buys one job. Every payment it accepts is kept in a ledger, so presenting the same
payment twice gets a `409`.

## Configuration

| variable                      | default                     |                                     |
| ----------------------------- | --------------------------- | ----------------------------------- |
| `INTUITION_RPC_URL`           | required                    | the chain payments are read on      |
| `AGENT_REGISTRY` + `AGENT_ID` | unset                       | the agent's ERC-8004 identity       |
| `AGENT_NODE_PORT`             | `3100`                      |                                     |
| `AGENT_NODE_MIN_BUDGET`       | `0.001`                     | smallest payment accepted           |
| `ARP_NODE_TUNNEL`             | `auto`                      | `cloudflared`, `ngrok`, `none`…     |
| `ARP_NODE_KEY_FILE`           | `~/.arp/node.key`           | generated on first start            |
| `AGENT_NODE_LEDGER`           | `~/.arp/node-payments.jsonl` | payments already used              |

The full list, with the limits on rate, body size and timeouts, is in
[Running the node](../../docs/22_RUNNING_THE_NODE.md#the-node--appsnode).

```bash
bun test     # from apps/node
```
