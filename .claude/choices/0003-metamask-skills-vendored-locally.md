# 0003 — Vendor MetaMask `web3-tools` skills locally into the ARP repo

**Status:** Accepted
**Date:** 2026-05-19
**Triggered by:** User request "install ca: https://github.com/MetaMask/skills" following the hackathon pivot (ADR 0002).

## Context

The MetaMask Dev Cook-Off pivot (ADR 0002) introduced four new tasks (02b, 03b, 04b, 05b) that touch the MetaMask Smart Accounts Kit, ERC-7710 delegation, and the `gator-cli`. MetaMask maintains a public skills repository at https://github.com/MetaMask/skills with procedural guidance for these surfaces, designed to be consumed by Claude Code, Cursor, and a generic `.agents/` harness.

The repo's `tools/install` script vendors skills into the **consuming repo** (not into the user's global `~/.claude/skills/`). Each skill is copied to three locations with an `mms-` prefix:

- `.claude/skills/mms-<name>/SKILL.md` (Claude Code)
- `.cursor/rules/mms-<name>/RULE.md` (Cursor)
- `.agents/skills/mms-<name>/SKILL.md` + `agents/openai.yaml` (generic agent harness)

The script supports `--domain` filtering. The `web3-tools` domain contains exactly the skills relevant to the hackathon:

- `smart-accounts-kit` — directly required for Task 03b.
- `gator-cli` — directly required for delegation flows (Tasks 03b, 04b).
- `oh-my-opencode` — orchestration plugin for the OpenCode harness; not used by ARP but bundled in the same domain.

The other eight domains (`coding`, `general`, `performance`, `perps`, `pr-workflow`, `swaps`, `testing`, `ui`) target the MetaMask Extension and Mobile codebases and are not relevant to ARP.

## Decision

Vendor the **`web3-tools` domain only** into the ARP repo via `tools/install --target /home/max/Project/ARP --domain web3-tools`. This installs three skills under `mms-` prefixes. The MetaMask skills repo itself is cloned at `~/Project/metamask-skills` as the source for any future re-syncs.

Subsidiary decisions:

- **Local install, not global.** This matches the installer's default and the design intent (per-consuming-repo, not user-global). It avoids polluting every Claude Code session on the machine with MetaMask-specific skills, and it keeps the ARP repo self-contained for collaborators.
- **Domain restricted to `web3-tools`.** Other domains are MetaMask-internal and would add noise without benefit.
- **Keep `mms-oh-my-opencode` even though we don't use OpenCode.** Removing it would cause it to be re-created on the next `tools/sync`. The file is inert in a Claude Code session — its frontmatter description scopes it to OpenCode usage. Cost of keeping it: ~474 lines of text in the repo. Cost of removing it: a recurring chore on every sync.
- **Gitignore `.cursor/` and `.agents/`.** ARP does not use Cursor or a generic `.agents/` harness. The installer writes those vendored copies regardless. Tracking them in git would commit ~3× redundancy. The Claude Code copies in `.claude/skills/mms-*` are committed and remain the canonical local copies for this repo.
- **CLAUDE.md routing table updated** to point Tasks 02b, 03b, 04b at the new local skills (`mms-smart-accounts-kit`, `mms-gator-cli`).
- **`.claude/rules/metamask-delegation.md` updated** to reference the local skills as the procedural authority (with the MetaMask docs URL remaining the upstream source of truth for SDK API behavior).

## Alternatives considered

- **Install all domains.** Rejected — adds ~35 skills, most of which are MetaMask-extension/mobile-internal (`fix-perps-bug`, `add-non-evm-network`, `e2e-flakiness-patterns`, etc.). Pollutes the available-skills list for ARP work without value.
- **Install globally into `~/.claude/skills/`.** Rejected — the installer is explicitly per-consuming-repo. A global install would: (1) require manual workarounds since the installer doesn't write there for non-`scope: user` skills; (2) affect every Claude Code session on the machine; (3) lose the `mms-` collision-aware namespacing that the installer provides per-repo.
- **Reference MetaMask skills only by URL in `metamask-delegation.md`, do not vendor.** Rejected — vendoring gives Claude direct file access to the SKILL.md procedures, which is faster and more reliable than WebFetch on every task. Re-sync is one command (`tools/sync`) when MetaMask updates the upstream skills.
- **Delete `mms-oh-my-opencode` after install.** Rejected for the reason above (re-creation on sync). Could be revisited if the file becomes a real source of confusion.
- **Commit `.cursor/` and `.agents/` directories.** Rejected — they are vendored alternate-format copies of the same content. Committing them tracks 3× the same information.

## Consequences

**Positive:**
- Tasks 02b, 03b, 04b have first-class procedural knowledge of MetaMask Smart Accounts Kit, gator-cli, and delegation flows accessible in-context.
- Skill files are versioned in this repo, so collaborators clone-and-go without a separate install step (other than `bun install` for code dependencies).
- Re-sync is a single command if MetaMask updates upstream.

**Negative:**
- `.claude/skills/` now contains a skill we don't actively use (`mms-oh-my-opencode`). Visible in the available-skills list, must be ignored.
- The installer is the source of truth for these files. Hand-editing them would be overwritten on next sync (the `MANAGED_BANNER` comment makes this explicit). If we ever need to override, we'd patch upstream or add a private overlay per the installer's `--source` mechanism.
- Files are owned by `root` on this WSL environment due to the install being run as root. May require `chown` if the regular user needs to delete or modify them locally.
- **Installer limitation:** `tools/install` only copies each skill's `skill.md` (rewriting to `SKILL.md`). It does **not** copy sibling `references/` or `scripts/` directories that the skill bodies link to. For `mms-smart-accounts-kit`, the three reference files (`smart-accounts.md`, `delegations.md`, `advanced-permissions.md`) were manually copied from the source repo after install to make the in-skill links resolvable. **On every future `tools/sync`, re-copy the `references/` directory manually**: `cp -r ~/Project/metamask-skills/domains/web3-tools/skills/smart-accounts-kit/references /home/max/Project/ARP/.claude/skills/mms-smart-accounts-kit/`. Same caveat applies to any other skill with linked references. Worth filing as an upstream issue against `github.com/MetaMask/skills`.

**Neutral (worth knowing):**
- The clone of the upstream repo at `~/Project/metamask-skills` is a working copy, not vendored. It can be removed and re-cloned at will.
- The installer also offers `--include-user` for skills with `scope: user` (writes to `~/.claude/skills` + `~/.codex/skills`). None of the three installed skills declared user-scope, so this flag was not needed.

## References

- Upstream repo: https://github.com/MetaMask/skills
- Local clone: `~/Project/metamask-skills`
- Installer: `~/Project/metamask-skills/tools/install`
- Vendored skills: `.claude/skills/mms-smart-accounts-kit/`, `.claude/skills/mms-gator-cli/`, `.claude/skills/mms-oh-my-opencode/`
- Pivot brief: `docs/00_HACKATHON_PIVOT.md`
- Earlier ADR: `0002-hackathon-pivot-metamask-cookoff.md`
- Affected rule: `.claude/rules/metamask-delegation.md` (updated in this same change)
- Router: `CLAUDE.md` (updated in this same change)
