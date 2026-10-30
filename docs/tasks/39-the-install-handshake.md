# Task 39 — The install handshake: a rented tunnel, and the node bound to its ERC-8004 token

**Status:** **PLAN**, 2026-10-30. Not started. Replaces task 33e (the node, opt-in), whose node
listened on every interface and ran in the foreground.
**ADR:** `0094` §1.
**Required skills:** `intuition`.
**Rules:** `code.md`, `security.md`, `portability.md`, `claims.md`, `workflow.md`.
**Reviewers:** `intuition-integrator`, then `task-verifier`.
**Proposed owner:** arp-41 (it owns `apps/cli` and asked to rewrite 33e on 0094).

---

## 1. Why

An agent has to be reachable without its operator opening a port, and ARP has to know which node
speaks for which agent without carrying the traffic. ERC-8004 checks neither: the registry does not
test that an endpoint answers.

## 2. Deliverables, in order

### 39a — The node is reachable through a tunnel the operator rents

- `arp node` starts behind an existing tunnel (Cloudflare Tunnel or ngrok), detected or configured,
  and prints the public URL it got. ARP builds no relay.
- The node binds to localhost only. The tunnel is the one way in.

### 39b — The handshake, three steps

1. The node generates its key (kept with the operator, never sent) and sends ARP the agent id
   (chain, registry, token id) and its public key.
2. ARP reads the token's owner from the registry and returns a challenge: nonce, expiry, chain id.
3. The owner signs the challenge in the shape of Sign-In with Ethereum (EIP-4361). ARP checks the
   signer owns the token, then binds the node key to the agent.

Replay: the nonce is single-use, the expiry is short, the chain id is in the message. A transfer of
the token voids the binding until a new handshake.

### 39c — The binding on Intuition

- A triple from the agent's identity atom to its endpoint, with the signed challenge pinned to IPFS
  and attached by `in context of`. Anyone can re-check it against the registry without ARP.
- **The predicate is read from the graph before one is minted** (`portability.md`). `reachable at`
  is a placeholder. Record the chosen id in `data/deployments/13579.json`.
- The write is planned in `packages/protocol` and never signed there (ADR `0038`).

### 39d — The directory serves the endpoint

- A read that returns an agent's endpoint from the binding. The call then goes agent to agent.
  ARP never relays it.

## 3. Do not do in this task

- No relay of agent-to-agent traffic. That is the drift signal in `docs/12`.
- No mainnet. Testnet 13579 only.
- No tunnel built by ARP.

## 4. Evidence ladder

Rated → staked: an endpoint bound by a signature the reader can re-check is the identity the
_proven_ path (task 40) needs.
