# 48 — Claude Desktop walks the loop, and an outside user pays nothing

**Task:** `docs/tasks/50-desktop-walks-the-loop.md`
**Completed:** 2026-11-02
**Commit:** sponsor `cd18f9a`, merged in PR #37 (`433440c`). Then `81c1f4f`, `773c99b`, `eae8d8a` and `fffeef3` on `fix/50-verifier-punch`, not pushed. Extension `5291842` on `feat/50-extension`, pushed, **not merged**
**Verifier verdict:** PASS on round 2

## What shipped

- `apps/sponsor/src/service.ts`: on 13579, a content receipt unlocks a deposit (ADR `0109`). New routes `POST /mint-gas` and `POST /identity`. `/deposit` creates a missing `uses` triple, counted per agent per day.
- `apps/sponsor/src/pin.ts`: Intuition pinning for the two identity Things, with a 15 s timeout.
- `packages/protocol/src/sponsor/limits.ts`: `checkMintGasLimits`, `checkIdentityLimits`, `checkCreateLimits`.
- `apps/mcp/src/desktop/`: the `ARP_TOOLS=desktop` build, with `arp_get_skill` and `arp_declare_used`. The local key is `~/.arp/agent-key`, mode 0600. It signs exactly two calls, `register()` and `approve` for the sponsor, both built locally (`refusal`).
- `apps/web/src/services/identity-mint.ts`: `mintTargetFor`. On testnet the mint goes to ARP's registry on 13579, on mainnet to Base. The quote carries its chain.
- ADRs `0109` and `0110`. A new signing-table row in `security.md`. CLAUDE.md's `apps/mcp/` line now names the Desktop build.

Gates, re-run by the verifier:
- `apps/sponsor`: 57 pass, tsc clean.
- `packages/protocol`: 827 passed, 4 skipped.
- `apps/mcp` on `5291842`: 64 pass, tsc clean over `src/**` and `test/**`.
- `apps/web`: `tsc -b`, lint and `check:tokens` clean; 744 passed, 2 skipped.

On chain (13579, read 2026-11-02):
- `ownerOf(9)` = `0x0B02…da17`, and that owner holds 990000000000000 shares, curve 1, on `0x2ef4…84ca`.
- `ownerOf(10)` = `0xf14b…9338`.
- The ledger has 36 lines, every reservation settled success.

## Surprises

- Round 1 failed, and the main reason was not in the sponsor. The extension's guard allowed any zero-value call to the registry or the MultiVault, and it signed the approval calldata the sponsor's `/gas` returned. So a wrong sponsor endpoint could have had the key sign a `redeem`. The ADR said "signs only what follows" and the code enforced less. The fix is exact `{to, data}` matching against calls the extension builds itself.
- `intuition-integrator` found a latent Medium that none of the task's code introduced: one identity atom can stand for two agents on 13579, because two registries exist there and the recipe omits the registry. It is in STATE's known defects.
- The second walk came from the user's own Desktop run (agent #10). The ledger showed it before the docs did.

## Decisions made

- **A content receipt is sponsored on testnet, gated by chain id rather than config.** ADR `0109`.
- **The Desktop extension holds a local agent key, never used for value.** ADR `0110`.
- **The sponsor creates a missing `uses` triple and the identity terms.** This reverses task 40 §3, on the user's word. ADR `0110`.
- **Verified with the extension unmerged.** Tasks 48, 49, 51 and 52 set the precedent. The SHA verified is `5291842`.

## Rules touched

- `security.md`: sufficient. The signing table took one row.
- `claims.md` check 5: needed. Round 1 found "nothing sent yet" in `docs/12`, STATE rows 40 and 50, the task header and CLAUDE.md, all false once the walks landed.
- `portability.md`: followed. The web mint carries its chain on the quote, and the testnet registry is ARP's own, a rehearsal per rule 4.

## Suggestions for future tasks

- When an ADR says a key "signs only X", the code should match calldata exactly, not just the target contract. Anything a remote service returns is a request to be checked against what the caller already built.
- The two Low fixes in `773c99b` (pin when every term exists; refuse a creation that buys 0 shares) have no dedicated test. Add them when the sponsor is next touched.
- Task §6 says 743 web tests; after the amend it is 744. Recount after amending.
- The extension's 403 retry keys on the sponsor's error string "no identity atom on the graph". A code field would be sturdier.
- Before merge: `/gas`'s `multiVault` and `sponsor` still come from the sponsor's `GET /`. Checking `multiVault` against the deployment record would close the last remote-chosen input.
