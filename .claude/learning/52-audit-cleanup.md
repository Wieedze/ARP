# 52 — the audit cleanup

**Task:** `docs/tasks/60-audit-cleanup.md`
**Completed:** 2026-11-03
**Commit:** `c9cdbc9` (branch `chore/59-audit-cleanup`; task work ends at `799e9bb`)
**Verifier verdict:** PASS

## What shipped

- `contracts/src/enforcers/TrustStakeCapEnforcer.sol`: state keyed by `(msg.sender, delegationHash)`.
  Redeployed on testnet 13579 at `0x19e07280F1483Aa9aCDb1a7F8C61bfd20c7879Bc`, where the v2 ABI
  answers `getState(address,bytes32)`. Mainnet 1155 is untouched. ADR `0118`.
- `contracts/src/enforcers/ReceiptEnforcer.sol`: replay is keyed by signer and payment.
  `IdentityRegistry` coverage went from 0% to 100%. The deps are submodules, and a fresh clone builds
  and passes 113/113 forge tests.
- `packages/protocol/src/signature.ts` accepts only `["assessment.signature"]` as an exclusion, and
  `profile.ts` refuses a document about another agent. The status `verified` is renamed
  `self-signed`. ADR `0119`.
- `apps/sponsor`, `apps/mcp`, `apps/node`: foreign Origin, rebinding Host and non-JSON POSTs are
  refused. State lives under `~/.arp`. The sponsored mode refuses HTTP. ADR `0116`.
- `apps/web`: import reset, the quote's own client, the ceiling enforced in the service, http(s)-only
  links, dead services deleted. The ui-reviewer's required finding (a rejected re-sign) is fixed in
  `e2331a6`, with a test.
- `.github/workflows/ci.yml`: check, lint, test, packaging and forge on push and PR to `main`/`dev`.
  Action tags confirmed to exist. ADR `0117`.

## Surprises

- The audit wanted delegation-framework pinned at v1.3.0. The vendored tree turned out to be
  `main@1bdb8a3`, which is later than the tag. It was pinned as found, and the reason is recorded in
  `contracts/foundry.toml`.
- The URL normalisation fixes were done after a scan showing no catalogue URL and none of the 744
  testnet tool Things move. That scan is what kept them clear of "change what an existing atom
  hashes to".
- The main checkout's submodules are uninitialised (`git submodule status` shows `-`), while
  `contracts/lib/` still holds the old vendored files. `forge test` there prints a failed submodule
  clone and then passes anyway.

## Decisions made

- **Rename `verified` to `self-signed`** instead of anchoring the signer to the provider (user,
  2026-11-02). ADR `0119` addendum.
- **`curveId` stays optional**: making it required costs churn and changes nothing. ADR `0119`.
- **Mainnet enforcer not redeployed**: it needs the user's confirmation. v1 delegations on testnet
  must be re-signed.

## Rules touched

- `solidity.md`, `metamask-delegation.md`, `portability.md`, `security.md`, `task-verifier.md` and
  the router were rewritten to state the current rule. ADR `0117`.
- `.claude/learning/TEMPLATE.md` still carries the retired hackathon "Narrative preservation"
  section. The ladder answer has no slot in it.

## Suggestions for future tasks

- Mutation-check security fixes before calling them done. The verifier reverted four (cap enforcer
  key, signature excludes, document/agent match, sponsor guard), and each one turned its test red.
  That is cheap and decisive.
- CI's contract-deps step runs `git submodule update --init --recursive`, which pulls the ~500 MB
  FCL/SCL trees that `bun run --cwd contracts deps` skips. Its comment also names a
  `contracts/scripts/setup-deps.sh` that does not exist. Switch the step to the `deps` script.
- Run `bun run --cwd contracts deps` in the main checkout so that the working tree matches the
  gitlinks.
- `format:check` (~286 files) needs a coordinated window when no other branch is open.

## Evidence ladder

Staked tier. The task does not move ARP up the ladder. It makes the existing staked machinery safe
to rely on: the cap can no longer be griefed, and the sponsor cannot be made to spend by a web page.
It also stops the rated tier from overstating a self-signed document.
