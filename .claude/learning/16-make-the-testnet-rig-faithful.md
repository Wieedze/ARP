# 16 — Make the testnet rig faithful

**Task:** `docs/tasks/24-make-the-testnet-rig-faithful.md`
**Completed:** 2026-10-19
**Commit:** `80284f5`, `ab5a582`, `1ee1044`, `3c64868`, `2587883`, then `0a468ff` and `e79eed2`
closing two verifier punch lists, all on `feat/agent-panel-tabs`
**Verifier verdict:** PASS — third pass. Two FAILs first; see "Surprises".

## What shipped

- `scripts/rig-registration-files.ts` — the three registration files as `data:` URIs, exported so
  they are tested rather than eyeballed. Prints the mint calls; signs nothing.
- `scripts/arp-mcp-server.ts` + `scripts/arp-mcp-tools.ts` — ARP's own MCP server, so the gate's
  `confirmed` case stops depending on a third party's uptime. Hand-rolled JSON-RPC; reads only.
- `scripts/verify-cohort.ts` — `--target` (Base or Intuition testnet) and `--tools`. First thing
  written under `rules/portability.md`.
- `scripts/verify-rig-claims.ts` — asserts each fixture's `exercises` prose against what the probe
  observed, plus document hashes against `data/deployments/13579.json`. Exits non-zero on a mismatch.
- `scripts/measure/cohort-skills.ts` — committed so the "0 of ~110 documents declare a capability"
  figure can be re-run.
- `erc8004/test/rig-files.test.ts`, `erc8004/test/arp-mcp-server.test.ts` — 21 then 24 tests.
- `data/deployments/13579.json` — `arp.rigAgents`: ids 3, 4, 5, their transactions, document hashes, the
  two-step gate command, and why agents 1 and 2 are deliberately empty.
- `.claude/choices/0037-an-agent-session-may-sign-on-testnet.md`, `rules/security.md`,
  `CLAUDE.md`, `docs/15_ROADMAP.md`, `.claude/STATE.md`.

On chain: agents **3, 4, 5** on `0xC165A2AD2E540A4069E02834009161E2b4490d5A`, chain 13579. All three
`tokenURI`s verified byte-for-byte against the repo fixtures, and the recorded sha256 prefixes
(`478ac85cd6b2357f`, `6db8b769dd551e98`, `f61a9d7f6637958e`) verified against both repo and chain.

Measured at `e79eed2`: connector `tsc --noEmit` 0, **248 passed / 4 skipped**; app `eslint .` 0,
**205 passed / 2 skipped**. Two-step gate exit 0: 5 ids, 4 claims checked, 0 mismatched.

## Surprises

**A fixture can be structurally perfect and still claim something false, and no unit test can tell.**
`rig-dead` claimed `confirmed/dead`; its `.invalid` hostname produced `inconclusive/transport-error`,
because Bun reports a DNS failure identically to our own network being down. Every structural test
passed. Running the gate is what caught it. The fix was `192.0.2.1` (TEST-NET-1, RFC 5737), applied
with `setAgentURI` rather than a sixth mint.

**The consistency tests written in response were themselves vacuous.** Measured: under a public
`ARP_MCP_ENDPOINT` — the change the file's own comment tells the next person to make — two of the
three executed **zero assertions** and the suite still reported green, because their skip keyed on
the substring `localhost`. The generalisable fix is not a better predicate: it is counting assertions
and asserting the count is non-zero. A test that verifies nothing must not be able to pass.

**And the replacement closed a neighbouring class, not the one that bit.** `statusesClaimed` maps
`confirmed` → `probeable` and `inconclusive` → `probeable`, so the two sides of the original defect
collapse to one value. Measured: flipping `rig-dead` between `confirmed/dead` and
`inconclusive/transport-error` leaves the unit suite green. The mutation demonstrated as proof was a
*different* mutation from the one that shipped. `confirmed` against `inconclusive` is not derivable
from the document — both are `probeable` before a request is sent — so the probe is the only
authority, and `scripts/verify-rig-claims.ts` reading the gate report is where it belongs. Verified
both ways at `e79eed2`: the shipped mutation now exits 1, and an un-re-minted fixture edit shows
DRIFT.

**`satisfies readonly T[]` does not catch a grown union.** It checks assignability, not
exhaustiveness. Measured against a five-member `NotCheckableCode`: the array form compiles clean; the
`Record` form errors with **TS1360** naming the missing member. `Object.keys({…} satisfies
Record<NotCheckableCode, true>)` is the shape that works. Both forms were committed in the same
commit, in two files, with contradictory comments.

**`--target` turned a dead local into a cross-chain hazard.** `verify-cohort.ts` built a
`tokenId → documentHash` map, logged it, and **never read it** — pre-existing from task 17
(`c808766a`), and its header claimed caching that does not happen. Latent, not live: nothing consumed
it. But the default out path carried no chain, so a Base run was observed loading the testnet walk's
file. `portability.md` rule 2, inside the commit that introduced `portability.md`.

**Unthrottled measurement inflates its own variance.** `measure/cohort-skills.ts` first fired all 200
requests at once. A rate-limited fetch falls into `if (!r.ok) return` and drops silently out of the
parsed count, so part of the 108/112/113 spread was self-inflicted, not sampling. The zero numerator
survives — a zero cannot be inflated by a smaller denominator — but "the denominator varies with the
sample" was not the whole truth.

**One hard constraint existed in three incompatible wordings.** `security.md:84` carried "with ARP's
own funds" (added at `205ef55`, ADR 0035); `CLAUDE.md` and `STATE.md` both said "may **ever** sign a
mainnet transaction". The qualifier is load-bearing — a flat prohibition forbids `docs/12` points 3
and 5, which is the product. Found while checking whether ADR 0037 quoted the rule accurately: it
did, which was the problem.

**`STATE.md`'s "commits ahead" line cannot be maintained by hand.** It was wrong at 47/15 (actual
60/12), corrected, and wrong again at 60/12 (actual 61/13) because the correcting commit counted
itself. Third and fourth occurrences; the line already warned it had been wrong twice. See
"Suggestions" — the fix is deletion.

## Decisions made

- **An agent session signed the three mints with the operator's key.** ADR
  `.claude/choices/0037-an-agent-session-may-sign-on-testnet.md`. `security.md` scopes its
  prohibition to mainnet, so this was not forbidden; ADR `0036`'s "without further ceremony" does
  **not** cover it, because that sentence is scoped to an agent acting *under a delegation* and its
  non-authorisation list points the other way. What authorised it was the user asking. Three
  conditions recorded as the reusable shape: the key never enters the agent's context, its address is
  verified first, the effect is recorded where a later reader looks.
- **`security.md` is now the single canonical statement of mainnet signing**, with a four-row table
  (ARP's funds automated: never · ARP's funds human-signed: ADR `0017` · an operator's funds under a
  delegation: ADR `0036` · an operator's raw key: testnet only, ADR `0037`). `CLAUDE.md` and
  `STATE.md` cite it instead of restating.
- **Agents 1 and 2 keep their empty `tokenURI`**, against the task's step 1. `no-token-uri` is 23% of
  the real cohort (32/140, `scripts/measure/cohort-endpoints.ts`), so leaving them exercises a branch
  the three new agents cannot — which is why the gate walks `1,2,3,4,5`. Better than the spec, and
  the gate had to widen for it to count.
- **Step 3 (route identity resolution through `resolveAgent`) deferred, not done**, and owned by
  `docs/tasks/19` step 1b. On the rig both chains are 13579, so there is no join to route through — gap 1
  says never shortcut it because the chains coincide, and building it there would have been that
  shortcut. `docs/15_ROADMAP.md` now says Phase 0 is **not** closed.
- **`rig-confirmed` points at `localhost`.** A local fixture that says so is honest; borrowing a
  third party's uptime for a gate is not. The cost is recorded: the `confirmed` branch reproduces
  only on a host running the server, and `ARP_MCP_ENDPOINT` + `setAgentURI` is **not** the fix,
  because `portability.md` rule 4 disqualifies any step that works because ARP controls the registry.
- **The cache left unwired.** Pre-existing, task 21's to own, and churning the file twice is worse
  than one honest defect row.

## Rules touched

- `.claude/rules/portability.md` — **first use, and it caught two things it was written for**: the
  out-path collision (rule 2) and the `ARP_MCP_ENDPOINT` escape hatch (rule 4, "a rehearsal prop").
  It was also broken twice *by the commits implementing it* — module-scope chain constants in
  `measure/cohort-skills.ts`, in the same task that refactored them out of `verify-cohort.ts`.
- `.claude/rules/claims.md` — **sufficient, and the highest-yield rule in the task.** Check 1
  separated the latent cache hazard from a live one. Check 2 found the unanchored `112` in six places
  and the three-way split of the mainnet constraint. Check 3 found that nothing on disk recorded who
  signed. Check 4 found that the cited gates cover two of four changed scripts.
- `.claude/rules/security.md` — **changed.** It permitted testnet automation by omission, and the
  omission got filled by inference from an ADR that did not cover it. Now states the position. ADR
  `0037`.
- `.claude/rules/code.md` — sufficient. Caught `let doc: any`, a dead ternary, a loop-invariant
  recompute, and three comments that misdescribed state.
- `.claude/rules/workflow.md` — sufficient. Its scope discipline is what kept the cache unwired.

## Suggestions for future tasks

- **Delete the two numbers in `STATE.md`'s branch line.** A hand-maintained count of commits ahead,
  written inside the commit that changes it, is stale on arrival — demonstrated four times now. The
  next line already says "Recount; do not read these two numbers", which is the whole content.
- **Assert prose against observed behaviour, not only against structure.** `verify-rig-claims.ts` is
  the pattern: the claim lives in a string, the authority lives in the probe, so the check belongs
  where the probe's output is. Any fixture set whose fields describe outcomes needs one.
- **Make a test count its assertions when it has a skip.** Every `continue` in a test is a vacuity
  risk, and `expect(checked).toBeGreaterThan(0)` costs one line.
- **Use `Record<Union, true>` for exhaustiveness, never `satisfies readonly Union[]`.** Measured;
  TS1360 against silence.
- **Re-read the artifact after fixing it.** Across two punch lists, four items were reported closed
  and were not: a stale `Updated` date, a duplicated sentence introduced by the fix, a docstring
  naming two of three figures, and the commit counts. Each was visible in the file.
- `scripts/arp-mcp-server.ts` and `scripts/verify-cohort.ts` are inside **no** typecheck and no lint.
  `scripts/arp-mcp-tools.ts` and `scripts/rig-registration-files.ts` are inside the connector's, by
  accident, because its tests import them. Task 21.

## Which tier of the evidence ladder does this serve?

None directly, and the task file says so. `docs/09_POSITIONING_AND_PLAN.md` §3 ranks claims about the
world; this makes the discovery half of tiers 1 and 2 **executable on testnet at all** — before it,
the registry's two agents carried an empty `tokenURI` and the verifier, the classification and the
capability recovery ran against nothing. It produces no new evidence; it makes the machine that
produces evidence testable, and `verify-rig-claims.ts` means the rig's own claims about itself are now
checked rather than asserted — which is the ladder applied to the tooling.
