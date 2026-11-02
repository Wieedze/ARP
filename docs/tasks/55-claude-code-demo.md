# Task 55 — The Claude Code demo: a fetched skill the runtime can invoke, paid by the sponsor

**Status:** **BUILT**, 2026-11-02, branch `feat/55-claude-code-demo`. Not yet walked live.
**Depends on:** task 50 (the sponsored loop, `apps/mcp/src/desktop/`).
**Rules:** `code.md`, `security.md`, `claims.md`, `workflow.md`.
**Reviewers:** `task-verifier`.

---

## 1. Why

`docs/26_DEMO_PLAN.md` §4.1 lists the two pieces the Claude Code demo lacked. The user chose to
build them first, on 2026-11-02, because the Claude Code demo and task 54's arm B both need them.
The user's answer on the hook's record was option A: it stays on the machine and is shown on screen
next to the receipt. Nothing here publishes it.

## 2. What shipped

- **`arp init --sponsored`** writes `ARP_TOOLS=sponsored` and `ARP_SKILLS_DIR=.claude/skills` next
  to `ARP_TARGET=testnet` in the MCP entry (`SPONSORED_ENV`, `apps/cli/src/install/targets.ts`).
  With `--project`, the entry goes in the project's `.mcp.json`.
- **`ARP_TOOLS=sponsored`** is the same mode as `desktop` (task 50): the reads, `arp_get_skill` and
  `arp_declare_used`, with the local agent key in `~/.arp/`. It gets the name the Claude Code entry
  uses.
- **`arp_get_skill` installs the skill** into `ARP_SKILLS_DIR/<name>/SKILL.md`, relative to the
  working directory, when that variable is set and the name is a plain directory name. It says so in
  its answer (`installed_at`). The Desktop extension does not set it, because Claude Desktop's
  working directory is not the user's.
- `packaging/` was regenerated: it had gone stale on `dev` after `ee11cb0` (separate commit).

## 3. Why two sessions

Measured 2026-11-02 with Claude Code 2.1.316 (`claude -p`, a scratch project): a skill written to
`.claude/skills/` during a session answers `Unknown skill` to the `Skill` tool in that session. A new
session in the same directory invokes it (`Launching skill: haiku-maker`). So the demo fetches in
one session and uses the skill in the next. The tool's answer says this.

## 4. Known limits

- Only `SKILL.md` is installed, because it is what the content server serves. A skill that ships
  scripts next to it arrives without them.
- The hook's line stays in `.arp/session.jsonl` (option A). The sponsor's proof is the receipt
  alone (ADR `0109`).

## 5. Do not do in this task

- Publish the hook's record.
- Change the sponsor.

## 6. Evidence ladder

Tier 3 (staked): the declaration is a sponsored deposit in the agent's name. With the hook it gains
the runtime's record of the invocation, shown and not published, which is the strongest evidence
available for a skill (`docs/14`).
