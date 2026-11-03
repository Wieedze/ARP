# Task 60 — the audit cleanup

**Status:** **VERIFIED 2026-11-03** — task-verifier PASS at `c9cdbc9`, post-mortem `.claude/learning/52-audit-cleanup.md`, closed at `32b3c91`. Branch `chore/59-audit-cleanup` (the branch
keeps 59; the task is 60 because 59 belonged to another session).

**Origin.** A read-only audit of the whole repo, 2026-11-02, four reviewers in parallel (web,
packages, server apps, contracts + scripts + repo). The user asked for every finding to be planned
and executed. The report: https://claude.ai/artifact/S2fjBrRHwrkemiGn9ppWbs

**Required skills:** `arp-contributing`; `ethskills`, `secure-workflow-guide` for stream A.

**Do not do in this task:** deploy anything to mainnet; change what an existing atom hashes to;
split `Landing.tsx` (task 53 is still open on it).

## Decisions (user, 2026-11-02)

- Tasks 53 and 57 merged into `dev` first.
- `TrustStakeCapEnforcer`: fix, test, **redeploy on testnet 13579**. Mainnet's copy stays as it is.
- The signature status `verified` is renamed `self-signed` (user, 2026-11-02). Shipped in `7aaa1ad`,
  ADR `0119` addendum.
- `apps/probe` is kept as it is (user, 2026-11-02). Only its index was added, in `0d6f74c`.

## Streams

Each stream is a branch off this one, merged back here.

| stream | scope                                                                                       | ADR    |
| ------ | ------------------------------------------------------------------------------------------- | ------ |
| A      | contracts: enforcer griefing, `ReceiptEnforcer` replay key, `IdentityRegistry` tests, deps, deploy scripts, `SECURITY_REVIEW.md`, README's contract section | `0118` |
| B      | `packages/`: signature excludes, document/agent match, probe SSRF, required `graphqlUrl`/`curveId`, chain check, body timeouts, bounded queries, swallowed errors, dead exports, duplicated helpers | `0119` |
| C      | server apps: sponsor Origin/content-type, state under `~/.arp/`, one key loader, `/mint-gas` and `/identity` order, timeouts, node abort and XFF, MCP HTTP guard | `0116` |
| D      | `apps/web`: import reset, quote's own client, stake ceiling in the service, safe links, storage, dead code, stale comments | —      |
| E      | scripts, CI, repo hygiene, rules and process files                                          | `0117` |

The ADR column read `0114`/`0115` for A and B when the plan was written; `0114` is task 53's, and A and B landed as `0118` and `0119`. Streams F and G were added during review: F the
follow-ups, G the `ui-reviewer` fixes.

## Acceptance

- Every CRITICAL and HIGH item in the report is fixed or carries a written reason it is not.
- Each fix to a security finding ships with a test that fails without it.
- All gates green, and CI runs them.

## What shipped

`git log --oneline dev..799e9bb` lists 127 commits (2026-11-02 and 2026-11-03), seven of them
merges.

- **A — contracts** (`chore/59a-contracts`, ADR `0118`). `TrustStakeCapEnforcer` keys its state by
  caller and delegation (`0dc6be5`); redeployed on testnet 13579 at
  `0x19e07280F1483Aa9aCDb1a7F8C61bfd20c7879Bc`, tx `0x8dd54ea3…3159` (`da86e09`), the old copy kept
  as `trustStakeCapEnforcerV1`, mainnet untouched. `ReceiptEnforcer` keys replay by signer and
  payment (`9cd90ad`). `IdentityRegistry` 0% → 100% lines and branches (`53cb45d`). Solidity deps are
  git submodules (`43e3588`); `deploy.sh` refuses mainnet and skips what exists (`52b0fcb`);
  `bun run lint` runs and passes (`515bc4b`); `SECURITY_REVIEW.md` and the README's contract section
  describe what `src/` holds.
- **B — packages** (`chore/59b-packages`, ADR `0119`). Only the signature block counts as a signed
  exclusion; an assessment about another agent is not verified; the probe follows redirects by hand
  and checks every hop; `graphqlUrl` is required and no reader defaults to mainnet; `multiVaultReads`
  refuses an RPC on the wrong chain; deadlines cover body reads and bodies are capped; cut reads say
  so; an unreachable chain is not an absent agent; `serveFetch` binds loopback; one `DEFAULT_CURVE_ID`;
  dead exports deleted; one definition per identifier shape.
- **C — server apps** (`chore/59c-apps`, ADR `0116`). The sponsor refuses cross-origin, rebinding or
  non-JSON requests before any route; local state (sponsor ledger, node ledger, receipt key) under
  `~/.arp` / `ARP_HOME`; one key-file policy for the four keys; `/mint-gas` requires a signed request;
  `/identity` checks limits before it pins; bounded receipt waits; the node aborts a handler past its
  time and reads only the tunnel's client header; the MCP HTTP transport refuses a web page and the
  sponsored mode refuses HTTP; no RPC URL reaches a caller; the sponsor is one file per route.
- **D — web** (`chore/59d-web`). Every submit simulates, guards and waits on the quote's own chain;
  one public client per chain id; `quoteStake`/`submitStake` enforce the stake ceiling; metadata links
  must be http(s); stored delegations are read without throwing; the SKILL.md read has a timeout and a
  byte cap; services only tests reached are deleted; comments state the current why.
- **E — repo** (`chore/59e-repo`, ADR `0117`). CI runs the gates on push and PR to `main` and `dev`
  (`8b431c3`); the raw-key signer refuses every chain but 13579; `demo-hire` pays testnet only within
  `--max-pay`; `.claude/worktrees/` is ignored; PR drafts moved to `docs/reference/pr-drafts/`; the
  router, `solidity.md`, `metamask-delegation.md`, `portability.md`, `security.md` and `task-verifier`
  state the current rule; `mms-oh-my-opencode` removed.
- **F — follow-ups** (`chore/60f-followups`). `verified` renamed `self-signed` (`7aaa1ad`); every hop's
  name is resolved before a probe or a registration fetch (`8507bda`); an unreadable chain answers
  503, never 403; the cap enforcer spec in the rules is the shipped v2; `enforcer-events` scans the
  replaced testnet copy too.
- **G — UI fixes** (`chore/60g-ui-fixes`). Stake submits read the quote's own client; an identity
  record priced on an unknown chain is refused; an ownership reply for an edited token is dropped; a
  rejected re-sign keeps the existing signature; the ceiling refusal names no env var (and `1dd6cde`
  on the branch).
- **On the branch directly**: `normaliseToolUrl` is idempotent (`04ed00a`); the attestor's hierarchy
  and tag backing read one curve (`0264b55`); a refused body's socket is dropped on a timer
  (`bd2a23a`); the probe's readings are indexed on `at` (`0d6f74c`); a self-signed verdict is not
  drawn in the accent (`efede14`).

**Reviewers:**

- `contract-reviewer`: FAIL (vacuous cap invariants, `0ef59cd`), then PASS after `d46c30b` and
  `d755b9c` (`a4db614`).
- `intuition-integrator`: FAIL, then PASS after `04ed00a` and `0264b55`.
- `ui-reviewer`: FAIL, fixed in the `chore/60g-ui-fixes` merge (`4a1ff8c`); not yet re-reviewed.

## Not done, and why

- `bun run format:check` fails on about 286 tracked files. Not formatted: a repo-wide format would
  conflict with other sessions' open branches.
- `.claude/worktrees/` (598 MB at the audit; a registered worktree of `feat/41-x402` plus agent
  worktrees) is gitignored but not removed. The user decides.
- `Landing.tsx` (1,019 lines) is not split while task 53 is open on it.
- The node-serve body-cap test timed out on one machine and not another. Hardened in `bd2a23a`,
  never reproduced.
- DNS rebinding stays open for the probe in a browser.
- The sponsor's `/list-tool` (ADR `0120`, task 53c) is arp-c4's, not this task's.
- Anchoring `verified` to a checked author was the alternative to the rename; the user chose the
  rename.
- `curveId` stays optional (ADR `0119`).
- Delegations signed against the v1 testnet enforcer still run v1 and their operators must re-sign;
  the mainnet copy still runs v1; the user decided 2026-11-03 that nothing goes on mainnet for now.
