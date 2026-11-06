# 62 — The whole package, working locally

**Task:** `docs/tasks/70-the-local-package.md`
**Completed:** 2026-11-05
**Commit:** `8dcdad5`, launch re-checked at `091e0db` (branch `feat/agent-pulse`, not pushed)
**Verifier verdict:** PASS, at the second reading. The first listed five fixes, all closed in `8dcdad5`. Item 1's done-when stays open: `claude plugin marketplace add` and `install` have not run in a clean `HOME`, and the task's status line says so. Publishing, hosting and the push wait on the user

## What shipped

- `apps/mcp/src/handlers/pulse.ts`, `apps/mcp/src/handlers/agents.ts` — one search: skills and agents, with `offers_matching_need` reading up to ten agents' signed addresses.
- `apps/cli/src/share.ts`, `apps/cli/src/cli.ts`, `apps/mcp/src/line.ts` — `arp share` and `arp line`: a local failure becomes a public line on testnet 13579 only after sharing is turned on.
- `apps/sponsor/src/github.ts`, `apps/sponsor/test/github.test.ts` — `POST /list-tool` refuses a repository unless GitHub says `private: false`.
- `docs/22_RUNNING_THE_NODE.md`, `README.md` — the key and the outbound connections `arp line` and `arp share send` add; sharing needs a sponsoring service you run yourself.
- `docs/tasks/70-the-local-package.md` — the walk, step by step, the failed step 6 kept beside the run that passed after `efa2a9e`.

## Surprises

A token can read what the world cannot: with `GITHUB_TOKEN` set, the existence check took a private repository for a real one, and `arp share` could have made its name public and permanent. A check for "exists" is not a check for "may be public".

The local walk found a regression the unit tests had not: one search looked for agents only inside a domain, so an agent that inferred `business` never reached the agent in `document`.

## Decisions made

- **Fail closed on visibility** — anything but `private: false` is refused, a missing field included. No ADR: the rule follows from a line being public and permanent.
- **The content server did not run in the walk** — the plugin no longer serves `arp_get_skill`, so no step needed it; the task says so rather than ticking it.

## Rules touched

- `.claude/rules/security.md` — sufficient for the signing rows; it does not list private data reaching the chain through a sponsored listing as a hazard.
- `.claude/rules/claims.md` — sufficient; every number in the five fixes re-derived from code or from the committed run.
- `.claude/rules/workflow.md` — sufficient.

## Suggestions for future tasks

- With a token set, `POST /list-tool` tells a caller that a private repository the token can read exists, by naming it "not public" where one it cannot read gets "does not exist". Harmless while the sponsor runs on the user's machine. Decide before hosting it: run it without a token, or give both the same refusal.
- `resolveOnGitHub` guards the listing only. A line needs an atom (`apps/sponsor/src/routes/line.ts:75`), so it cannot get past it, but a new route that writes a URL must call the same check.
- This post-mortem's number and `61-tools-page-signals-and-wallets.md`, untracked in the main folder, sit beside `61-a-false-line.md` here: two files numbered 61 once the branches meet. Rerun `scripts/build/build-claude-index.ts` after merging.

## Re-check of the launch, 2026-11-06, at `091e0db`

PASS. The build of `091e0db` equals the tarball on the local registry (`diff -rq` of `apps/cli/dist`, rebuilt by `check:node`, against the tarball). As uid 1000 in a clean `node:22-bookworm-slim`, through the line in `packaging/claude/arp/.mcp.json`, from a project at a path with a space, holding planted `node`, `npx`, `arp`, `skills`, `npm`, `sh` and a dead `.npmrc`:

- The server runs in `/`, with `ARP_PROJECT_DIR` naming the project and no project entry on `PATH`.
- `arp_get_skill`, against a stub content server and an accepted question, wrote `.claude/skills/thumbs/` and `.arp/receipts.jsonl` in the project, and neither `/.claude` nor `/.arp` exists. The stub stands in for the content server: its receipt is really signed and verified, its skill is invented.
- `arp_declare_session` names the project's `.arp/session.jsonl`. With `ARP_SESSION_LOG=logs/s.jsonl`, the published hook wrote `<project>/logs/s.jsonl` and the server read that line. An absolute path stays as given.
- A real `arp_pulse` ran `npx skills find`, 100 results, and no planted program ran.

With real `claude mcp` 2.1.318 in a throwaway `HOME`, as user `max`, a second `arp init --yes` says `already declared with this command` and `Nothing to change`, plain and `--sponsored`, and the entry does not change.

`bun run test`: `apps/mcp` 215, `apps/cli` 55, `apps/hook` 67, 0 failed. `check:node`, `packages --check` and `check:scripts` each exit 0.

**Not tested:** Windows, and the launch needs `sh`. No real Claude session started the server, only `claude mcp get`.

**Left as it is:** a relative `ARP_SESSION_LOG` agrees when the hook runs from the project. Run from `<project>/sub`, the hook wrote `sub/logs/s.jsonl`, which the server does not read. The default path follows the `cwd` the hook is given in the same way, so this is not new. Whether Claude Code runs a hook from a subdirectory was not tested.

## The plugin carrying the CLI, verified 2026-11-06, at `21b9022`

PASS, on the second verification of this work (ADR `0145`, amendment). `21b9022` landed during the run, so the gates ran again at it.

**Planted project**, path with a space, holding `node`, `npx`, `arp`, `skills`, `npm`, `sh`, a `package.json` and a dead `.npmrc`, at its root and in `node_modules/.bin`. No planted program ran through any of: the real `.mcp.json` with the real `npx` and search; `claude mcp list` (2.1.318), which showed `plugin:arp:arp: node <clone>/packaging/claude/arp/bin/arp.js mcp - ✔ Connected`, so `claude` expands `${CLAUDE_PLUGIN_ROOT}`; one real `haiku` session, $0.005, `mcp__plugin_arp_arp__arp_pulse`, `results_found` 100, hook wrote `.arp/session.jsonl`. From a git URL over local smart HTTP, the plugin is copied to `plugins/cache/arp/arp/0.0.1/` and connects. The real `owner/repo` on GitHub was not run, as the branch is not pushed.

**`plugin-start.sh` run again at `21b9022`:** alone 123 to 136 ms, median 126; together 0 of 80, 102 to 156 ms, Node 22.23.4. The committed raw file gives the quoted figures: median 126.5, 105 to 153 ms, 2,023,282 bytes at `562b98f`, 448 and 469 KiB, 572,759 bytes before `gc`, 3,449 lines. At `21b9022` the file is 2,023,954 bytes, 471,175 gzipped.

**`bin/arp.js`:** no key, token or home path found by pattern scan. Local addresses are defaults and one catalogue fixture (`http://localhost:3002/mcp`, rig agent 3). `packages --check` exits 0 from a fresh clone, and 1 after an edit in `apps/cli/src`, `apps/mcp/src`, `packages/protocol/src`, and in the file itself.

**What stops a public line.** Tried with `ARP_SPONSOR` dead, so no line was written:

| Route | Result |
| --- | --- |
| Skill tool, `arp:share-send` | refused, `disable-model-invocation` |
| `Bash`, default permissions | denied, "requires approval" |
| `Bash`, allowed by the session | **ran the file**: "sharing is off: nothing was sent" |
| `Bash`, allowed only as `... arp.js" share` | `share send` denied |
| `Write` on `sharing.json`, default permissions | not written |
| `/arp:line ...; touch X`, `$(touch X)`, inside the project | refused by the permission check, no file |
| `/arp:line`, sponsor dead | names the service and `ARP_SPONSOR` |

So a model is stopped by the session's permissions, not by ARP. Sharing off does not bind a model allowed `Bash`, as `share on` is the same file, and `line` does not read it at all. Past permissions, the last stop is a sponsoring service answering at `ARP_SPONSOR`, today only one the person runs. The write itself was not run with sharing on.

**`arp init`, real `claude mcp`, throwaway `HOME` and config:** foreign `arp`: exit 6, entry unchanged, hook written. `--force`: replaced, old entry printed first. Then `Nothing to change`. `uninstall` leaves a foreign entry. File route (Cursor) and Codex: exit 6, then `--force` replaces; Codex keeps `[mcp_servers.other]` and drops the foreign sub-table.

**`node_modules/.bin` in the home folder.** Reproduced, and the cause is now confirmed: `@npmcli/run-script/lib/set-path.js:19-28` (npm 10.9.4) puts `node_modules/.bin` of **every parent** of the search's folder on `PATH`, so the `node` that runs `skills` is the planted one. A planted `node` that calls the real one leaves the search working, with nothing to see. A planted `skills` alone did not run. A project in a subfolder of the home did not fire; `ARP_HOME` inside a project did, and a home that is the project did.

Who can write there: that OS user or root, who can already run anything as that user. A repository reaches it only by sitting at or above `HOME` (a dotfiles checkout, a container or sandbox whose `HOME` is in the project), or through `ARP_HOME` set inside a project. Not new: `apps/mcp` and `packages` have no diff against `origin/main`, and `cwd: home` dates from `c5b65f2`; `origin/main` itself was not run. It does not block. `docs/22` and ADR `0145` state it.

**Gates at `21b9022`, each exit 0:** `bun run test` in `apps/api` 16, `apps/cli` 62, `apps/hook` 67, `apps/mcp` 215, `apps/node` 60, `apps/probe` 14, `apps/sponsor` 124, `apps/web` 773 and 2 skipped, `packages/graphql` 21, `packages/protocol` 1155 and 4 skipped; `apps/web` tsc, lint, `check:tokens`; `check:scripts`; `test:scripts` 42; `packages --check`; `check:node`.

**Not tested:** Windows and macOS. Linux under WSL2 and a Debian container only. Grok Build with this `.mcp.json`. A logged-in clean `HOME` (step 1 of the walk). A real line through `/arp:share-send` or `/arp:line`.

**Left for a decision, none blocking:**

- `arp init --force`, and `--dry-run --force`, print the foreign entry through `claude mcp get`, unredacted: `MY_SECRET=abc123` in the run. An agent running it gets the value in its transcript. The Cursor route printed it too. Needs a server named `arp` with an inline secret, and the flag.
- `apps/cli/README.md:33` "the model cannot invoke them" is true of the commands and says nothing of `Bash`; `docs/31:44` "only if the person turned sharing on" is the design, not a limit on a session that allows `Bash`. ADR `0145` and `docs/tasks/70` have the accurate version.
- The home-folder case has no fix short of a search folder with no writable parent, or running `skills` without `npx`.

## Evidence ladder

**Which tier of the evidence ladder does this serve, and does it move ARP up it?**

Tier 3, staked: it makes a declared line reachable from one install, and it moves ARP up only when somebody else writes one.
