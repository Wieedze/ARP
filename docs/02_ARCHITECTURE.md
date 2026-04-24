# 02 — Architecture

These are **locked decisions**. If you believe one is wrong, flag it explicitly before implementing something different.

## Storage pattern: single source of truth + derived projections

ARP does not dual-write. Each piece of data has exactly one canonical source. Derived outputs are computed deterministically by indexers, not stored redundantly.

| Data | Canonical source | Notes |
|---|---|---|
| Evaluation modules (ontology, schemas) | Intuition atoms | Native fit. No ERC-8004 mirror. |
| Raw attestations (agent stake + prediction) | ERC-8004 Reputation Registry | Standard-native. All explorers read it. |
| Calibrated scores (per agent, per domain) | **Not stored** — derived by indexer | `algo + input = result`. Reproducible. |
| On-chain composability anchor | Merkle root checkpoint, periodic | Single periodic write, not per-score. |

### Why this pattern

Dual-writing the same data to two bases is an antipattern. Even well-engineered systems drift, and reconciliation logic becomes its own source of bugs. On a blockchain, every redundant write also costs gas.

Modern web3 infrastructure (Lens, EAS, Farcaster, The Graph) converged on the "indexer-as-truth for derived data" pattern. ARP follows suit.

### Implications for future ZK work

The Merkle root checkpoint is a placeholder for a more rigorous primitive: a ZK proof that the indexer ran the calibration algorithm correctly on the canonical inputs. Noir (Aztec) is the target framework. This is out of scope for the MVP but the Merkle pattern is designed to be replaced without migration.

## The four components of ARP (full protocol)

The complete ARP protocol has four components. **This MVP builds only component 1**.

1. **Module Registry** — on-chain contract where evaluation modules are registered. Each module defines a domain (e.g. "solidity-audit") and a schema for what an attestation in that domain looks like.
2. **Admission Contract** — verifies an ERC-8004 `agentId` exists before admitting an agent to ARP. Extension of the standard, not a parallel registry.
3. **Reputation Loop** — agent stakes TRUST on an attestation, attestation is written via ERC-8004's `postFeedback`, indexer updates the derived score.
4. **Forked Indexer** — consumes ERC-8004 events + Intuition atoms + module definitions. Outputs calibrated scores, queryable via API.

## SDK interface (target shape, for future work)

The SDK will expose three classes of methods. Each writes to exactly one canonical source.

```typescript
// Read
arp.getScore(agentId: bigint, domain: string): Promise<Score>
arp.getMerkleProof(agentId: bigint, domain: string, block: bigint): Promise<Proof>
arp.listModules(domain?: string): Promise<Module[]>

// Write (each method = one write, one source)
arp.registerModule(domain: string, schema: ModuleSchema): Promise<TxHash>
  // → Module Registry contract + Intuition atom
arp.registerAgent(metadata: AgentMetadata): Promise<AgentId>
  // → ERC-8004 Identity Registry mint
arp.stakeAndAttest(url: string, prediction: Prediction, amount: bigint): Promise<TxHash>
  // → ERC-8004 Reputation Registry postFeedback
```

This MVP implements the write path for `registerModule` only, and a read path for `listModules`. The other methods are documented here for architectural coherence but not implemented.

## ERC-8004 integration points

This MVP touches ERC-8004 indirectly — we do not call its contracts in the first iteration. The Module Registry stores a reference to the domain and schema; ERC-8004 agents will later cite modules when posting feedback.

However, the Module Registry must be **compatible with future ERC-8004 consumers**:
- Module IDs should be stable and globally addressable
- Module schemas should be publishable URIs (IPFS preferred)
- The registry address should be deterministically derivable (CREATE2 recommended for mainnet)

## Intuition integration points

Each on-chain module registration is **mirrored as an Intuition atom** at registration time. This is the one exception to the "no dual-write" rule and it is justified because:

- The on-chain registry is the canonical source of the module's existence and ownership
- The Intuition atom is an enrichment that exposes the module to the semantic graph — it is read-only from ARP's perspective
- The atom creation happens within the same user transaction flow (frontend orchestrated), so atomicity is reasonable

The atom schema:
- Type: `ARP_MODULE`
- Predicate links: `module → hasDomain → domain`, `module → hasSchema → schemaURI`, `module → createdBy → address`

Refer to the Intuition skill for actual atom creation APIs. Do not hardcode Intuition endpoints.

## Naming conventions

- Contracts: `PascalCase` (e.g., `ModuleRegistry.sol`)
- Functions: `camelCase` (e.g., `registerModule`)
- Events: `PastTense` (e.g., `ModuleRegistered`)
- TypeScript types: `PascalCase`, prefixed with `Arp` when ARP-specific (`ArpModule`, not `Module`)
- React components: `PascalCase`, feature-namespaced folders

## Test coverage bar

- Solidity: 100% of public/external functions, all state transitions, all revert paths
- TypeScript: unit tests for hooks and data transformations. UI components are visually reviewed, not unit-tested for MVP.

## What is not in this architecture

Explicitly not addressed in this document:
- TRUST token staking mechanism (component 3 of full ARP)
- Calibration algorithm (the differentiation — spec comes separately)
- Validation Registry integration
- Cross-chain module registration
- DAO governance of the registry

These are out of scope for the MVP and will be specified when their time comes.
