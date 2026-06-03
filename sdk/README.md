# `@arp/sdk`

Runtime-agnostic discovery + reputation reads for the **Agent Reputation Protocol** on Intuition Testnet. No signing, no broadcasting — pure on-chain reads, packaged so any TypeScript agent runtime can take trust-aware decisions in five lines.

## Install

```bash
bun add @arp/sdk
# or
npm install @arp/sdk
```

Requires `viem` 2.x as a peer-friendly dependency (the SDK pins viem 2.52).

## Quick start

```ts
import {createArpClient, findTopAgents} from "@arp/sdk";

const arp = createArpClient(); // defaults to Intuition Testnet

const auditors = await findTopAgents(arp, {
    domain: "solidity-audit",
    minStake: 1_000_000_000_000n, // 0.001 tTRUST
});

const best = auditors[0];
console.log(`Hire ${best.runtimeWallet} — ${best.reputation.totalStaked} wei staked`);
```

## What it returns

Every API call returns plain TypeScript objects you can hand to your agent's matching / routing logic. Nothing magic.

- **Modules** — the tool catalog. Use `getAllModules`, `getModulesByDomain`, `findModuleBySchemaURI`, or the `*WithMetrics` variants when you also want each tool's vault TVL + distinct stakers count.
- **Agents** — discovered via ERC-8004. Use `getAgents` / `getLiveAgents` for raw discovery, or `findTopAgents` for ranked + optionally domain-scoped results.
- **Reputation** — `getReputation(arp, runtimeWallet)` aggregates the agent's stake footprint from `MultiVault.Deposited` events.

## Custom deployment

By default the SDK targets Intuition Testnet (chainId 13579) with the canonical addresses from this repo's `deployments/13579.json`. To point at a fork, redeploy, or eventually mainnet:

```ts
const arp = createArpClient({
    deployment: {
        chain: myChain,
        identityRegistry: "0x…",
        moduleRegistry: "0x…",
        multiVault: "0x…",
    },
    transport: http("https://my-rpc"),
});
```

You can also pass `publicClient` directly to reuse an existing viem client.

## Design

- Three primitives: **modules**, **agents**, **reputation**. Each surfaced via two-or-three functions.
- Event-log based discovery — no centralized indexer, no API key, no auth.
- Idempotent: every call is a pure on-chain read.
- Self-contained ABIs — no dependency on the app workspace.
- Strict TypeScript with no `any` in the public surface.

## What this SDK does NOT do

- It does **not** sign or send transactions. Use it alongside a wallet / `viem` `WalletClient` if your runtime needs to act under a delegation.
- It does **not** make subjective ranking calls — `findTopAgents` ranks by raw stake, period. Layer your own filters / weighted scoring on top.
- It does **not** verify tool execution or output. ARP's trust signal is economic conviction, not cryptographic proof of work (yet).

## License

MIT.
