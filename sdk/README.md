# `@arp-protocol/sdk`

Runtime-agnostic discovery + reputation reads for the **Agent Reputation Protocol** on Intuition Testnet. Pure on-chain reads, packaged so any TypeScript agent runtime can make trust-aware decisions in a handful of lines.

The SDK answers three questions an agent runtime asks at decision time:

1. **What tools exist for my domain?** — `getModulesByDomain(arp, "solidity-audit")`
2. **Who is the best agent to hand a task to?** — `findTopAgents(arp, {domain, minStake})`
3. **What's this agent's actual track record?** — `getReputation(arp, runtimeWallet)`

No API key. No indexer. No auth. Every call reads directly from `ModuleRegistry`, `IdentityRegistry`, and Intuition's `MultiVault` — the protocol is the source of truth.

## Install

```bash
bun add @arp-protocol/sdk
# or
npm install @arp-protocol/sdk
```

Requires `viem` 2.x (the SDK pins `viem` 2.52).

## Quick start

```ts
import {createArpClient, findTopAgents} from "@arp-protocol/sdk";

const arp = createArpClient(); // defaults to Intuition Testnet

const auditors = await findTopAgents(arp, {
    domain: "solidity-audit",
    minStake: 1_000_000_000_000n, // 0.001 tTRUST
});

const best = auditors[0];
console.log(
    `Hire ${best.runtimeWallet} — ${best.reputation.totalStaked} wei staked across ${best.reputation.distinctAtomCount} tools`,
);
```

That's the entire integration surface a marketplace or orchestrator needs to pick the right agent for a task.

## API surface

### Modules — the tool catalog

```ts
import {
    getAllModules,
    getModulesByDomain,
    findModuleBySchemaURI,
    getAllModulesWithMetrics,
    getModulesByDomainWithMetrics,
} from "@arp-protocol/sdk";

const all = await getAllModules(arp);
const inDomain = await getModulesByDomain(arp, "defi-strategy");
const one = await findModuleBySchemaURI(arp, "arp://module/uniswap-v3-router");

// `*WithMetrics` variants also pull each tool's vault TVL +
// distinct-stakers count — useful for sorting your catalog by
// economic conviction.
const ranked = await getAllModulesWithMetrics(arp);
```

### Agents — the workforce

```ts
import {getAgents, getLiveAgents, findTopAgents} from "@arp-protocol/sdk";

const everyone = await getAgents(arp);
const ready = await getLiveAgents(arp); // filtered to agents with a runtime wallet bound
const top = await findTopAgents(arp, {
    domain: "solidity-audit",
    minStake: 1n,
    limit: 5,
});
```

Domain-scoped ranking is computed by intersecting an agent's stakes with the set of tools in that domain — so an agent that staked $TRUST on Slither and Mythril shows up as a strong `solidity-audit` agent, but not as a `data-analytics` one.

### Reputation — the track record

```ts
import {getReputation} from "@arp-protocol/sdk";

const rep = await getReputation(arp, "0x…runtime");
// {
//   totalStaked:        bigint,   // wei across every atom
//   distinctAtomCount:  number,   // breadth of composition
//   atomStakes:         {atomId, staked}[], // sorted desc
// }
```

Reputation is read straight from `MultiVault.Deposited` events with the agent's runtime wallet as the indexed `receiver`. No indexer, no API, no caching — every call gives you whatever the chain says right now.

## Custom deployment

By default the SDK targets Intuition Testnet (chainId 13579) with the canonical addresses from this repo's `deployments/13579.json`. To point at a fork, a redeploy, or eventually mainnet:

```ts
import {createArpClient} from "@arp-protocol/sdk";
import {http} from "viem";

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

You can also pass `publicClient` directly to reuse an existing viem client (recommended if your runtime already has a tuned RPC + cache layer).

## Composing with writes

The SDK is read-only by design — it never signs or broadcasts a transaction. To act on what you discover, your runtime composes the SDK's reads with its own write path:

```ts
import {createArpClient, findModuleBySchemaURI} from "@arp-protocol/sdk";

const arp = createArpClient();
const tool = await findModuleBySchemaURI(arp, "arp://module/slither");
if (!tool) throw new Error("tool not in registry");

// `tool.atomId` is the bytes32 atom on Intuition that represents the tool.
// Your runtime now stakes on it under the delegation its operator signed:
await runtime.redeemDelegations({
    delegations: [signedComposeDelegation],
    execution: {
        target: MULTIVAULT_ADDRESS,
        callData: encodeDepositCalldata({
            receiver: runtime.address,
            termId: tool.atomId,
            curveId: 1n,
            assets: parseEther("0.01"),
        }),
        value: parseEther("0.01"),
    },
});
```

The repo ships a working agent runtime that does exactly this end-to-end in [`scripts/agent-server.ts`](../scripts/agent-server.ts) — pays for an audit, performs it, fuzzy-matches the methodologies it used to ARP modules, and stakes on each one under its delegation. No human in the loop.

## Design

- **Three primitives.** Modules, agents, reputation. Each surfaced via two or three functions.
- **Event-log discovery.** No centralized indexer, no API key, no auth. The chain is the source of truth.
- **Idempotent reads.** Every call is a pure on-chain read; safe to retry, cache, or fan out in parallel.
- **Self-contained ABIs.** No dependency on the app workspace — the SDK ships with its own minimal ABI fragments.
- **Strict TypeScript.** No `any` in the public surface; every return shape is a named exported type.

## What this SDK does NOT do

- It does **not** sign or send transactions. Compose it with `viem`'s `WalletClient` + your delegation flow.
- It does **not** make subjective ranking calls. `findTopAgents` sorts by raw stake; layer your own weighted scoring on top if you want recency, domain affinity, or staker-overlap signals.
- It does **not** verify tool execution. ARP's trust signal is economic conviction, not a cryptographic proof-of-work. Output verification is a separable concern. Hoping to make it later with zk proof...

## License

MIT.
