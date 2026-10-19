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

83 occurrences of `erc8004/` across 37 markdown files. **Only the live documents were rewritten** —
`CLAUDE.md`, `README.md`, `.claude/STATE.md`, `.claude/rules/`, `docs/15_ROADMAP.md`, and the open
task files. `.claude/learning/` and the earlier ADRs keep their original paths, because a
post-mortem is a record of what was true on its date.

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
