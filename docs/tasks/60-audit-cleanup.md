# Task 60 — the audit cleanup

**Status:** **IN PROGRESS**, 2026-11-02, branch `chore/59-audit-cleanup`.

**Origin.** A read-only audit of the whole repo, 2026-11-02, four reviewers in parallel (web,
packages, server apps, contracts + scripts + repo). The user asked for every finding to be planned
and executed. The report: https://claude.ai/artifact/S2fjBrRHwrkemiGn9ppWbs

**Required skills:** `arp-contributing`; `ethskills`, `secure-workflow-guide` for stream A.

**Do not do in this task:** deploy anything to mainnet; change what an existing atom hashes to;
split `Landing.tsx` (task 53 is still open on it).

## Decisions (user, 2026-11-02)

- Tasks 53 and 57 merged into `dev` first.
- `TrustStakeCapEnforcer`: fix, test, **redeploy on testnet 13579**. Mainnet's copy stays as it is.
- Pending: what "verified" means for an assessment signature (rename, anchor, or keep); `apps/probe`
  kept or removed.

## Streams

Each stream is a branch off this one, merged back here.

| stream | scope                                                                                       | ADR    |
| ------ | ------------------------------------------------------------------------------------------- | ------ |
| A      | contracts: enforcer griefing, `ReceiptEnforcer` replay key, `IdentityRegistry` tests, deps, deploy scripts, `SECURITY_REVIEW.md`, README's contract section | `0114` |
| B      | `packages/`: signature excludes, document/agent match, probe SSRF, required `graphqlUrl`/`curveId`, chain check, body timeouts, bounded queries, swallowed errors, dead exports, duplicated helpers | `0115` |
| C      | server apps: sponsor Origin/content-type, state under `~/.arp/`, one key loader, `/mint-gas` and `/identity` order, timeouts, node abort and XFF, MCP HTTP guard | `0116` |
| D      | `apps/web`: import reset, quote's own client, stake ceiling in the service, safe links, storage, dead code, stale comments | —      |
| E      | scripts, CI, repo hygiene, rules and process files                                          | `0117` |

## Acceptance

- Every CRITICAL and HIGH item in the report is fixed or carries a written reason it is not.
- Each fix to a security finding ships with a test that fails without it.
- All gates green, and CI runs them.
