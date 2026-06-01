# 0005 — Vendor the `intuition` skill locally + correct the skill name across the architecture

**Status:** Accepted
**Date:** 2026-05-19
**Triggered by:** User pointing out the Intuition skill is installed globally; investigation revealed an environment quirk that hid it from Claude Code, plus a naming mismatch in the existing architecture.

## Context

Two related issues surfaced in the same turn:

**Issue 1 — Visibility quirk.** The user has the Intuition Protocol skill installed at `/home/max/.agents/skills/intuition/` (with symlinks in `/home/max/.claude/skills/intuition`, `frontend-design`, `find-skills`). However, Claude Code in this WSL environment runs as `root` (HOME=/root), so the available-skills panel reads `/root/.claude/skills/` — which did not contain `intuition`. The skill was effectively invisible to Claude.

**Issue 2 — Naming mismatch.** All ARP architecture references to the Intuition skill used the name `intuition-protocol` (per the original ARP scaffolding), but the skill's actual frontmatter `name:` is `intuition`. Even if the visibility issue were fixed, the routing table and agent definitions would not match the real skill name.

The skill is substantial: 431-line `SKILL.md` + `operations/` (6 files: create-atoms, create-triples, deposit, redeem, batch-deposit, batch-redeem) + `reference/` (6 files: reading-state, simulation, workflows, autonomous-policy, schemas, graphql-queries). Total ~2.5K lines of canonical procedural knowledge — V2 ABIs, contract addresses for both Intuition Mainnet (chainId 1155) and Testnet (chainId 13579), encoding patterns, gas hints, GraphQL queries.

The user explicitly invited a local install: *"ok install le ici si il faut"*. This matches the pattern already established for the MetaMask skills (ADR `0003`).

## Decision

1. **Vendor a copy of the Intuition skill into `.claude/skills/intuition/`** in the ARP repo, source `/home/max/.agents/skills/intuition/`. The full tree (SKILL.md + operations/ + reference/) is copied verbatim. This matches how `mms-*` skills are vendored.

2. **Remove the temporary `/root/.claude/skills/intuition` symlink** that was created to unblock this session. The local vendor in the repo is the canonical install for ARP work. The user's `/home/max/.agents/skills/intuition/` remains untouched as the upstream source.

3. **Correct the skill name `intuition-protocol` → `intuition`** in all live architecture files:
   - `CLAUDE.md` (routing table + directory map)
   - `.claude/README.md`
   - `.claude/agents/intuition-integrator.md` (description + skill load list + procedure)
   - `.claude/skills/arp/SKILL.md` (description + composition section)

   ADR `0001-claude-meta-architecture.md` (immutable) and `docs/00_HACKATHON_PIVOT.md` (verbatim user brief) retain the old name; readers resolve the trivial mismatch via the current routing table.

## Alternatives considered

- **Keep the temporary root symlink, do not vendor.** Rejected — fixes the visibility quirk for this machine only. Collaborators cloning the repo would still need the skill installed globally. Inconsistent with the `mms-*` vendoring already in place.
- **Symlink `.claude/skills/intuition` → `/home/max/.agents/skills/intuition` (lean, auto-updates).** Rejected — symlinks in a git repo are fragile (broken for any collaborator who doesn't have the same absolute path). A copy is repo-portable; the next sync is a manual re-copy if the upstream changes.
- **Keep the name `intuition-protocol` and alias it in routing.** Rejected — adding an alias layer is more friction than fixing the name. The skill's frontmatter says `intuition`; the architecture should match.
- **Symlink at `/root/.claude/skills/intuition` AND vendor locally.** Rejected — two installs of the same skill create ambiguity on which one is canonical. The local vendor is the only path; collaborators get it via clone.

## Consequences

**Positive:**
- The `intuition` skill is now visible in Claude Code's available-skills panel for this repo (confirmed mid-session via system reminder).
- Tasks that touch Intuition (Task 03, Task 04b's tool-atom registration + TRUST staking, any future indexer work) have the full procedural knowledge available without a network round-trip.
- Repo is self-contained — no global skill prerequisite for collaborators.
- Naming is now consistent across architecture, routing, agent definition, and the actual skill.

**Negative:**
- Snapshot risk: if `jonathanprozzi/intuition-skill` upstream gets V3 contract addresses, our vendored copy is stale until manually re-synced. Mitigation: the SKILL.md's contract addresses are V2-verified per its preamble; V3 transition is a hackathon-post concern.
- Two more directories owned by `max:max` to manage. Already chown'd post-copy.

**Neutral (worth knowing):**
- The `intuition-protocol` name lives on in two places: ADR `0001` (immutable historical record) and `docs/00_HACKATHON_PIVOT.md` (verbatim user brief). Readers should treat both as referring to the `intuition` skill — the rename is mechanical, not semantic.
- The skill declares `allowed-tools: "Bash, Read"` in its frontmatter — it expects to compose with shell commands and file reads. This is compatible with how the `intuition-integrator` agent and ARP's atom-creation workflows operate.
- The skill is informed by V2 contracts. Intuition Testnet MultiVault address per the skill: `0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91`. Chain ID: `13579`. RPC: `https://testnet.rpc.intuition.systems/http`. GraphQL: `https://testnet.intuition.sh/v1/graphql`. These unblock Task 01's chain-config change.

## References

- Vendored skill: `.claude/skills/intuition/` (SKILL.md + operations/ + reference/)
- Upstream source: `/home/max/.agents/skills/intuition/` (the user's global install)
- Author / version: `jonathanprozzi`, `0.2.0` (per SKILL.md frontmatter)
- Related ADR: `0003-metamask-skills-vendored-locally.md` (same pattern, applied to MetaMask skills)
- Affected files (live): `CLAUDE.md`, `.claude/README.md`, `.claude/agents/intuition-integrator.md`, `.claude/skills/arp/SKILL.md`
- Affected files (preserved as-is): `.claude/choices/0001-claude-meta-architecture.md` (immutable ADR), `docs/00_HACKATHON_PIVOT.md` (verbatim user brief)
