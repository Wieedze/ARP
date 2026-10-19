# Task 24 — Make the testnet rig faithful

> **Status: NOT STARTED** (specified 2026-10-19). Phase 0 of `docs/15_ROADMAP.md`.
> **Small, and it unblocks everything else.** Do it first.

## The finding

The rig is already deployed on Intuition testnet 13579 — there is nothing to simulate:

|                                |                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| ARP's own ERC-8004 registry    | `0xC165A2AD2E540A4069E02834009161E2b4490d5A` — live, `totalAgents()` = 2           |
| `ModuleRegistry`               | `0xc9a2f66775828017e984E8be077fA2d17e0A41F4`                                       |
| `DomainScopeEnforcer`          | `0x516B82E29e3Ca46Ca810FC2EEf348932b198f7f9` — **functional here**, unlike mainnet |
| `TrustStakeCapEnforcer`        | `0x7BB56819E9a413B8B4668C5cAF5C494c41dC0F8E`                                       |
| MultiVault · DelegationManager | `0x2Ece8D4d…` · `0xdb9B1e94…`                                                      |

**But both agents carry an empty `tokenURI`.** Verified by `eth_call`: `tokenURI(1)` and
`tokenURI(2)` both return a zero-length string. They were minted with the no-argument `register()`.

So nothing can read them, and **the entire discovery path never runs** — not the verifier, not the
classification, not the capability recovery. The rig looks complete and exercises none of it.

## Do

1. **Give the two agents registration files in the mainnet shape.** `setAgentURI(uint256, string)`
   exists on the registry (`contracts/src/erc8004/IdentityRegistry.sol:172`). The shape that matters,
   from the 2026-10-16 cohort measurement:
   - `services[]`, **not** `endpoints[]` — measured 106 occurrences against 2 across 150 random Base
     ids. A verifier reading only `endpoints` sees almost nothing, and that was a real bug.
   - a declared protocol name on at least one endpoint, so the handshake path exercises.
   - **capabilities on at least one** — 0 of 112 real documents declared any, so this is the rare
     case and the one the code is least exercised against.
   - **At least one endpoint that is deliberately not probeable** — a `{placeholder}` or a
     `caip10:` identifier. 82% of real declared endpoints are unprobeable, and the rig must exercise
     the group that must never be reported as a defect.
2. **Mint a third** with `register(string)`, so one agent exists whose URI was set at mint rather
   than after.
3. **Route identity resolution through the same code path that will hit Base.** On testnet the
   registry and the staking are the same chain; on mainnet they are not. Do not shortcut
   `resolveAgent` because the chain ids happen to match — that shortcut is gap 1 of
   `docs/15_ROADMAP.md` and it will not fail until migration.

## Do not do in this task

- Do not host the registration files anywhere ARP has to keep running. A `data:` URI is how 18 of
  the sampled mainnet agents do it and it has no uptime obligation.
- Do not fabricate a CID. `ensureAtomForURI` already minted 18 permanent testnet atoms for strings
  like `ipfs://bafkreislither…` that are not valid CIDs (`tasks/20` appendix). If a file is pinned,
  pin it for real.
- Do not deploy anything. Everything needed is already on 13579.

## Gate

The verifier reads all three agents off the testnet registry and classifies every declared endpoint,
with at least one `confirmed`, one `not-checkable`, and the capability list of one recovered through
`tools/list`.

## Which tier of the evidence ladder does this serve?

None directly. It makes the rig exercise the paths it was supposed to exercise — the discovery half
of tiers 1 and 2 currently runs against nothing on testnet.
