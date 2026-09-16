# 0015 — Adopt the canonical Intuition ERC-8004 pattern; ARP publishes as a trust provider

**Status:** Proposed
**Date:** 2026-07-23
**Triggered by:** user request — Intuition published first-party ERC-8004 agent-reputation support and a partner guide ("Integrating with the ERC-8004 Agent Layer on Intuition"). The full guide is vendored at `docs/07_INTUITION_ERC8004_PARTNER_GUIDE.md` (the Notion source requires JavaScript and is not fetchable by tooling).

## Context

Intuition now ships a canonical ontology and write-path for ERC-8004 agent reputation, live on mainnet. The guide fixes, protocol-side, several decisions ARP had made independently:

- **Canonical predicate set with fixed term IDs** (guide Appendix B — vendored in `docs/07`), identical on testnet (13579) and mainnet (1155) except `has tag` (`0x7ec36d20…` for mainnet writes, `0x6de69cc0…` for testnet writes; both atoms exist on both networks). Resolving predicates by label is explicitly unsafe (duplicate labels on testnet make the SDK resolver throw for all four trust-pattern terms and every classification predicate).
- **Agent atom recipe**: the canonical ERC-8004 agent atom is a pinned Thing derived from the agent's `registrationFile` (name/description/image/url with specified fallbacks), anchored to the CAIP identity by a `same as` triple. It is *not* the CAIP-10 atom of the runtime wallet — which is what ADR 0014 chose for ARP's agent.
- **Named anti-pattern**: "do not write mutable scores as direct Triples." Mutable assessment data lives in partner-owned JSON served from a `.well-known` resolver URL; only an immutable 4-triple shell goes on the graph:
  1. `(agent, has trust provider, <provider>)`
  2. `(agent, has trust assessment, <source>)`
  3. `(source, provided by, <provider>)`
  4. `(source, has type, Trust Assessment Source)`
  The assessment source is a Thing whose `url` is the resolver endpoint:
  `https://<domain>/.well-known/intuition/erc8004/agents/{chainId}/{tokenId}/trust-assessment.json`
- **`has trust provider` triples are stakeable vaults** — third parties stake on the claim that a provider's assessments of an agent are trustworthy. This is the calibration primitive ARP planned to build; it already exists at the protocol layer.
- Writes require a Partner API key (pinning); triples from one wallet must be written sequentially, and the guide specifies a preflight check: derive the agent atom locally and confirm it matches the indexed `subject.term_id` byte-for-byte before minting anything.

Tension with existing ADRs:

- **ADR 0014** made the runtime-wallet CAIP-10 atom *the* agent identity for all triples. That atom cannot be the subject of the assessment shell: consumers of the canonical pattern query the registration-file-derived atom, so claims written on any other subject are invisible to them.
- **ADR 0010**'s two-layer model (immutable composition triples + mutable tTRUST stakes) survives intact — the guide's Appendix A endorses exactly that immutable layer (`uses`, `has tag` on OASF skills, `available on`). What changes is the *future score surface*: calibrated dimensional scores were headed toward being graph objects; the guide routes them through the resolver JSON instead, and routes "is this provider trustworthy" through staking on the `has trust provider` vault.

## Decision

ARP converges on the canonical pattern and registers itself as a trust provider. Concretely:

1. **Term IDs are constants.** The Appendix B term IDs are copied verbatim into ARP's SDK/config as named constants. Predicate resolution by label is forbidden anywhere in the codebase.
2. **Two identities, one anchor.** The canonical registration-file-derived atom becomes the subject for everything ERC-8004-facing (the assessment shell). The runtime-wallet CAIP-10 atom (ADR 0014) survives as the *position-holder* identity for ARP's own composition/staking triples. The two are linked by a `same as` triple. ADR 0014 is superseded in its claim that the CAIP-10 atom is the sole agent identity; its atom and helper (`redeemEnsureAtomForCaip10`) remain in use.
3. **No mutable scores as triples — ever.** ARP's calibrated dimensional scores are published as partner-owned JSON at the canonical resolver path, with `dimensions` carrying ARP's per-domain calibration, `freshness.validUntil` + refresh interval, `evidence` links, and an EIP-712 signature by ARP's provider key from V1 (provider authenticity is unresolved at the protocol layer; signing early is a differentiator and costs little — the EIP-712 patterns already exist in the repo).
4. **Trust-provider registration sequence** (testnet 13579 first, then mainnet once the Partner API key is granted): one ARP provider Atom (pinned Thing: name, description, image, url), one assessment-source Thing per assessed agent, then the 4 shell triples — written sequentially from one wallet, never `Promise.all`.
5. **Preflight before minting.** Every write path first derives the target agent atom locally and compares it to the indexed `subject.term_id`. Mismatch aborts the run.
6. **ADR 0010 is amended, not replaced.** The two-layer model and all its shipped mechanisms stand. The calibrated-score surface moves off-graph into the resolver JSON, and the stakeable trust surface for ARP-as-assessor is the `has trust provider` triple vault rather than any bespoke score atom.

On acceptance of this ADR: mark 0014 `Superseded by 0015`. 0010 keeps `Accepted` (this ADR records the amendment; the original decision is not replaced).

## Alternatives considered

- **Keep ADR 0014's CAIP-10 atom as the sole agent identity** — rejected. The canonical consumers (and Intuition's own AgentTrustSurface queries) resolve the registration-file-derived atom; assessments written on the CAIP-10 subject would exist but never be read. Fragmenting identity across two unlinked atoms is the worst outcome.
- **Adopt the canonical atom and drop the CAIP-10 atom entirely** — rejected. ARP's reputation reads key positions by the runtime wallet (ADR 0014's rationale is still valid), and existing on-chain triples reference that atom. `same as` linkage is the pattern the guide itself prescribes for exactly this case.
- **Publish calibrated scores as direct triples anyway** (ARP's earlier trajectory) — rejected. It is the guide's named anti-pattern: scores mutate, triples don't; the resolver pattern gives freshness, revocability, and signature semantics that graph objects can't.
- **Wait and keep the bespoke model** — rejected. The curation layer is first-come: early published providers are the ones consumers learn to query. Converging now costs a thin write-path; diverging costs the audience.

## Consequences

**Positive:**
- ARP stops maintaining a private ontology for the pieces Intuition now standardizes; Appendix A/B replace three open design questions (predicates, domain representation via OASF `has category`/`has tag`, tool typing via `has type`).
- The `has trust provider` stakeable vault gives ARP its calibration primitive for free — ARP's remaining surface (dimensional calibration algorithm, indexer, SDK, resolver content) is exactly the part nobody else provides.
- The partner pitch (e.g., Swarms) simplifies: a partner becomes a trust provider with its methodology exposed in the resolver JSON — no custom integration.

**Negative:**
- ARP must operate a resolver: a stable domain serving per-agent JSON becomes production infrastructure with uptime and freshness obligations (`validUntil` makes staleness visible to everyone).
- Mainnet writes are gated on a Partner API key (application form + contact: Matt Kaye, @h0xrus on Telegram) — an external dependency on Intuition's timeline. Testnet GraphQL reads need no key, so demos don't block on it.
- The guide is a JS-walled Notion page; tooling cannot re-fetch it. Mitigated: the full text is vendored at `docs/07_INTUITION_ERC8004_PARTNER_GUIDE.md` (snapshot of 2026-07-23), so Appendix A/B term IDs are copied from a repo file. On conflict, the live Notion page wins — re-sync the vendored copy when Intuition updates the guide.

**Neutral (worth knowing):**
- ARP's shipped demo triples (CAIP-10 subject) remain valid for the composition story; only the ERC-8004-facing surface adopts the canonical subject.
- The resolver JSON is partner-owned and mutable by design — this is not the indexer-as-truth compromise it appears to be: the immutable shell + staked vaults on-graph are the trust anchor; the JSON is the payload.
- `@0xintuition/sdk@^3.0.1` is the reference SDK version in the guide; check against the vendored intuition skill (ADR 0005) at implementation time and re-sync the skill if it lags.

## References

- Vendored guide: `docs/07_INTUITION_ERC8004_PARTNER_GUIDE.md` (full text incl. Appendix B term IDs, snapshot 2026-07-23)
- Partner guide source: https://intuition-systems.notion.site/intuition-8004-agent-reputation-partner-guide (JS-walled; live page wins on conflict)
- Launch announcement: https://x.com/0xIntuition/status/2079625882730189000
- Related ADRs: `0010` (two-layer model — amended by this ADR), `0014` (CAIP-10 identity — superseded on acceptance), `0012` (agent positioning), `0005` (vendored intuition skill)
- Related skill: `.claude/skills/intuition/` (does not yet cover the ERC-8004 pattern — re-sync flagged above)
- Related rule: `.claude/rules/code.md` (constants, no label resolution), `.claude/rules/security.md` (signature section: EIP-712 for assessments introduces the nonce/chainId/verifying-contract checklist — revisit at implementation)
