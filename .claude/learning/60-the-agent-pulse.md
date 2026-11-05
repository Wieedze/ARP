# 60 — The agent pulse: the same walk for agents, with a second party

**Task:** `docs/tasks/65-the-agent-pulse.md`
**Completed:** 2026-11-05
**Commit:** uncommitted (branch `feat/agent-pulse`)
**Verifier verdict:** PASS (second pass; the first failed on seven items, all closed). Numbered 60 because 57 to 59 are taken on `feat/pulse`.

## What shipped

- `packages/protocol/src/agent-pulse.ts` — agents by domain, a line's receipts each checked against the chain, whether a wallet controls the agent a line names.
- `packages/protocol/src/verify/probe.ts`, `directory.ts`, `pulse-usage.ts` — a pinned document comes from the index first, then Pinata, then `ipfs.io`.
- `apps/mcp/src/handlers/agents.ts`, `tools.ts` — `arp_find_agents` takes `domain`; `arp_agent_endpoints` returns signed addresses, `answers_now`, the offer and the lines, and joins `ARP_TOOLS=read`.
- `apps/node/src/task.ts`, `node.ts` — a handler may export an `offer`; `GET /` no longer publishes the handler's path.
- `scripts/demo/agent-pulse-*.ts`, `agent-call-*` — the walk, the reader, and the test of whether an agent controls before paying.
- `scripts/measure/tunnel-reachable.ts`, `agent-identity-canonical.ts`; `node-outbound.ts` now counts `guardedFetchText`. Raw runs in `data/measurements/`.

## Surprises

- `ipfs.io` and `dweb.link` answered a script 429 on 2026-11-05, from one machine, so an address with a valid proof read `unproven`.
- A new quick tunnel's name first passed the guard's check at 60 s in 6 of 6 runs, while a plain `fetch` got 200 at 4 to 44 s. Two agents refused a live node for that reason, on a probe that kept no reason for failing.
- The labels in the second `agent-call` batch do not match the node's state. Rows 7 to 15 can only be read by tool output from the session logs, which are not committed. The verifier checked them there and they agree with §6.
- A triple's subject carries no authorisation, and that kept producing defects: seven `intuition-integrator` rounds each failed on a concrete one. The canonical atom's id has no registry in it, which the last round found.
- `bun run` loads a `.env` from the cwd even under `env -i`, so "no secret in its environment" needed `--no-env-file`.
- `docs/22`'s outbound figures had drifted before this task (the script already printed 15 modules and 4 outbound against "six modules" and 6). The guarded path it could not see is why.

## Decisions made

- **A receipt is attached to the line, and counts by what it proves** — no new predicate, each check returned, and it holds only if the wallet that paid controls the agent named. ADR: `.claude/choices/0141-an-agent-line-carries-the-receipt-of-the-hire.md` (becomes `0141` at commit).
- **One search, two kinds of result, four uses for an agent you can call** — the user's direction, not evidence. ADR: `.claude/choices/0139-one-search-two-kinds-of-result.md`.
- **Sybil and deny-only griefing deferred** — by the user, and listed as open in the first ADR.

## Rules touched

- `.claude/rules/claims.md` — sufficient. Checks 5 and 6 caught the stale count and the script that could not see the new destination.
- `.claude/rules/code.md` — sufficient. The handler tests it asks for exist only since the first verifier pass.
- `.claude/rules/security.md` — sufficient. No new signature site.
- `.claude/rules/portability.md` — sufficient.

## Suggestions for future tasks

- Run each package's own `test` script: `serveFetch` times out under plain `bun test` and passes under `vitest run`. Tests do not typecheck either, so run `lint`.
- When a test batch's scene depends on a live state, record that state in the raw row rather than the scene's intended label.
- Run the known-registry fix in `atomIsCanonicalFor` through its own `intuition-integrator` round. It has unit and handler tests over a mocked graph, no reviewer round, and no attack on chain.
- Before any figure is built on `wallets_worked`, take up Sybil: every check on this run passed with one operator holding all three keys.

## Evidence ladder

**Which tier of the evidence ladder does this serve, and does it move ARP up it?**

It serves the proven rung (`docs/09` §3), a line backed by a mined payment and the hired node's signature, and moves ARP up on the mechanism and not on independent witnesses: one operator on testnet 13579, and no caveat enforced in this path, unlike that tier's wording.
