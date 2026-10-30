# ADR index

**Generated** 2026-10-30 by `scripts/build/build-claude-index.ts`. Do not edit by hand — rerun the script.

95 decisions. Newest last. `choices/README.md` says when to write one.

## Not accepted

Read these before relying on them.

- **0015** (Accepted in part — the trust-provider role is **rejected** by ADR `0046`) — Adopt the canonical Intuition ERC-8004 pattern; ARP publishes as a trust provider
- **0041** (Accepted. Amended by `0082` (2026-10-30): a `packages/graphql` read layer goes under it.) — One protocol package, not two, and it is called what it is
- **0045** (Accepted. **Amended by ADR `0092`** (2026-10-30): ARP may host a service that pays or) — the invariant is the request path, not the runtime
- **0057** (Accepted — 2026-10-27, on the user's instruction to close everything open.) — Brand identity v0.3: The Source, Saffron, Archivo + Geist Mono
- **0080** (Accepted. **Amended by ADR `0094`** (2026-10-30): constraint 2 holds for a declaration) — The node signs for what it served, and for nothing else
- **0082** (Accepted. Amends `0041` (a `packages/graphql` under the protocol package).) — Three apps: the MCP server, the agent node and the runtime hook are different programs
- **0087** (Accepted, one point open (below)) — A tool is its package, and its repository is its source
- **0088** (Accepted. Amends the one-word rule of 2026-10-28 (`scripts/seed/seed-domain-tree.ts`,) — A label is one word, unless a compound is necessary
- **0090** (Accepted. Extended 2026-10-30 by task 33i — see "Extension: captures" at the end.) — What the hook records: outcome and identity, never content or credentials
- **0093** (Accepted. **Renumbered from `0089` on 2026-10-30**: it shared that number with `0089-one-installer-one-package-thin-manifests.md`, which was written first. Commits before the rename cite it as `0089`.) — The probe is not the pulse
- **0094** (Accepted. **Amended 2026-10-30 for testnet**: everything is sponsored. User decision,) — ARP is the directory and the verifier, never the relay; a proof is the condition of a sponsored deposit
- **0095** (Proposed) — The install handshake binds a node key that both the owner and the node sign for
- **0098** (Accepted for point 9 (user decision, 2026-10-30, _« ok option 2 »_); the rest Proposed, reviewed by `contract-reviewer` (PASS, 2026-10-30); one decision open) — The receipt enforcer verifies the v1 hire receipt as signed, and binds the term through its terms

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
| [0041](0041-one-protocol-package-not-two.md) | 2026-10-19 | Accepted. Amended by `0082` (2026-10-30): a `packages/graphql` read layer goes under it. | One protocol package, not two, and it is called what it is |
| [0042](0042-a-vault-s-assets-are-not-evidence-of-a-stake.md) | 2026-10-19 | Accepted | A vault's assets are not evidence of a stake; its position count is |
| [0043](0043-a-retraction-is-greppable-or-it-is-partial.md) | 2026-10-19 | Accepted | A retraction is greppable, or it is partial |
| [0044](0044-tool-is-the-one-word.md) | 2026-10-20 | Accepted | "Tool" is the one word on screen; two rule lines corrected |
| [0045](0045-the-invariant-is-the-request-path-not-the-runtime.md) | 2026-10-20 | Accepted. **Amended by ADR `0092`** (2026-10-30): ARP may host a service that pays or | the invariant is the request path, not the runtime |
| [0046](0046-arp-scores-nobody.md) | 2026-10-20 | Accepted | ARP scores nobody; it makes staking possible and reads the result |
| [0047](0047-the-mirror-is-a-prerequisite-and-signing-is-a-separate-program.md) | 2026-10-20 | Accepted | the mirror is a prerequisite nobody listed, and signing is a separate program |
| [0048](0048-arp-does-not-mirror-8004-feedback.md) | 2026-10-20 | Accepted | ARP does not mirror ERC-8004 feedback; it reads it beside its own claims |
| [0049](0049-arp-does-not-calibrate.md) | 2026-10-20 | Accepted | ARP does not calibrate, and the positioning says what it does instead |
| [0050](0050-a-css-token-gate.md) | 2026-10-20 | Accepted | a gate for CSS custom properties, because neither existing gate reads a class name |
| [0051](0051-arp-points-and-prices-it-stores-nothing.md) | 2026-10-20 | Accepted | ARP points at things and prices opinions about them; it stores nothing |
| [0052](0052-the-procedure-is-the-product-for-the-use-half.md) | 2026-10-20 | Accepted | the procedure is the product for the "use" half; the connector is a convenience |
| [0053](0053-every-term-is-born-with-a-position.md) | 2026-10-21 | Accepted | Every term is born with a position |
| [0054](0054-a-tool-atom-is-derived-from-its-url.md) | 2026-10-21 | Accepted | A tool's atom is derived from its URL |
| [0055](0055-one-contract-not-five.md) | 2026-10-21 | Accepted | One contract, not five |
| [0056](0056-the-market-on-an-agent-is-on-its-atom-and-the-edge-is-a-receipt.md) | 2026-10-21 | Accepted | the market on an agent is on its atom; the edge is a receipt, not a market |
| [0057](0057-brand-identity-the-source.md) | 2026-10-21 | Accepted — 2026-10-27, on the user's instruction to close everything open. | Brand identity v0.3: The Source, Saffron, Archivo + Geist Mono |
| [0058](0058-the-network-banners-come-off.md) | 2026-10-27 | Accepted | The network banners come off; the warning lives at the signature |
| [0060](0060-arp-records-it-does-not-broker.md) | 2026-10-27 | Accepted | ARP records a use; it does not broker one |
| [0061](0061-the-toggle-governs-writes.md) | 2026-10-27 | Accepted | The chain toggle governs writes, and the chain rides on the quote |
| [0062](0062-one-door-for-your-agent-and-it-mints-on-base.md) | 2026-10-27 | Accepted | One door for your agent, and the mint goes to Base |
| [0063](0063-the-app-tests-components-now.md) | 2026-10-27 | Accepted | The app tests hooks and components, and ADR 0011's scope says so |
| [0064](0064-a-uniform-sample-of-the-cohort-is-a-sample-of-one-operator.md) | 2026-10-27 | Accepted | A uniform sample of the ERC-8004 cohort is a sample of one operator |
| [0065](0065-two-enforcers-are-on-mainnet-and-the-rules-said-none-was.md) | 2026-10-27 | Accepted | Two enforcers are on mainnet, and three files said none was |
| [0066](0066-one-gesture-plays-one-scene.md) | 2026-10-28 | Accepted | One gesture plays one whole scene |
| [0067](0067-saffron-is-a-transition-material.md) | 2026-10-28 | Accepted | Saffron is a transition material, and the core is warm at zero |
| [0068](0068-scenes-do-not-overlap.md) | 2026-10-28 | Accepted | Scenes do not overlap |
| [0069](0069-the-landing-is-six-scenes.md) | 2026-10-28 | Accepted | The landing is six scenes, and the evidence ladder is not one of them |
| [0070](0070-the-word-scale-is-built-and-the-out-fade-is-not.md) | 2026-10-28 | Accepted | The word scale is built; the route out-fade is not |
| [0071](0071-owning-the-token-is-the-authority-to-declare.md) | 2026-10-28 | Accepted | owning the ERC-8004 token is the authority to declare, and mainnet is not open yet |
| [0072](0072-the-market-is-offered-to-agents-and-tools.md) | 2026-10-28 | Accepted | the market is offered on an agent or a tool, and no single field says which |
| [0073](0073-a-reveal-answers-the-keyboard-or-it-is-a-mouse-effect.md) | 2026-10-28 | Accepted | a reveal answers the keyboard, or it is a mouse effect |
| [0074](0074-a-tool-carries-one-tag-at-its-deepest-domain.md) | 2026-10-28 | Accepted | A tool carries one tag, at its deepest domain |
| [0075](0075-what-is-sold-is-the-place-in-the-answer.md) | 2026-10-29 | Accepted | What is sold is the place in the answer, and your place comes from others |
| [0076](0076-arp-plans-a-payment-and-never-holds-one.md) | 2026-10-29 | Accepted | ARP plans a payment and never holds one |
| [0077](0077-the-unit-is-the-skill-not-the-repository.md) | 2026-10-29 | Accepted | The unit of the catalogue is the skill, not the repository |
| [0078](0078-source-is-the-edge-from-a-skill-to-its-repository.md) | 2026-10-29 | Accepted | `source` is the edge from a skill back to the repository it came from |
| [0079](0079-a-bulk-write-is-paced-by-bytes-not-by-gas.md) | 2026-10-29 | Accepted | A bulk write to Intuition is paced by bytes, not by gas |
| [0080](0080-the-node-signs-for-what-it-served-and-for-nothing-else.md) | 2026-10-29 | Accepted. **Amended by ADR `0094`** (2026-10-30): constraint 2 holds for a declaration | The node signs for what it served, and for nothing else |
| [0081](0081-a-claim-a-stranger-checks-ships-with-its-command.md) | 2026-10-30 | Accepted | A claim a stranger is asked to check ships with the command that checks it |
| [0082](0082-two-apps-the-mcp-and-the-node.md) | 2026-10-30 | Accepted. Amends `0041` (a `packages/graphql` under the protocol package). | Three apps: the MCP server, the agent node and the runtime hook are different programs |
| [0083](0083-the-hire-receipt-is-eip712-named-like-erc8004.md) | 2026-10-30 | Accepted | The hire receipt is EIP-712, names the agent like ERC-8004, and uses the payment as its nonce |
| [0084](0084-a-worker-in-front-of-github-and-skills-sh.md) | 2026-10-30 | Accepted | A Worker in front of GitHub and skills.sh, as a cache and never a source |
| [0085](0085-an-agent-with-no-wallet-generates-its-own-key.md) | 2026-10-30 | Accepted | An agent with no wallet generates its own key, and a funder covers the gas for now |
| [0086](0086-the-repo-is-sorted-by-kind.md) | 2026-10-30 | Accepted | The repo is sorted by kind: code, data, docs, scripts |
| [0087](0087-a-tool-is-its-package-and-its-repo-is-its-source.md) | 2026-10-30 | Accepted, one point open (below) | A tool is its package, and its repository is its source |
| [0088](0088-a-label-is-one-word-unless-a-compound-is-necessary.md) | 2026-10-30 | Accepted. Amends the one-word rule of 2026-10-28 (`scripts/seed/seed-domain-tree.ts`, | A label is one word, unless a compound is necessary |
| [0089](0089-one-installer-one-package-thin-manifests.md) | 2026-10-30 | Accepted | One installer: one npm package, a thin native manifest per runtime |
| [0090](0090-what-the-hook-records.md) | 2026-10-30 | Accepted. Extended 2026-10-30 by task 33i — see "Extension: captures" at the end. | What the hook records: outcome and identity, never content or credentials |
| [0091](0091-the-agent-s-activity-reaches-the-browser-through-a-local-feed.md) | 2026-10-30 | Accepted | The agent's activity reaches the browser through a local, read-only feed |
| [0092](0092-arp-sponsors-delegation-publication-on-testnet.md) | 2026-10-30 | Accepted | ARP sponsors the publication of delegations, on testnet, from its treasury |
| [0093](0093-the-probe-is-not-the-pulse.md) | 2026-10-30 | Accepted. **Renumbered from `0089` on 2026-10-30**: it shared that number with `0089-one-installer-one-package-thin-manifests.md`, which was written first. Commits before the rename cite it as `0089`. | The probe is not the pulse |
| [0094](0094-arp-is-the-directory-and-the-verifier-never-the-relay.md) | 2026-10-30 | Accepted. **Amended 2026-10-30 for testnet**: everything is sponsored. User decision, | ARP is the directory and the verifier, never the relay; a proof is the condition of a sponsored deposit |
| [0095](0095-the-handshake-binds-a-node-key-both-keys-sign.md) | 2026-10-30 | Proposed | The install handshake binds a node key that both the owner and the node sign for |
| [0098](0098-the-receipt-enforcer-verifies-the-v1-hire-receipt-as-signed.md) | 2026-10-30 | Accepted for point 9 (user decision, 2026-10-30, _« ok option 2 »_); the rest Proposed, reviewed by `contract-reviewer` (PASS, 2026-10-30); one decision open | The receipt enforcer verifies the v1 hire receipt as signed, and binds the term through its terms |
