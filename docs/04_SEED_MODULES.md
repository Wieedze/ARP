# 04 — Seed Modules

Three modules are registered at deployment time. Each has a committed schema file, an IPFS-uploaded URI, and a corresponding Intuition atom.

The purpose of seeding these three specifically is to demonstrate domain diversity: security (narrow technical), content (broad subjective), and information (epistemic). Each maps to a different flavor of what "reputation in a domain" can mean.

## Module 1 — Solidity Audit

**Domain identifier**: `solidity-audit`

**Purpose**: agents attest to the security posture of a deployed or unverified Solidity contract, reporting severity counts for vulnerabilities found.

**Attestation schema** (what agents will eventually stake TRUST on):
```json
{
  "contract_address": "0x...",
  "chain_id": 8453,
  "critical_count": 0,
  "high_count": 1,
  "medium_count": 3,
  "low_count": 5,
  "evidence_uri": "ipfs://...",
  "confidence": 0.85
}
```

**Ground truth source**: post-audit disclosure by the project or third-party audits.

**Why this module matters for the demo**: it showcases ARP working in a high-value, high-specificity domain where the Trail of Bits ethos is directly relevant. It signals technical seriousness.

## Module 2 — URL Classification

**Domain identifier**: `url-classification`

**Purpose**: agents attest to the category and trust tier of a URL. Overlaps with work already done in Sofia but generalized and domain-agnostic.

**Attestation schema**:
```json
{
  "url": "https://...",
  "category": "news | tutorial | product | scam | ai-generated | other",
  "trust_tier": "verified | community-trusted | unrated | suspicious | malicious",
  "evidence_uri": "ipfs://...",
  "confidence": 0.92
}
```

**Ground truth source**: community consensus via multi-agent agreement, or human expert labels.

**Why this module matters for the demo**: it connects ARP to the existing Sofia work on on-chain behavioral reputation. Shows ARP is not disconnected from prior shipped products — it generalizes them.

## Module 3 — Factual Claim Verification

**Domain identifier**: `claim-verification`

**Purpose**: agents attest to the veracity of a specific factual claim, with supporting or refuting evidence.

**Attestation schema**:
```json
{
  "claim": "...",
  "verdict": "true | false | disputed | insufficient-evidence",
  "evidence_uris": ["ipfs://...", "ipfs://..."],
  "confidence": 0.78
}
```

**Ground truth source**: aggregated consensus from high-calibration agents in the same domain, and human verification for a labeled training subset.

**Why this module matters for the demo**: it demonstrates ARP's domain-agnostic design. Solidity auditing is narrow and technical; URL classification is broad; claim verification is epistemic. Three very different domains, one protocol.

## Schema storage

Each schema file lives in `schemas/` at the repo root:
- `schemas/solidity-audit.v1.json`
- `schemas/url-classification.v1.json`
- `schemas/claim-verification.v1.json`

Schemas use JSON Schema draft 2020-12 for validation. Each file includes:
- `$id` pointing to the IPFS URI (filled after upload)
- `title` and `description`
- `properties` with types and descriptions
- `required` array listing mandatory fields
- `version` field (semver, starts at `1.0.0`)

## IPFS upload

Upload is handled as part of the deployment script (`scripts/deploy.ts` or equivalent). Use a pinning service — do not rely on public gateway retention. Acceptable services: Pinata, Web3.Storage, Filebase. Record the resulting `ipfs://bafy...` URIs in `deployments/base-sepolia.json` alongside the contract addresses.

## Intuition atom creation

Each module registration triggers an Intuition atom of type `ARP_MODULE`. The atom carries:
- The on-chain module ID
- The domain identifier
- The schema URI
- The creator address
- A triple linking the module to its domain

Refer to the Intuition skill for atom creation specifics. Do not guess at the API.

## Versioning

Schemas are versioned. Breaking changes create a new schema URI, not an update to an existing one. For the MVP, each seed module registers at `v1.0.0`. Future versions will be registered as separate modules with a link to the predecessor (out of MVP scope, but the schema format should accommodate it).
