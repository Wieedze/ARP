# 0008 — ARP module `schemaURI` and Intuition atom URI are the same Intuition-pinned Thing

**Status:** Accepted
**Date:** 2026-06-01
**Triggered by:** Task 03 Phase B implementation. The original task spec (`tasks/03-deploy-and-seed.md`) assumed external IPFS pinning via Pinata for the JSON Schema, and a separate Intuition atom for each module's identity. The user pointed at the Intuition skill (`.claude/skills/intuition/reference/schemas.md`) which exposes a native `pinThing` GraphQL mutation. After review of the API shape, "Option A" — collapse the two URIs into one — was chosen and is now load-bearing for the rest of the protocol.

## Context

ARP couples on-chain state to the Intuition knowledge graph at the module level:

- The on-chain `ModuleRegistry.Module` struct has a `schemaURI` field — an `ipfs://` URI per the contract's validator. The contract treats it as opaque bytes; the URI is consumed off-chain (by the UI, by an indexer, by an attesting agent) to retrieve the attestation shape.
- The Intuition atom for the module is a separate artifact: it represents the module's identity in the knowledge graph. Atoms are created via `MultiVault.createAtoms([atomData])`; the `atomData` is `stringToHex(uri)` of an `ipfs://` URI that points at structured metadata.

The original Task 03 spec implied two distinct artifacts:
1. A pinned **JSON Schema** (e.g., `solidity-audit.v1.json`) — uploaded to Pinata, URI used as `schemaURI` on-chain.
2. A separate Intuition atom for the module's identity, distinct URI.

The Intuition skill's native `pinThing` mutation pins a `{name, description, image, url}` shape — designed for atom metadata. It does NOT pin arbitrary JSON files. So forcing through Pinata for the JSON Schema would have required:
- A Pinata account + JWT (new external dependency, new env var, new failure mode).
- An additional upload step (extra moving part in the deploy pipeline).
- Two separate IPFS reads at the UI layer (one for schema, one for atom metadata).

## Decision

The on-chain `schemaURI` and the Intuition atom URI are the **same** `ipfs://` URI, returned by **a single `pinThing` mutation** at seeding time. The pinned Thing carries the module's identity:

```
{
  name:        "ARP Module — Solidity Audit",
  description: "Reputation domain for Solidity contract security attestations. …",
  image:       "",
  url:         ""
}
```

The 40-line JSON Schema (`schemas/solidity-audit.v1.json`) is **kept in the repo as developer reference** — canonical source of truth for the attestation shape, used by future UI work, by attesting-agent implementors, and for schema-version diffs. It is **not pinned to IPFS** and is not the artifact that the on-chain `schemaURI` points at.

The flow at deploy time (implemented in `scripts/seed.ts`):

1. Call `pinThing(name, description, image="", url="")` on Intuition's GraphQL → receive `ipfs://bafkrei…` URI.
2. Call `ModuleRegistry.registerModule(name, "solidity-audit", URI, description)` on-chain — `URI` lands in the `schemaURI` field.
3. Call `MultiVault.createAtoms([stringToHex(URI)], [atomCost])` — the atom data is the same URI, so the atom's identity URI matches `schemaURI`.

Verification: the module record's `schemaURI` and the corresponding atom's URI in `deployments/13579.json` are byte-identical.

## Alternatives considered

- **Pin the JSON Schema to Pinata, separate Intuition atom URI** (the original spec). Rejected — new external dependency (Pinata JWT), new env var, two URIs to keep in sync, no real consumer of a pinned-schema-vs-pinned-Thing distinction in the MVP.
- **Pin JSON Schema via Intuition `pinThing` by stuffing the schema into `description`**. Rejected — abuses the field's semantic (it's for human-readable text), hits the eventual length limit, and breaks the GraphQL contract semantically.
- **No on-chain `schemaURI` at all** (move it to off-chain only). Rejected — the contract surface includes `schemaURI` per `tasks/02-contract-mvp.md` and `docs/02_ARCHITECTURE.md`; removing it would be a real spec change.
- **Pin the JSON Schema separately via Intuition's GraphQL by using a different mutation** (none exists for free-form data). Rejected — no such mutation.

## Consequences

**Positive:**
- **One IPFS artifact per module, one mutation, no external pinning service.** Removes Pinata from the dependency tree of the seed flow.
- **No URI sync risk.** `schemaURI` and atom URI cannot drift apart.
- **Intuition-native posture.** The protocol leans on Intuition's own pinning infra rather than a third-party service — coherent with the "Intuition reputation layer" positioning.
- **Free pin call.** `pinThing` has no per-call fee on Intuition Testnet.

**Negative:**
- **The on-chain `schemaURI` does not literally resolve to a JSON Schema file.** It resolves to a Thing object with `{name, description, image, url}`. A consumer that expected JSON Schema bytes at the URI would be surprised. Mitigation: the UI/indexer is documented to consume the Thing as the module's identity card, and the JSON Schema lives at `schemas/<domain>.vN.json` in the repo for anyone who needs the attestation shape.
- **No automatic IPFS resolvability of the JSON Schema** until someone explicitly pins `schemas/solidity-audit.v1.json`. Acceptable for the MVP — the schema is a dev reference, not a runtime resource.
- **Versioning at the schema level becomes two-step**: bump the file in `schemas/`, then re-pin a new Thing whose `description` references the new version. The old module + atom + URI remain immutable on-chain (per the registry's append-only invariant).

**Neutral (worth knowing):**
- The `pinThing` mutation is deterministic by content. Re-running the seed with the same Thing fields returns the same URI, so the seed script is naturally idempotent on this step.
- The atom URI is keccak-derived from `stringToHex(uri)`. Re-creating an atom for the same URI returns the same atom ID (the framework rejects duplicates via `isTermCreated` — the seed script checks this and skips).
- ARP could later add a separate, machine-readable "attestation-shape" field to the Module struct (e.g., `bytes32 schemaContentHash`) if downstream consumers want a chain-verifiable hash of the JSON Schema bytes. Out of MVP scope.

## References

- Vendored procedure: `.claude/skills/intuition/reference/schemas.md` (the `pinThing` mutation).
- Vendored procedure: `.claude/skills/intuition/operations/create-atoms.md` (atom creation via `MultiVault.createAtoms`).
- Implementation: `scripts/seed.ts`.
- Dev reference (not pinned): `schemas/solidity-audit.v1.json`.
- Deployment record: `deployments/13579.json` → `arp.modules[0].schemaURI == arp.intuitionAtoms[0].uri`.
- Related ADR: `0003-metamask-skills-vendored-locally.md` (skills-as-procedural-knowledge pattern).
- Post-mortem: `.claude/learning/04-deploy-and-seed.md`.
