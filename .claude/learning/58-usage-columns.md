# 58 — /tools' Usage column filled, and a repository's skills shown on its row

**Task:** `docs/tasks/58-usage-columns.md`
**Completed:** 2026-11-03
**Commit:** `c86def2`, `f5293bd`, `2c5c24d`, `6bfb806`, `ea6535f`, `bb04431` on `feat/58-usage-columns`
**Verifier verdict:** PASS (second round; round 1 FAIL — the correction missed ADR `0094` §2 and task 42)

## What shipped

- `data/deployments/13579.json` `arp.sponsor` + `apps/web/src/lib/sponsor.ts` `sponsorAddressFor(chainId, configured, recorded)` — the env var overrides, blank falls back to the record, `null` off 13579.
- `packages/graphql/src/queries/tool-listing.ts` (`subject_id`), `packages/protocol/src/tool-listing.ts` — `ToolListing.declarers`, each agent once per tool.
- `apps/web/src/services/tool-catalog.ts` — `skillUsageByRepo` (agents once across a repo's skills, from every row read), `repoKeyOf`.
- `apps/web/src/components/tool/ToolCatalogList.tsx` — person glyph + count on a repository's qualifier line; `PersonMark` extracted from `StakerCount.tsx`.
- `scripts/measure/sponsor-deposit-provenance.ts` — splits the deposits counted as Usage by sponsor-ledger kind.
- Dated corrections: ADR `0094` §2, `docs/tasks/42` lines 16 and 38.

## Surprises

- The Usage column had been empty since the sponsoring service went live: the address existed only as an env var nobody set.
- The sponsor address is also ARP's deployer, so "proven" is decided by sender, not by the gate. Testnet 13579, 2026-11-03: 13 deposits counted as Usage — 6 proof-gated, 4 edge creations the service paid for, 3 not in a ledger (all on `Agent 13579:2`, before the service existed). A live limit, not a latent one.
- ui-reviewer refused "N skills declared · M usage" because it reused the column names. The user chose a glyph and one count.

## Decisions made

- **The sponsor address is in the deployment record, with the env var as an override** — a public EOA address, not a key. No ADR; task §2.
- **A repository row counts agents, not deposits, and never sums with its own columns** — user, 2026-11-03. Task §2.

## Rules touched

- `.claude/rules/claims.md` — sufficient. Check 5 caught the miss in round 1: the retraction reached the code and the new docs but not ADR `0094` §2 or task 42, which the code cites.
- `.claude/rules/code.md`, `ui.md` — sufficient. Uncommented `as` casts on `JSON.parse` in `scripts/measure/*` are the existing convention there; `scripts/` is linted by nothing.

## Suggestions for future tasks

- When a measurement changes what a label means, grep the ADRs and task files the code cites, not just the code.
- To close the Usage limit, the service needs a key used only by the service, and deposit events that tell a creation from a deposit.
- `packages/protocol` full suite: `node-serve.test.ts` body-cap timed out again (`STATE.md:421`). It is not in this diff and now has a reproduction on this machine.

## Evidence ladder

**Which tier of the evidence ladder does this serve, and does it move ARP up it?**

Tier 3 (staked): it makes the sponsor's deposits visible where they read as plain declarations and shows how many agents use a repository's skills. It does not move ARP up a tier, and not every deposit it shows passed the proof gate.
