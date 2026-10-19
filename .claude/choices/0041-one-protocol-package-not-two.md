# 0041 — One protocol package, not two, and it is called what it is

**Status:** Accepted
**Date:** 2026-10-19
**Triggered by:** the user, during `tasks/16`: _"pourquoi tout vit dans erc8004 ? […] faut revoir
l'organisation du projet, ça devient le bordel, et le but c'est d'avoir un projet clair et
maintenable et auditable"_

## Context

Measured at the time of the question:

| directory  | size                   | npm name                | what it actually was                                                              |
| ---------- | ---------------------- | ----------------------- | --------------------------------------------------------------------------------- |
| `app/`     | 82 files, 16,451 lines | `@arp/app`              | the React UI                                                                      |
| `erc8004/` | 33 files, 5,261 lines  | `@arp-protocol/erc8004` | **the whole protocol layer** — identity, graph, verifier, tool usage, write plans |
| `sdk/`     | 6 files, 782 lines     | `@arp-protocol/sdk`     | ModuleRegistry and agent reads, testnet-defaulted                                 |
| `scripts/` | 31 flat `.ts`          | —                       | everything else                                                                   |

Three problems, and only the third is the one the question named:

1. **The names lied.** `erc8004` reads as "an implementation of the ERC-8004 standard". It was the
   protocol layer entire. `sdk` reads as "the package a consumer imports" — and so does the other
   one. An auditor could not tell which to import, and neither could the author: `tasks/16`'s own
   constraint section says "read paths come from `@arp-protocol/erc8004` and `@arp-protocol/sdk`"
   without saying which does what.
2. **Two packages did one job.** Both were read-only clients over the same two chains, with no
   boundary written anywhere.
3. **The write path landed in `erc8004/`**, which is what prompted the question.

The third is the one thing that was right, and it has a measured reason:
`app/src/lib/deployments.ts:1` imports `deployments/13579.json` **at module load**, and ~12 sites in
`app/src` hardcode `chain: intuitionTestnet`. That binding is deliberate (`rules/portability.md`
records why, and `intuition-mainnet.ts` is a separate module precisely so a mainnet read cannot be
served from a testnet constant by accident). But it means anything built in `app/` inherits the
testnet world and has to be ported site by site — and mainnet is the goal. So protocol logic does
not belong in `app/`. The rule was right; the name was wrong.

## Decision

```
packages/protocol/        ← erc8004/ renamed, sdk/ folded in. @arp-protocol/core
  src/                      identity, graph, verifier, tool usage, declare/stake planning
  src/arp/                  ← sdk/, as a named namespace: ARP's OWN contracts
app/                      the UI. Stays testnet-bound, deliberately
contracts/                Solidity
scripts/                  unchanged — see "What was not done"
```

- **`erc8004/` → `packages/protocol/`**, npm name `@arp-protocol/erc8004` → `@arp-protocol/core`.
  34 import sites rewritten.
- **`sdk/` folded into `packages/protocol/src/arp/`** and the workspace deleted. `arp/` **is** the
  boundary that was missing: everything under it reads ARP's own deployment, everything outside it
  reads the ERC-8004 and Intuition layers that exist whether or not ARP does.
- **`DEFAULT_DEPLOYMENT` → `TESTNET_DEPLOYMENT`.** The fold brought a testnet-defaulting constant
  into a package that had none, and the word "default" is what hid the binding — every consumer
  that passed no deployment silently read testnet. Named, it is config with a visible fallback,
  which is what `portability.md` rule 1 asks for.
- **`app/` does not move and does not absorb the protocol layer**, for the measured reason above.

## What was not done, and why

**`scripts/` was not split into `tools/{measure,verify,agent}/`,** although that was part of the
plan agreed with the user. Measured before starting: **211 citation sites** for `scripts/*.ts` — 133
in markdown, 74 in TypeScript, 4 in JSON — and a large part of the markdown is in
`.claude/learning/` and `.claude/choices/`, which are **append-only record**. Rewriting those would
make historical documents cite paths that did not exist when they were written, which damages the
audit trail this reorganisation exists to serve.

Flagged to the user rather than decided unilaterally. The flat directory is navigable by prefix in
the meantime — 10 `measure-*`, 7 `agent-*`, 3 `verify-*` — and the real pain there is that
`scripts/` is inside no typecheck and no lint, which is `tasks/21` and is unaffected by any rename.

## The same question for citations of the old path

83 occurrences of `erc8004/` across 37 markdown files **on the first pass, which counted markdown
only**. The repo-wide sweep below is the honest measurement; markdown was never the whole class.
**Only the live documents were rewritten** —
`CLAUDE.md`, `README.md`, `.claude/STATE.md`, `.claude/rules/`, `docs/15_ROADMAP.md`, and the open
task files. `.claude/learning/` and the earlier ADRs keep their original paths, because a
post-mortem is a record of what was true on its date.

**Swept repo-wide afterwards**, because the first pass of this policy was applied from a hand-built
list of "live" files and that is exactly the shape that misses one. Every match for `erc8004/`,
`@arp-protocol/erc8004`, `@arp-protocol/sdk`, `sdk/` and `DEFAULT_DEPLOYMENT` across every file type,
triaged:

| what it turned out to be                                                                                                                                                       | action                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| third-party URLs — `api.deep3.ai/.well-known/intuition/erc8004/agents/…` in fixtures, `signature.ts`, `helpers.ts`                                                             | none; not our paths                         |
| `contracts/src/erc8004/` — a Solidity directory that still exists                                                                                                              | none                                        |
| this ADR's and the retractions' own text, quoting the old names                                                                                                                | none; deliberate                            |
| append-only record — `.claude/learning/`, ADRs `0014`–`0033`, completed task files, `docs/07`–`14`, PR drafts                                                                  | none; the policy above                      |
| **`.gitignore`'s dead `sdk/dist/` block**                                                                                                                                      | **removed**, replaced by `packages/*/dist/` |
| **`README.md`'s link to `sdk/README.md`** — a broken link on the repo's front page                                                                                             | **fixed**                                   |
| **`README.md`'s directory map**, still listing `sdk/` and labelling it `@arp-protocol/core`                                                                                    | **fixed**                                   |
| **`tasks/09` and `tasks/21`** — **open** task files with actionable items citing `sdk/src/…`                                                                                   | **fixed**                                   |
| ADRs `0038`–`0040`, written the same day but before the rename                                                                                                                 | a forwarding note at the top of each        |
| **four live code comments** — `scripts/rig-registration-files.ts`, `scripts/verify-rig-claims.ts`, `app/src/services/__tests__/trust-fixtures.ts`, `scripts/arp-mcp-server.ts` | **fixed**                                   |

**What the sweep says about the first pass:** it was right on the code and the configs that matter,
and wrong in places a hand-built list of "live files" could not help but miss — a front-page link,
two open task files, a dead ignore rule and four code comments. None of them break a build; all of
them send a reader somewhere that does not exist.

**And the sweep itself missed two, for a structural reason worth more than the fixes.** Every pattern
it used — `erc8004/`, `@arp-protocol/erc8004`, `@arp-protocol/sdk`, `sdk/`, `DEFAULT_DEPLOYMENT` —
was anchored on a slash or an `@`, so **a bare `erc8004` token in prose could not match any of
them**. Two survived exactly there: `scripts/arp-mcp-server.ts:10`, and `tasks/09:104` in a bullet
whose other two references had already been rewritten twice. The search that closes the class is the
bare token, triaged by hand:

```
grep -rn "erc8004" scripts packages/protocol/src packages/protocol/test app/src contracts/src \
  .claude/rules .claude/STATE.md .claude/agents CLAUDE.md README.md .gitignore tasks
```

It returns legitimate hits too — third-party `.well-known` URLs, `contracts/src/erc8004/`, the
`erc8004-connector` and `erc8004TokenId` identifiers, react-query cache keys, and this repo's own
retraction text — so it has to be read rather than piped into `sed`. The lesson is the pattern, not
the count: a rename's residue is a **token**, and anchoring the search on the punctuation around it
is how two passes can both look thorough and both miss the same line.

The built output was never at risk: `packages/protocol/.gitignore:1` carries `dist/`, so nothing was
committed — confirmed with `git ls-files`, 0 tracked files under `packages/protocol/dist`.

**The mapping, for reading anything written before 2026-10-19:**

| then                    | now                                         |
| ----------------------- | ------------------------------------------- |
| `erc8004/src/…`         | `packages/protocol/src/…`                   |
| `@arp-protocol/erc8004` | `@arp-protocol/core`                        |
| `sdk/src/…`             | `packages/protocol/src/arp/…`               |
| `@arp-protocol/sdk`     | `@arp-protocol/core` (the `arp/` namespace) |
| `DEFAULT_DEPLOYMENT`    | `TESTNET_DEPLOYMENT`                        |

## Alternatives considered

- **Move the protocol layer into `app/`**, which is what the question first proposed. Rejected on
  the measurement above: `app/` is bound to testnet at module load, so the layer would need porting
  site by site for the chain it is meant to run on.
- **Collapse everything into one package including the UI.** Rejected for the same reason, one step
  further: it would fold the portable layer into the bound one permanently.
- **Rename only, keeping `sdk` separate with a boundary written in an ADR.** Less churn, but it
  leaves "which one do I import" open for an auditor, which is the complaint.

## Consequences

**Positive:**

- One package to import, and its name says what it is.
- The testnet binding that came with the fold is named rather than hidden.
- `packages/` leaves room for a second package without another top-level directory.

**Negative:**

- 83 markdown citations of `erc8004/` and the npm name are now historical. The mapping above is the
  mitigation; a reader of an old post-mortem has to consult it.
- `packages/protocol/dist/` had to be rebuilt: the stale build output made `app`'s typecheck see two
  unrelated `viem` identities, which reads as a dependency conflict and is not one. Worth knowing
  because the error message points nowhere near the cause.
- Four `bun run --cwd ../erc8004 build` hooks in `app/package.json` broke silently — `bun run test`
  failed with `ENOENT: Could not change directory`, not a test failure. Fixed.

**Neutral (worth knowing):**

- **The fold brought one `as any` into a package that had none** — `src/arp/modules.ts:201`, an
  eslint-disabled cast on a viem event filter, pre-existing in `sdk/` since `c461677`. `code.md`
  forbids `any` outright, so the package can no longer be described as free of it. Left in place
  because fixing it is a behaviour change in moved code rather than part of a move, and recorded in
  `.claude/STATE.md` so nobody infers the property from the package's reputation.
- No source logic changed. Every gate that passed before passes after: protocol `tsc` 0 and 292
  passed / 4 skipped, app `tsc` 0, `lint` 0, 205 passed / 2 skipped.
- `packages/protocol/test/` keeps two relative imports that reach up into `scripts/`, now at
  `../../../`. They exist because the connector's tests assert the rig's fixtures, and they are the
  reason two scripts are inside a typecheck by accident (`tasks/21`).

## References

- Related rule: `.claude/rules/portability.md` rule 1 — rewritten to name the new path
- Related ADR: `.claude/choices/0038-the-write-path-is-a-plan-not-a-transaction.md` — why the write
  path is in this package at all
- Related task: `.claude/../tasks/21-scripts-is-outside-every-gate.md` — the `scripts/` gap, which no
  rename addresses
