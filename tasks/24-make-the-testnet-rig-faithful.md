# Task 24 — Make the testnet rig faithful

> **Status: COMPLETE, WITH STEP 3 DEFERRED** 2026-10-19 · commits `2587883`..`5787660` ·
> post-mortem `.claude/learning/16-make-the-testnet-rig-faithful.md` · `task-verifier` PASS on the
> third round. Phase 0 of `docs/15_ROADMAP.md`, which **Phase 0 does not close** — step 3 is
> deferred to `tasks/19` step 1b, and `docs/15` says so.
>
> Three verifier rounds, and what failed each time was the record rather than the rig: two
> vacuous tests, an unreproducible number, a false header, a count of commits wrong four times,
> and a claim of mine that the new unit tests closed a class they cannot. ADRs `0037`.
>
> Agents **3, 4 and 5** minted on `0xC165A2AD…`; ids, transactions and document hashes in
> `deployments/13579.json` under `arp.rigAgents`. **Signed by an agent session with the operator's
> key on the user's explicit ask — ADR `0037`**, which also says what that does not extend to.
>
> ```
> bun run scripts/verify-cohort.ts --target intuition-testnet --ids 1,2,3,4,5 --tools
>
> 5 agents · 2 with no tokenURI (40%) · 3 read · 4 endpoints
>   CONFIRMED      2   serves-declared-protocol ×1 · dead ×1
>   NOT CHECKABLE  2   templated ×1 · non-http-identifier ×1
>   INCONCLUSIVE   0
>   capability lists recovered: 1 — arp_tool_reputation
> ```
>
> Needs `scripts/arp-mcp-server.ts` on `:3002`. **So the `confirmed` branch reproduces only on a host
> running that server** — a known limit until ARP has a public endpoint, and `ARP_MCP_ENDPOINT` is not
> the answer, because `portability.md` rule 4 disqualifies any step that works because ARP can write
> to the registry.
>
> **Two deviations from the `Do` list, both deliberate:**
>
> 1. **Agents 1 and 2 keep their empty `tokenURI`** rather than being given files. `no-token-uri` is
>    23% of the real cohort (32/140, `scripts/measure-cohort-endpoints.ts`), so leaving them exercises
>    a branch the three new agents cannot — which is why the gate walks `1,2,3,4,5` and not `3,4,5`.
>    Better than the spec, and recorded rather than silently substituted.
> 2. **Step 3 is NOT done.** See the note at the end of the `Do` list.

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
   - **capabilities on at least one** — 0 of ~110 parsed documents across repeated n=200 samples (`scripts/measure-cohort-skills.ts`; the zero is stable, the denominator varies with the sample), so this is the rare
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

   > **DEFERRED, not done** (2026-10-19). `git diff` over `erc8004/src app/src` across this task's
   > commits is empty: `resolveAgent` is untouched and `scripts/verify-cohort.ts` reads `tokenURI`
   > by raw `eth_call`, which is a different path from the one that will hit Base. The task's own
   > Gate does not test it, which is how it slipped past the first verification.
   >
   > **Owned by `tasks/19` step 1b's successor**, because the two are the same problem seen from two
   > sides: on mainnet an agent's identity is on Base 8453 and its atom on 1155, joined by `same as`,
   > and _nothing_ resolves that join today — ADR `0032` chose the registration-derived atom as the
   > subject, and `scripts/measure-caip10-join.ts` shows zero edges exist to make the join. Doing it
   > here would have been the shortcut this bullet forbids, pointed at a rig where both chains
   > coincide.
   >
   > The honest cost: **Phase 0 is not closed.** `docs/15_ROADMAP.md`'s gap 1 has an owner now rather
   > than a reader's assumption that this task handled it.

## Do not do in this task

- Do not point a rig file at a third party's endpoint. **Fixed 2026-10-19**: `rig-confirmed` pointed
  at nebula-scan until ARP ran its own MCP server (`scripts/arp-mcp-server.ts`). It now points at
  ARP's, defaulting to `localhost` and saying so in its own description — a local fixture is honest;
  borrowing someone's uptime for a gate is not.
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
