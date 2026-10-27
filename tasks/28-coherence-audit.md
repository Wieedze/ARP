# Task 28 — Coherence audit: code, front, docs

> **Status: FIRST BATCH DONE** 2026-10-20. The rest is the punch list below, ranked. Nothing in it is
> done until it is struck through here.
>
> Out of scope at the user's request (2026-10-20): `vercel.json`; the tool pages and `/hire`, which are
> **unfinished, not incoherent**; mint vs "ARP mints nothing", which the user is handling separately.

## Objective

Make what the app displays match what the code does, and make the docs agree with each other and
with the code. Read-only audit first, then fixes in small batches.

## Done in the first batch

- The Layout strip no longer stacks on `MainnetNotice`. It also no longer shows "no real value at
  stake" on `/tool/atom/:atomId`, which reads mainnet. `/agent/import` now carries the notice
  (`app/src/components/Layout.tsx`, `app/src/pages/AgentImport.tsx`).
- `AgentImport` no longer says "both doors end in the same place". That was false: `/agent` only
  recognises agents in ARP's testnet registry.
- "Tool" replaces "module" in on-screen copy (ADR `0044`).
- Deleted: `app/src/assets/{hero.png,react.svg,vite.svg}` and `app/public/icons.svg` (no references),
  and the root `typescript` file (a terminal log committed in `9124733`).
- Rule fixes:
  - `workflow.md` no longer gives Base Sepolia as the default target.
  - `security.md` no longer says "no signatures".
  - `CLAUDE.md`'s directory map and its mainnet sentence are corrected.
- Status lines:
  - `tasks/04c` is marked complete, then set aside.
  - `STATE.md` has the corrected test count, remote SHA, task-23 line, hire (task 25) line, and this
    task.

## Punch list

> **Items 1, 2, 3, 5, 9, 11 and the `ToolDetail`/`RegisterModule` halves of 4 and 10 are MOOT as of
> 2026-10-27.** `ToolDetail.tsx`, `RegisterModule.tsx` and `ModuleList.tsx` no longer exist —
> `/tools` is `ToolCatalog`, `/register` is `ToolRegister`, `/tool/atom/:atomId` redirects to
> `/atom/:atomId`, and `/` is the landing page. "marketplace" returns nothing in `app/src`, and so
> do the apologetic and marketing patterns `rules/ui.md` forbids.
>
> They are left in place rather than deleted, because a punch list that quietly loses entries is
> worse than one that says which entries died and how. Read each as closed-by-deletion unless its
> text names a file that still exists.

### Front — displays something false

1. `/tool/:id` "Reputation" shows the vault's raw `totalAssets` (`app/src/pages/ToolDetail.tsx:200`).
   ADR `0042` says that is not evidence of a stake, and `ModuleList` already uses `stakerCount`.
   _Tool page, unfinished: fix when it is picked up._
2. `/tool/:id` crashes on a non-numeric id: `BigInt(idParam)` runs in render (`ToolDetail.tsx:29`).
   _Tool page._
3. The code sample on `/tool/:id` does not type-check: `tool.atomId` on `Module | null`. _Tool page._
4. "marketplace" appears in UI copy at `RegisterModule.tsx:24,176,189` and `ToolDetail.tsx:24`.
   `docs/12` says "Not a marketplace".
5. `RegisterModule.tsx:258` calls the atom cost "≈ negligible". On 13579 it is the same size as the
   initial stake, and it is a fee.
6. The panel shows undated measured figures — "about 54%" and "99.99%" (`AgentTrustPanel.tsx:186,311`).
   The tool page removed figures like these for that reason.
7. `AgentRegister` step 5's env blob still emits `agent-server.ts` settings (`AgentRegister.tsx:344-350`).
   _Depends on the mint decision._

### Front — structure

8. Nav: the forward surfaces (the tool page, import) have no entry. `/agents` does not link to
   `/agent/import`. _Wait for the tool page and hire._
9. `/tool/:id` and `/tool/atom/:atomId` never link to each other. _Tool pages._
10. Dead UI: an empty `<ul>` at `AgentRegister.tsx:637`. The docstring says "Four steps" over five.
    `ModuleList`'s comment promises a creator column it does not render.
11. `RegisterModule`'s `Field` labels have no `htmlFor` (`RegisterModule.tsx:308`) — `ui.md`
    accessibility.

### Code

12. **One ABI.** MultiVault is defined 3 times; IdentityRegistry and ModuleRegistry twice each
    (`app/src/lib/abi/*` against `packages/protocol/src/arp/abi.ts` and `declare/multivault.ts`).
13. **Ensure atom / ensure triple** is written 5 and 3 times in `app/src/services/*`, while
    `packages/protocol/src/declare/` already has it. Per `portability.md` it moves there.
14. Agent-atom resolution is written twice (`agent-import.ts:209` against
    `declare/resolve-subject.ts:26`). CAIP-10 URI building is written 4 times.
15. `getActiveWalletClient` is copy-pasted in 4 pages. `ModuleList` shadows `formatTrust`.
16. Older pages call chain clients and write services directly: `ToolDetail`, `AgentRegister`,
    `RegisterModule`. `code.md` says through a hook.
17. Unused exports:
    - `declareUsesTriple` and `PredicateNotOnChainError` (`intuition-graph.ts`)
    - `redeemCreateAtom`, `redeemEnsureAtomForCaip10`, `redeemEnsureAtomForThing`, `APPROVAL_BOTH`
    - the alias exports at `delegation-redeem.ts:519-520`
18. `packages/protocol/src/arp/client.ts:66-72` has two doc blocks on `TESTNET_DEPLOYMENT`.
    `DEFAULT_CURVE_ID` is defined twice inside the package.
19. Scripts deep-import `../packages/protocol/src/...` instead of `@arp-protocol/core`, so the public
    export surface is not what they exercise. (`scripts/` gates are `tasks/21`.)

### Docs and tracking

20. `docs/12` "state of it" table:
    - says import is "missing", but task 11 is done;
    - says `stakeOnUsedMethodologies` is "built", but it lives only in set-aside scripts and stakes on
      the atom (ADR `0039`);
    - still calls the registry question "open" (ADR `0027`).
      `docs/12` is canonical: the table is the user's to update.
21. The doc status headers disagree on what is in charge:
    - `docs/00:3` says "ACTIVE PIVOT".
    - `docs/09:3` says "Active strategic commitment".
    - `CLAUDE.md:16`'s "higher-numbered wins" would put `docs/15` over `docs/12`.
    - Both READMEs name `docs/09` or `docs/00`, not `docs/12`.
22. `README.md` describes the hackathon demo as "today". `app/README.md` is the Vite template.
23. `.claude/skills/arp/SKILL.md` is loaded on every task, but:
    - its read order skips `docs/12` and `STATE.md`;
    - it says "Base Sepolia only";
    - it names skills that do not exist here.
24. The hackathon narrative check survives in `workflow.md:29,42-51`, `agents/task-verifier.md:40-44`
    and `rules/metamask-delegation.md:213`. `CLAUDE.md` says ADR `0022` replaced it.
25. Tasks 04 and 05 have no status line. Tasks 19 (step 1) and 20 have no post-mortem.
26. "Connector" means three things: the project, the package, and the declare path. Settle it in one
    glossary line.

### Added 2026-10-27, from the task 17 and 22 gates

27. ~~Two ARP caveat enforcers are on Intuition mainnet 1155 while `CLAUDE.md`, `rules/security.md`
    and `STATE.md` each said "No ARP contract is deployed to mainnet today".~~ **FIXED the same day,
    ADR `0065`** — all four sites corrected plus a struck-through retraction in append-only ADR
    `0022`. Listed here because it is the kind of defect this task exists for: a factual claim in a
    **hard constraints** section that rotted the day a recorded decision changed the world.
28. **`docs/09:35`'s "194 `use` edges" does not reproduce**, at six sites: `docs/08:125`,
    `docs/09:35`, `docs/12:100`, `docs/13:85`, `tasks/08:78`, `tasks/23:49`.
    `scripts/measure/predicate-edges.ts` gives 158 / 185 / 120 and gave the same on 2026-10-16, so
    it is a different query and not a stale figure — Intuition has no deletion. Correct all six to
    one measurement with its script; do **not** present 194 → 158 as a change.
29. **The two deployment files record the same contracts in different shapes.**
    `deployments/1155.json` nests the enforcers under `arp.enforcers` with a `status`;
    `deployments/13579.json` puts them flat on `arp` as bare addresses. A reader of one shape finds
    nothing in the other and reads it as absence. Pick one.
30. **`bun run format:check` fails on 142 files, long-standing.** Two parts, and only the second is
    a code change: the root script passed `--ignore-path .gitignore` only, so `.prettierignore` was
    never consulted and `deployments/*.json` was flagged — **fixed 2026-10-27**, both paths are now
    passed. The remaining 142 are ordinary unformatted files and a `--write` pass would bury any
    real change under whitespace, so it needs its own commit.
31. **`.claude/choices/INDEX.md` is generated and is never prettier-clean**, so
    `build-claude-index.ts` re-dirties it on every ADR. Either the generator emits formatted output
    or the file joins `.prettierignore`.
32. **`scripts/measure/predicate-edges.ts` could not run** between `562d0fd` and 2026-10-27: that
    commit moved it into `scripts/measure/` and its `new URL('../packages/…')` became
    `scripts/packages/…`. Fixed. The lesson is the general one — `check:scripts` is a typecheck and
    sees no runtime path, so **a committed script that throws reads as provenance**. Worth a sweep
    of the other `new URL(…, import.meta.url)` sites in `scripts/`.

Overlap: items 21–26 are prose. `tasks/27` (the prose pass) runs after the tool page, so these can
wait for it unless one misleads a reader before then.

## Do not do in this task

- Touch the tool pages or `/hire` beyond what is listed as theirs.
- Decide the mint question.
- Rename `ModuleRegistry`, routes, or code identifiers (ADR `0044`).
