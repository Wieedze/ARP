# Task 03 — Deploy, Seed, and Intuition Integration

> **Status: COMPLETE** (2026-06-01). Post-mortem: `.claude/learning/04-deploy-and-seed.md`. Pivot adjustments applied: Intuition Testnet (chainId 13579) not Base Sepolia; 1 seed module (`solidity-audit`) not 3; IPFS pinning via Intuition's native `pinThing` GraphQL not Pinata; enforcers from Task 02b also deployed in this task's Phase A (small in-scope extension).

## Objective

Deploy `ModuleRegistry` to Base Sepolia, verify on Basescan, seed three modules on-chain, upload their schemas to IPFS, and create corresponding Intuition atoms for each.

## Required skills for this task

- ethereum-smart-contracts (deployment patterns, Foundry scripting)
- intuition-protocol (atom creation, triple linking)

Load both before starting.

## Deliverables

- [ ] `contracts/script/Deploy.s.sol` — Foundry deployment script
- [ ] `contracts/script/SeedModules.s.sol` — script to register the three seed modules
- [ ] `schemas/solidity-audit.v1.json`, `schemas/url-classification.v1.json`, `schemas/claim-verification.v1.json` — filled with JSON Schema drafts per `docs/04_SEED_MODULES.md`
- [ ] `scripts/upload-schemas.ts` — TypeScript script to pin schemas to IPFS
- [ ] `scripts/create-atoms.ts` — TypeScript script to create Intuition atoms for each seeded module
- [ ] `deployments/base-sepolia.json` — structured record of all addresses, module IDs, atom IDs, IPFS URIs
- [ ] `ModuleRegistry` deployed and verified on Basescan (Base Sepolia)
- [ ] Three modules registered on-chain with their schemas pinned to IPFS
- [ ] Three Intuition atoms created and linked via triples

## Steps

### 1. Fill in the schema files

Write each JSON Schema according to `docs/04_SEED_MODULES.md`. Use draft 2020-12. Include `$id` placeholders to be filled in after IPFS upload.

Each schema should be a well-formed, fully typed JSON Schema document. If you're uncertain on the JSON Schema syntax for a particular field, look it up. Do not guess.

### 2. Write the IPFS upload script

`scripts/upload-schemas.ts`:
- Reads the three schema files from `schemas/`
- Pins each to IPFS using a pinning service (Pinata recommended, acceptable alternatives: Web3.Storage, Filebase)
- Writes the resulting `ipfs://bafy...` URIs to a temporary output for the deploy script to consume
- Is idempotent — re-running should produce the same URIs (same content = same CID)

Credentials read from environment variables documented in `.env.example`. Never commit credentials.

### 3. Write the deployment script

`contracts/script/Deploy.s.sol`:
- Reads deployer private key from environment
- Deploys `ModuleRegistry` with deterministic bytecode
- Prints the deployed address for verification

Run it against Base Sepolia:
```bash
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify
```

If Basescan verification through Foundry fails, run `forge verify-contract` manually. Document the exact command used.

Write the resulting address to `deployments/base-sepolia.json`.

### 4. Write the seeding script

`contracts/script/SeedModules.s.sol`:
- Reads the three IPFS URIs from a JSON input file (produced by the upload script)
- Calls `registerModule` three times, once per seed module
- Emits clear logs of the resulting module IDs

Run it:
```bash
forge script script/SeedModules.s.sol --rpc-url base_sepolia --broadcast
```

Capture the emitted `ModuleRegistered` events and record the module IDs in `deployments/base-sepolia.json`.

### 5. Write the Intuition atom creation script

`scripts/create-atoms.ts`:
- For each of the three seeded modules, create an `ARP_MODULE` atom in Intuition
- Attach triples linking the atom to: its on-chain module ID, its domain, its schema URI, its creator address
- Refer to the intuition-protocol skill for the actual SDK calls — do not guess
- Record the resulting atom IDs in `deployments/base-sepolia.json`

The script should be idempotent: re-running it should detect existing atoms and not duplicate.

### 6. Verify end to end

- Open Basescan, confirm the contract is verified and the three `registerModule` transactions are visible
- Open the Intuition explorer (or use the Intuition SDK to query), confirm the three atoms exist and are linked
- Confirm `deployments/base-sepolia.json` is complete and accurate

## deployments/base-sepolia.json schema

```json
{
  "chainId": 84532,
  "chainName": "Base Sepolia",
  "deployedAt": "2026-05-XX...",
  "contracts": {
    "ModuleRegistry": {
      "address": "0x...",
      "deploymentTx": "0x...",
      "basescanUrl": "https://sepolia.basescan.org/address/0x..."
    }
  },
  "schemas": {
    "solidity-audit": {
      "version": "1.0.0",
      "ipfsUri": "ipfs://bafy...",
      "gatewayUrl": "https://gateway.../bafy..."
    },
    "url-classification": { ... },
    "claim-verification": { ... }
  },
  "modules": [
    {
      "id": 1,
      "name": "Solidity Audit",
      "domain": "solidity-audit",
      "schemaURI": "ipfs://bafy...",
      "creator": "0x...",
      "registrationTx": "0x...",
      "intuitionAtomId": "..."
    },
    ...
  ]
}
```

## Do not do in this task

- Do not deploy to Base mainnet under any circumstances
- Do not implement attestation or stake logic
- Do not publish an npm package
- Do not create atoms without the Intuition skill's guidance
- Do not hardcode IPFS gateway URLs in the contract — store only `ipfs://...` URIs

## Environment variables required

Document these in `.env.example` (never commit actual values):

```
BASE_SEPOLIA_RPC_URL=
DEPLOYER_PRIVATE_KEY=
BASESCAN_API_KEY=
PINATA_JWT=
INTUITION_API_KEY=
INTUITION_SIGNER_PRIVATE_KEY=
```

## Report format when complete

```
## Task 03 complete

**Shipped**
- ModuleRegistry deployed at: <address>
- Basescan verified: <url>
- 3 modules registered: IDs 1, 2, 3
- 3 IPFS schemas pinned: <CIDs>
- 3 Intuition atoms created: <atom IDs>
- deployments/base-sepolia.json updated

**Decisions made**
- [Any non-obvious choices]

**Known issues**
- [Anything that works but should be flagged — e.g., "IPFS gateway X was slow, using Y"]

**Next**
- Ready for Task 04 (UI core)
- Blocked on: <nothing, or list>
```
