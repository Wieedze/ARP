# ADR index

**Generated** 2026-10-20 by `scripts/build-claude-index.ts`. Do not edit by hand — rerun the script.

47 decisions. Newest last. `choices/README.md` says when to write one.

## Not accepted

Read these before relying on them.

- **0015** (Accepted in part — the trust-provider role is **rejected** by ADR `0046`) — Adopt the canonical Intuition ERC-8004 pattern; ARP publishes as a trust provider

## All

| # | date | status | decision |
| --- | --- | --- | --- |
| [0001](0001-claude-meta-architecture.md) | 2026-05-19 | Accepted | Claude meta-architecture: rules/skills/agents/learning/choices |
| [0002](0002-hackathon-pivot-metamask-cookoff.md) | 2026-05-19 | Accepted | Hackathon pivot: target MetaMask Dev Cook-Off |
| [0003](0003-metamask-skills-vendored-locally.md) | 2026-05-19 | Accepted | Vendor MetaMask `web3-tools` skills locally into the ARP repo |
| [0004](0004-bear-trap-as-enforcer-reference.md) | 2026-05-19 | Accepted | MetaMask as canonical reference, Bear Trap as supplementary example for enforcers (Task 02b) |
| [0005](0005-intuition-skill-vendored-locally.md) | 2026-05-19 | Accepted | Vendor the `intuition` skill locally + correct the skill name across the architecture |
| [0006](0006-task-01-spec-revision.md) | 2026-06-01 | Accepted | Task 01 spec revised to post-pivot (Bun + Intuition Testnet) |
| [0007](0007-module-registry-gas-target-revision.md) | 2026-06-01 | Accepted | `ModuleRegistry.registerModule` gas target revised from <200k to ~300k |
| [0008](0008-arp-module-uri-coupling-via-intuition-pinning.md) | 2026-06-01 | Accepted | ARP module `schemaURI` and Intuition atom URI are the same Intuition-pinned Thing |
| [0009](0009-smart-account-deploy-via-simple-factory.md) | 2026-06-01 | Accepted | Smart Account deployed via SimpleFactory for Task 03b; Bundler deferred to Task 04b |
| [0010](0010-scope-reanchor-two-layer-reputation-and-track-selection.md) | 2026-06-03 | Accepted | Scope re-anchor: two-layer reputation model + final hackathon track selection |
| [0011](0011-app-test-scope-services-only.md) | 2026-06-03 | Accepted | App test scope: services only, no hooks/components |
| [0012](0012-agent-positioning-via-two-delegations.md) | 2026-06-03 | Accepted | Agent positioning via two delegations (publish + compose) |
| [0013](0013-module-registry-schema-uri-uniqueness.md) | 2026-06-03 | Accepted | ModuleRegistry enforces schemaURI uniqueness |
| [0014](0014-agent-identity-as-caip10-atom.md) | 2026-06-09 | Accepted | Agent identity atom is CAIP-10, not a pinned Thing |
| [0015](0015-adopt-canonical-intuition-erc8004-pattern.md) | 2026-07-23 | Accepted in part — the trust-provider role is **rejected** by ADR `0046` | Adopt the canonical Intuition ERC-8004 pattern; ARP publishes as a trust provider |
| [0016](0016-intuition-writes-move-server-side.md) | 2026-09-16 | Accepted | Intuition writes move server-side; the browser stops pinning |
| [0017](0017-arp-stakes-real-trust-on-mainnet.md) | 2026-09-16 | Accepted | ARP stakes real TRUST on Intuition mainnet |
| [0018](0018-trust-panel-design-and-join.md) | 2026-09-16 | Accepted | The trust panel: one alarm colour, an evidence-weighted score, and a two-edge join |
| [0019](0019-erc8004-connector-surface-deviations.md) | 2026-09-16 | Accepted | `@arp-protocol/erc8004` public-surface deviations from the Task 07 spec |
| [0020](0020-package-local-prettier-config-for-app.md) | 2026-09-16 | Accepted | A package-local Prettier config for `app/` |
| [0021](0021-coverage-follows-evidence.md) | 2026-09-16 | Accepted | Read coverage is total; write coverage follows evidence |
| [0022](0022-repoint-the-router-at-the-active-commitment.md) | 2026-09-16 | Accepted | Re-point the router at the active commitment, retire the narrative check |
| [0023](0023-cohort-listing-reads-the-atom-market-across-every-curve.md) | 2026-09-16 | Accepted | The cohort listing reads the atom market across every curve |
| [0024](0024-a-cohort-row-refuses-an-ambiguous-identity.md) | 2026-09-16 | Accepted | A cohort row refuses an ambiguous identity rather than picking one |
| [0025](0025-no-module-registry-on-mainnet.md) | 2026-09-16 | Accepted | No `ModuleRegistry` on mainnet; domain lives in the graph |
| [0026](0026-import-links-the-agent-to-its-operating-account.md) | 2026-09-16 | Accepted | The import links the agent to its operating account with `same as` |
| [0027](0027-mint-into-the-canonical-registry.md) | 2026-09-16 | Accepted | ARP mints into the canonical ERC-8004 registry, not its own |
| [0028](0028-tab-strip-carries-the-comparison.md) | 2026-09-17 | Accepted | The tab strip carries the comparison, and ARP gets a tab |
| [0029](0029-the-page-states-facts-and-stops-explaining-them.md) | 2026-09-17 | Accepted | The page states facts and stops explaining them |
| [0030](0030-the-use-edge-is-chosen-on-meaning.md) | 2026-10-16 | Accepted | The `use` edge is chosen on meaning, not on publication |
| [0031](0031-claims-carry-their-bounds.md) | 2026-10-16 | Accepted | A claim carries its bounds, or it is not written |
| [0032](0032-the-use-edge-is-a-claim-about-the-identity.md) | 2026-10-16 | Accepted | A `uses` edge is a claim about the identity, not a record of the account |
| [0033](0033-the-hackathon-surface-is-set-aside.md) | 2026-10-17 | Accepted | The hackathon surface is set aside; agents bring their own identity |
| [0034](0034-the-deposit-is-the-attestation.md) | 2026-10-19 | Accepted | The deposit is the attestation |
| [0035](0035-the-agent-stakes-its-own-trust-and-arp-is-not-a-party.md) | 2026-10-19 | Accepted | The agent stakes its own operator's TRUST, and ARP is not a party |
| [0036](0036-an-agent-may-stake.md) | 2026-10-19 | Accepted | An agent may stake. That is what ARP is. |
| [0037](0037-an-agent-session-may-sign-on-testnet.md) | 2026-10-19 | Accepted | An agent session may sign on testnet 13579 with the operator's key |
| [0038](0038-the-write-path-is-a-plan-not-a-transaction.md) | 2026-10-19 | Accepted | The write path is a plan, not a transaction |
| [0039](0039-the-deposit-goes-on-the-edge.md) | 2026-10-19 | Accepted | The deposit goes on the edge, not on the tool's atom |
| [0040](0040-the-cap-bounds-the-amount-not-the-kind.md) | 2026-10-19 | Accepted | The cap bounds the amount, not the kind |
| [0041](0041-one-protocol-package-not-two.md) | 2026-10-19 | Accepted | One protocol package, not two, and it is called what it is |
| [0042](0042-a-vault-s-assets-are-not-evidence-of-a-stake.md) | 2026-10-19 | Accepted | A vault's assets are not evidence of a stake; its position count is |
| [0043](0043-a-retraction-is-greppable-or-it-is-partial.md) | 2026-10-19 | Accepted | A retraction is greppable, or it is partial |
| [0044](0044-tool-is-the-one-word.md) | 2026-10-20 | Accepted | "Tool" is the one word on screen; two rule lines corrected |
| [0045](0045-the-invariant-is-the-request-path-not-the-runtime.md) | 2026-10-20 | Accepted | the invariant is the request path, not the runtime |
| [0046](0046-arp-scores-nobody.md) | 2026-10-20 | Accepted | ARP scores nobody; it makes staking possible and reads the result |
| [0047](0047-the-mirror-is-a-prerequisite-and-signing-is-a-separate-program.md) | 2026-10-20 | Accepted | the mirror is a prerequisite nobody listed, and signing is a separate program |
