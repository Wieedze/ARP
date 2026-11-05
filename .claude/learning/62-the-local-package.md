# 62 — The whole package, working locally

**Task:** `docs/tasks/70-the-local-package.md`
**Completed:** 2026-11-05
**Commit:** `8dcdad5` (branch `feat/agent-pulse`, not pushed)
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

## Evidence ladder

**Which tier of the evidence ladder does this serve, and does it move ARP up it?**

Tier 3, staked: it makes a declared line reachable from one install, and it moves ARP up only when somebody else writes one.
