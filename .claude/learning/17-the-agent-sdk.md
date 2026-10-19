# 17 — The connector an agent declares through (half 1)

**Task:** `tasks/16-the-agent-sdk.md` — half 1 only; half 2 split out to `tasks/25`
**Completed:** 2026-10-19
**Commit:** `be5bf85` (feature), `63a27dd` (one protocol package), then `be311a6`, `9022321`,
`a714f25` closing three verifier punch lists, all on `feat/agent-panel-tabs`
**Verifier verdict:** PASS — fourth pass. Three FAILs first, and every one of them was record
discipline rather than design. See "Surprises".

## What shipped

- `packages/protocol/src/declare/` — 7 modules. `prepareDeclareUsed` and `prepareStakeOnUsed` return
  **unsigned calls**; `toDelegatedCalls` wraps them as one `redeemDelegations` per call. No wallet
  client, no key, no send path anywhere in the package (verified by grep, not by assertion).
- `scripts/arp-mcp-tools.ts` + `scripts/arp-mcp-server.ts` — `arp_declare_used` and
  `arp_stake_on_used` at the MCP wire. Confirmed served by an independent gate run: the capability
  list recovered from `:3002` is `arp_tool_reputation, arp_declare_used, arp_stake_on_used`.
- `scripts/agent-declare-used.ts` — the runnable example. Mainnet 1155, read-only.
- `packages/protocol/README.md` §"Declaring what your agent used" — what you need, the plan, the
  ordering constraint, both costs read from the chain, both signing modes.
- `scripts/measure-tool-atom-shape.ts` — committed in round 4 because the 84/78/77 breakdown had
  been quoted in six places from no script at all.
- 44 tests: 29 planner, 7 delegated, 8 at the MCP wire. Re-derived per file, not read off a report.
- ADRs `0038` (a plan, not a transaction), `0039` (the deposit goes on the edge), `0040` (the cap
  bounds the amount, not the kind), `0041` (one protocol package).

Measured at `a714f25`: `packages/protocol` `tsc --noEmit` 0, **292 passed / 4 skipped**; `app`
`tsc -b` 0, `eslint .` 0, **205 passed / 2 skipped**; prettier clean on every touched file; both
touched scripts and the new one bundle; `build-claude-index.ts` regenerates with no diff.
**Nothing was signed or sent on any chain.**

## Surprises

**Four rounds, zero design defects.** Every finding across three FAILs was a sentence about the
system rather than the system: a README naming a package that did not exist, a retracted claim
surviving in the document written to retract it, four wrong copies of a test count, a stale path in
an open task file. The code was right from `be5bf85`. This is the inverse of the usual failure
shape and worth remembering: when a task's substance is records, the records are the surface that
breaks.

**A correction is a change, and changes introduce defects at the same rate as any other edit.** One
warning string — the one a third party reads before signing — was wrong in three consecutive
versions, each wrong differently. `be5bf85` said "77 of the **78**" (a subpopulation labelled as the
whole). `be311a6` fixed the denominator and added "all but one of those being `ipfs://`", which
asserted one pinned atom is not `ipfs://` — false, and if it had been true the new denominator would
have been wrong too. `a714f25` restated it as the README had it all along. **Verifying a fix is not
the same as verifying the file after the fix**, and the second is the only one that catches this.

**The root cause of that recurrence was a number with no script behind it.** `claims.md` already
said "commit the script, not the number"; the 84/78/77 figures were quoted in six places and
produced by nothing re-runnable, so no reader — including three verifier rounds — could settle the
sentence against anything but another copy of the sentence. `scripts/measure-tool-atom-shape.ts`
closed the class in one commit, and an independent run reproduces 84 atoms / 78 `ipfs://` / 77
pinned exactly, with 0 of the 2 raw-URL atoms and 0 of the 4 others pinned — which is what makes
"77 of 84" sound rather than a coincidence of two subpopulations.

**A rename's residue is a token, and anchoring the search on its punctuation hides it.** Two sweeps
for `erc8004/`, `@arp-protocol/erc8004`, `@arp-protocol/sdk`, `sdk/` and `DEFAULT_DEPLOYMENT` both
looked thorough and both missed the same two lines, because every pattern was anchored on a slash or
an `@` and the survivors were bare `erc8004` in prose — one of them in a bullet whose other two
references had already been rewritten twice. `grep -rn "erc8004"` with hand triage returns them
immediately. It also returns legitimate hits (third-party `.well-known` URLs, the real
`contracts/src/erc8004/` subtree, `erc8004-connector` identifiers, react-query cache keys), so it
has to be read rather than piped into `sed`. Recorded in ADR `0041`.

**`sed` over two names that merged into one produces a sentence naming the same package twice.**
`tasks/16:155` read "come from `@arp-protocol/core` and `@arp-protocol/core`" for three rounds, and
no sweep could find it — both names were current.

**A test count has to be re-derived per file, not added up.** `282 = 248 + 34` was arithmetic over a
wrong addend, written into `STATE.md` while the same commit's message stated the measured 292, and
the line telling the reader to re-run it pointed at a directory that commit had deleted.

## Decisions made

- **The connector prepares calls and never signs or sends one** — ARP holds no key, so ADR `0035`
  becomes structural rather than promised. ADR: `.claude/choices/0038-*.md`.
- **The deposit goes on the edge, not the tool's atom** — the reader priced the triple while the
  writer deposited on the atom. Latent, not live. ADR: `.claude/choices/0039-*.md`.
- **The cap bounds the amount, not the kind** — five places (including a rule) said the triple fee
  sits outside `TrustStakeCapEnforcer`; it does not, and a test now asserts the amount lands where
  the enforcer reads it. ADR: `.claude/choices/0040-*.md`.
- **One protocol package** — `erc8004/` + `sdk/` → `packages/protocol`. ADR:
  `.claude/choices/0041-*.md`, which also carries the stale-path policy and the sweep.
- **Half 2 deferred** rather than grown — `tasks/25`, as this task file instructed.

## Rules touched

- `.claude/rules/claims.md` — **sufficient, and it found everything.** All four of its checks fired
  at least once this task: reachability (ADRs `0039`, `0040` both latent not live), one number one
  context (the 78-vs-84 denominator), cite third parties (every citation in the task file now
  resolves to the line), and gate scope (`scripts/` is outside `tsc` and `eslint`, so the new script
  was checked by bundling it).
- `.claude/rules/portability.md` — **was wrong**, corrected by ADR `0040`: it asserted the triple fee
  sits outside the stake cap.
- `.claude/rules/code.md` — sufficient. Its `as`-cast rule caught four uncommented casts; its no-`any`
  rule is violated by one pre-existing `as any` the fold moved into the package
  (`packages/protocol/src/arp/modules.ts:201`), recorded in `STATE.md` and ADR `0041` rather than
  fixed, because fixing moved code is a behaviour change and not part of a move.
- `.claude/rules/workflow.md` — sufficient.

## Suggestions for future tasks

- **After a rename, sweep the bare token and triage by hand.** A pattern with a slash or an `@` in it
  cannot match the residue that actually survives. ADR `0041` has the command.
- **Commit the script before quoting the number, not after the third correction.** If a figure is
  about to appear in more than one file, it needs `scripts/measure-*.ts` first.
- **Re-read the file after a fix, not the diff of the fix.** Three of this task's findings were
  introduced by the commit that closed the previous round.
- **Re-derive counts per file.** `bun run test -- <file>` per test file takes a minute and makes a
  headline count checkable.
- **Two live imprecisions were left in `scripts/measure-tool-atom-shape.ts`'s docstring**, non-blocking
  and recorded here for whoever next edits it: it says the breakdown was quoted in "five places" and
  lists five, but `packages/protocol/src/declare/tool-atom.ts` carries it too, so it is six; and
  "three verifier rounds in a row found a wrong version of this one sentence" is two in the commit
  record (`be5bf85`'s denominator and `be311a6`'s trailing clause).

## Which tier of the evidence ladder does this serve?

**Tier 3, Staked** (`docs/09_POSITIONING_AND_PLAN.md:53`) — the machinery, not an edge. A party ARP
is not, holding no key of ARP's, can now produce a `uses` claim with its own operator's capital
behind it. Nothing has been signed on any chain, so no tier-3 edge exists yet and tier 4, Proven
(`docs/09:54`), is not reached; crossing that line needs an operator who decides to spend, which is
`docs/15`'s Phase 4 and is adoption rather than engineering.
