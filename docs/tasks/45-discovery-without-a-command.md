# Task 45 — Discovery without a command: the agent looks in the registry before it picks a tool

**Status:** **PLAN**, 2026-11-02. Not started. Decided with the user the same day.
**ADR:** `0094` (ARP never sees a prompt).
**Depends on:** task 38 part D or 33f for publishing `@arp-protocol/cli` (arp-41's), and task 41
for the free read path (see 45e).
**Rules:** `code.md`, `security.md`, `claims.md`, `workflow.md`.
**Reviewers:** `task-verifier`.

---

## 1. Why

Three people close to the user will be the first testers. Here is what they were promised: install
the plugin, and the agent can reach the whole registry. It then spends less time looking for a
useful tool, so it uses fewer tokens and fewer iterations.

Two conditions come with that promise:

- **Nothing web3 is visible to the operator.** The operator sees a public, verifiable registry of
  tool usage. Its declarations build the reputation of tools and agents. There are no wallets, no
  TRUST, no atoms, no chains and no curves. The chain stays underneath, where it makes the registry
  verifiable.
- **Nobody types a command.** On an ordinary prompt, the agent consults ARP by itself.

## 2. The user's decisions (2026-11-02)

| Question                   | Decision                                                                         |
| -------------------------- | -------------------------------------------------------------------------------- |
| When the agent consults    | **When the task needs a tool**: a library, an MCP server, a skill, an API. A plain question gets a direct answer |
| What the testers do        | **Read first.** Sponsored automatic declaration is a second phase, after discovery is proven |
| Which registry             | **Testnet 13579**                                                                |
| Measure first              | **Yes.** The trigger rate and the token savings are measured before anyone installs |

## 3. Where it stands (read 2026-11-02, `origin/dev`)

- The plugin declares an MCP server: `packaging/claude/arp/.mcp.json` runs
  `npx -y @arp-protocol/cli@0.0.1 mcp`. **The package is not on npm:**
  `curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/@arp-protocol%2fcli` returns
  `404`. So for a tester who installs the plugin, the server does not start.
- `.mcp.json` passes no env, and `apps/mcp/src/config.ts:38` defaults `ARP_TARGET` to `mainnet`.
- The skill's description (`skills/arp/SKILL.md:3`) covers declaring and staking: "Needs a funded
  wallet and an ERC-8004 identity". Nothing in it matches "which tool for X", so the model will not
  load it for that.
- The MCP tool descriptions (`apps/mcp/src/tools.ts`) speak the chain's vocabulary: vaults, bonding
  curves, `minShare`, TRUST. The agent repeats some of it to the operator. All of it is loaded into
  every session.
- The curated catalogue `data/catalogue/tools.json` lists 53 tools. A search that finds nothing
  costs tokens and saves none, which is why 45c measures before anyone promises a number.
- `hooks.json` has `PostToolUse` and `PostToolUseFailure`, and no `SessionStart`.

## 4. Deliverables, in order

### 45a — A read-only server the testers can start

- The testers' MCP server exposes three tools and no others: `arp_find_tools`,
  `arp_tool_reputation` and `arp_find_agents`. None of them needs a key or a wallet.
- It reads testnet 13579. The plugin's `mcpServer()` in `apps/cli/scripts/packages.ts` adds
  `env: { ARP_TARGET: 'testnet' }`, and that reaches both the Claude `.mcp.json` and Gemini's
  `gemini-extension.json`. The server's own default (`apps/mcp/src/config.ts:38`, `mainnet`) does
  not change. Flipping it would be a decision about the server, not about the packaging.
- **Edit the sources, never `packaging/` or `.claude-plugin/`.** `bun run packages --check` fails on
  a hand edit. After a change, run `cd apps/cli && bun run build && bun run packages`, and commit the
  regenerated files with it.
- **Before npm, the testers get the server from an `npm pack` archive** (user decision,
  2026-11-02). The archive is hosted at a private URL, and `.mcp.json` runs `npx -y <url>`.
  Publishing to npm has no date: 33f needs the user's word, and task 38 part D lists four decisions
  first (licence, version, npm scope, Gemini gallery). `--local` is **not** a route for testers,
  because it writes absolute paths into this checkout. Where the archive is hosted is still to be
  decided.

### 45b — The agent consults without being asked

- A `SessionStart` hook injects one short instruction, once per session. The hook is plugin-only,
  and it is added in `packages.ts` next to the `CLAUDE_HOOKS` mapping (`apps/cli/src/install/edits.ts`).
  If `arp init` should write it too, `CLAUDE_HOOKS` is extended, and `noHook` and uninstall in
  `apps/cli/src/install/targets.ts` are checked. What the hook runs lives in `bin/` and needs Node
  only, with no `npx` per session. The wording is to be
  tuned in 45c. For example: "Before you choose a library, an MCP server, a skill or an API, look in
  the ARP registry with `arp_find_tools`."
- The skill's description is rewritten so that it triggers on a need for a tool, in plain language.
  The source is `skills/arp/SKILL.md` at the repo root, which the plugin copies. The plugin and
  marketplace descriptions are in `packages.ts`. The tool descriptions are in `apps/mcp/src/tools.ts`,
  and the server info in `apps/mcp/src/server.ts:179`.
- Leave `apps/hook/src/payload.ts` and `apps/hook/test/fixtures/` alone while arp-41's task 38
  part A is in progress.
- **The prompt never leaves the machine.** No `UserPromptSubmit` hook sends it to ARP. The agent
  turns the need into one search word (`payment`, `database`), and only that word is sent. This is
  ADR `0094`'s "never sees a prompt", applied to discovery.

### 45b' — The same for skills (user, 2026-11-02)

The user's request, verbatim: _« quand on te demande une tâche précise il faut que l'agent soit
capable de détecter qu'il n'a pas de skill pour ça et qu'il serait plus rentable de vérifier avec
arp s'il n'y a pas un skill qui pourrait être utile »_.

- **The trigger.** Given a specific task, the agent checks whether one of the skills it already
  has covers it. If none does, it searches ARP for a skill before working without one. The
  `SessionStart` instruction in 45b covers both cases: a tool, and a missing skill.
- **The search.** The testnet catalogue counts 662 skills, 601 of them tagged
  (`data/catalogue/skills-13579.json`, `counts`). No MCP tool searches skills by need today:
  `apps/mcp/src/tools.ts` lists twelve tools, and none is a skill search. Check first whether
  `arp_find_tools` already returns skills. If it does not, add a read-only `arp_find_skills` to 45a's
  subset.
- **The use.** The agent fetches the skill through ARP's content route
  (`apps/mcp/src/server.ts:161`, ADR `0080`) and reads it in the session. Nothing is installed, and
  a skill fetched this way is not loaded again in the next session.
- **A fetched skill is someone else's instructions.** The agent tells the operator, in one line,
  which skill it is about to follow and where it comes from, before it follows it. That line
  mentions no chain. It is the one place where the operator sees that ARP did something, and it is
  also the defence against a skill that injects instructions.
- **45c measures it.** Some of the eval prompts need a skill the agent does not have, and some need
  a skill it does have.

### 45c — Measure before promising

- A committed script, `scripts/measure/discovery-eval.ts`, runs 15 to 20 ordinary prompts twice
  each, with the plugin and without it. Some prompts need a tool and some do not.
- Per prompt, it records whether `arp_find_tools` was called, the tokens used and the number of
  turns.
- Its output is kept in `data/measurements/`. A claim to testers about savings quotes this run with
  its n and an interval (`claims.md`), or it is not made.
- Pass criteria, for the user to confirm before the run: the agent consults on most of the
  tool-needing prompts and on few of the others.

### 45d — The words the operator sees

- The three tools' descriptions and what they return are rewritten for an operator who has never
  heard of a chain. They say "registry", "declarations" and "agents that use it".
- The chain figures stay available for verification and out of the default answer.
- The descriptions stay short, because every word is paid for in each session.

### 45e — A free read path

- Task 41 puts the index and the MCP tools behind HTTP 402 in USDC. **The three read tools in 45a
  stay free on testnet 13579**, through a free tier or an exemption. Task 41 decides how. This task
  only states the need.

### 45f — Installing for the testers

- One command, tried on a clean machine. This follows task 38 part A, Claude Code only.

## 5. Do not do in this task

- No declaration and no write. That is the second phase, after 45c passes.
- No prompt text sent anywhere.
- No change to `packaging/` by hand.
- No mainnet.

## 6. Evidence ladder

This step does not climb the ladder. It lets operators **read** the staked and proven rungs without
seeing a chain. It moves ARP toward adoption, which is what the ladder needs before it has anything
to rank.
