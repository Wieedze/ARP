# Task 55 — The Claude Code demo: a fetched skill the runtime can invoke, paid by the sponsor

**Status:** **BUILT and walked live**, 2026-11-02, branch `feat/55-claude-code-demo`.
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
- **`arp_get_skill` writes the receipt into the project's `.arp/receipts.jsonl`** as well, in
  project mode, so the hook names the atom of the skill it sees invoked.
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

## 3b. Walked live, testnet 13579, 2026-11-02, with the user's approval

A scratch project and a fresh key, whose `HOME` the MCP entry pointed at a scratch directory, so the
user's own `~/.arp` was untouched. `arp init --project --sponsored --yes --runtime claude`, then
`claude -p` with Sonnet:

- **Session 1** ($0.061, 4 turns): `arp_find_tools {query: "thumbnail"}`, then `arp_get_skill`.
  `youtube-thumbnail-design` was written to `.claude/skills/`. The hook logged two `arp` MCP calls.
- **Session 2** ($0.111, 7 turns): `Skill youtube-thumbnail-design` answered `Launching skill`, and
  the hook logged `"kind":"skill"` at 21:35:29 UTC. Claude wrote `thumbnail-brief.md`, then called
  `arp_declare_used`, which took 25 s.
- **Read back from the chain the same day:** agent #11 is owned by
  `0x5c2bC643C69D3f7E226722ca5ae60B2679C72f75`, which holds 990000000000000 shares on curve 1 of
  `0x85b1cb1c8403a229a5a69d20cf34d4910f7d42f897f8fe9507bc46e4b1ea300b`.
- **The hook's line named no atom** in that run (`ref: null`). The receipt was only in `~/.arp/`,
  and the hook reads the project's `.arp/receipts.jsonl`. In project mode, `arp_get_skill` now
  writes the receipt there too. In a later fetch and invocation in the same project, which involved
  no transaction, the hook wrote `"ref":"0x2fe6afa7…3d00"`, the receipt's atom.

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
