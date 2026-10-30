# Post-mortem index

**Generated** 2026-10-30 by `scripts/build/build-claude-index.ts`. Do not edit by hand — rerun the script.

32 entries, one per completed task. Written by `task-verifier` on a pass.

| # | task | verdict | entry |
| --- | --- | --- | --- |
| [01](01-project-setup.md) | `docs/tasks/01-project-setup.md` | PASS | # 01 — Project setup (post-pivot) |
| [02](02-contract-mvp.md) | `docs/tasks/02-contract-mvp.md` | PASS | # 02 — Module Registry contract |
| [03](03-caveat-enforcers.md) | `docs/tasks/02b-caveat-enforcers.md` | PASS | # 03 — Caveat enforcers (Task 02b) |
| [04](04-deploy-and-seed.md) | `docs/tasks/03-deploy-and-seed.md` | PASS (with notes | Deploy and seed (Task 03) |
| [05](05-smart-account-integration.md) | `docs/tasks/03b-smart-account-integration.md` | PASS | Smart Account + Delegation SDK Integration |
| [06](06-agent-identity-and-compose.md) | `docs/tasks/04b-agent-identity-and-compose.md` | PASS | Agent identity + tool composition UI |
| [07](07-agent-autonomous-positioning.md) | `docs/tasks/04c-agent-autonomous-positioning.md` | PASS | Agent autonomous positioning under bounded delegation |
| [08](08-pin-writes-server-side.md) | `docs/tasks/06-pin-writes-server-side.md` | PASS | Restore the Intuition write path, server-side only |
| [09](09-erc8004-connector.md) | `docs/tasks/07-erc8004-connector.md` | PASS | `@arp-protocol/erc8004`: the source-neutral ERC-8004 read connector |
| [10](10-agent-trust-panel.md) | `docs/tasks/08-agent-trust-panel.md` | PASS (second pass; first pass failed on dead surface) | The agent trust panel, with a live mainnet stake control |
| [11](11-agent-directory-full-cohort.md) | `docs/tasks/10-agent-directory-full-cohort.md` | PASS (second pass; first pass held on an open `ui-reviewer` gate, not on code) | The agent directory lists the whole cohort |
| [12](12-import-existing-erc8004-agent.md) | `docs/tasks/11-import-existing-erc8004-agent.md` | PASS | Import an existing ERC-8004 agent |
| [13](13-agent-panel-tabs.md) | `docs/tasks/12-agent-panel-tabs.md` | PASS (second pass; first pass held on an open `ui-reviewer` gate, not on code) | Tabs on the agent panel, one per provider |
| [14](14-strip-the-panel-copy.md) | `docs/tasks/15-strip-the-panel-copy.md` | PASS | Strip the panel's copy down |
| [15](15-strict-is-off-in-the-app.md) | `docs/tasks/18-strict-is-off-in-the-app.md` | PASS | `strict` is off in the app |
| [16](16-make-the-testnet-rig-faithful.md) | `docs/tasks/24-make-the-testnet-rig-faithful.md` | PASS | Make the testnet rig faithful |
| [17](17-the-agent-sdk.md) | `docs/tasks/16-the-agent-sdk.md` — half 1 only; half 2 split out to `docs/tasks/25` | PASS | The connector an agent declares through (half 1) |
| [18](18-the-tool-surface.md) | `docs/tasks/23-the-tool-surface.md` | PASS | The tool surface |
| [19](19-the-external-verifier.md) | `docs/tasks/17-the-external-verifier.md` | PASS | The external verifier |
| [20](20-arp-serves-the-content-and-signs-the-access.md) | `docs/tasks/31-arp-serves-the-content-and-signs-the-access.md` | PASS | ARP serves the content and signs the access |
| [21](21-two-apps-the-mcp-and-the-node.md) | `docs/tasks/32-two-apps-the-mcp-and-the-node.md` | PASS | Three apps over two packages: mcp, node, hook |
| [22](22-the-landing-is-a-scene-sequence.md) | `docs/tasks/29-the-landing-is-a-scene-sequence.md` | PASS | The landing is a scene sequence, not a long page |
| [23](23-one-installer-33a.md) | `docs/tasks/33-one-installer.md` (sub-task 33a only; 33b–33h not started) | PASS (second pass; the first failed on the three items under Surprises) | Task 33a: the hook sees what each runtime sends |
| [24](24-one-installer-33b.md) | `docs/tasks/33-one-installer.md` (sub-task 33b only; 33c–33h not started) | PASS (second pass; the first failed on five stale sentences, none in the code) | Task 33b: `@arp-protocol/cli`, built for Node |
| [25](25-the-activity-bar.md) | `docs/tasks/36-the-activity-bar.md` | PASS (second run; the first failed on 3 findings plus a missing STATE | The activity bar: what the agent triggered, and what it declared |
| [26](26-one-installer-33c.md) | `docs/tasks/33-one-installer.md` §4 33c | PASS, on the second pass | One installer, 33c: `arp init`, `arp uninstall`, `arp doctor` |
| [27](27-one-installer-33i-capture.md) | `docs/tasks/33-one-installer.md` §4 33i. Capture tooling only. Per-runtime adapters wait on real captures from the user. | PASS, on the second pass | One installer, 33i (first half): `arp hook --capture` and `arp init --capture` |
| [28](28-one-installer-33d-claude-gemini.md) | `docs/tasks/33-one-installer.md` §33d (first part; Codex deferred) | PASS (third pass) | One installer, 33d first part: Claude Code plugin and Gemini extension |
| [29](29-coherence-audit-28d.md) | `docs/tasks/28-coherence-audit.md` (entry 43) | PASS (second pass; the first draft's check did not print what the entry said) | Coherence audit, entry 43: `/agent` step 5 pointed at a deleted script |
| [30](30-the-activity-bar-verified.md) | `docs/tasks/36-the-activity-bar.md` (the "Review of `f5d1c84` and `79ad7ea`" section) | PASS | The activity bar, review of f5d1c84 and 79ad7ea (36v) |
| [31](31-the-receipt-enforcer.md) | `docs/tasks/43-the-receipt-enforcer.md` | PASS | The receipt enforcer: "no signed receipt, no deposit", held by a contract |
| [31](31-the-sponsoring-service.md) | `docs/tasks/40-the-sponsoring-service.md` (built with `docs/tasks/37` 37b, 37c) | PASS (second pass) | The sponsoring service: a proven deposit, paid by ARP, owned by the agent |
