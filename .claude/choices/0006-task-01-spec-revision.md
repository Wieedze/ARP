# 0006 — Task 01 spec revised to post-pivot (Bun + Intuition Testnet)

**Status:** Accepted
**Date:** 2026-06-01
**Triggered by:** Task 01 implementation pass surfaced two mismatches between the original spec and the actual repo state. User confirmed (verbatim): *"on veut intuition test net et bun cest essentiel on peut le changer dans les spec"*.

## Context

When Task 01 was executed on 2026-06-01, two material drifts from the original `tasks/01-project-setup.md` spec emerged:

1. **Package manager**: the spec assumed `pnpm` (with workspace setup via `pnpm init`). The repo was already scaffolded with **Bun** (root `bun.lock` from `2026-05-19`, `package.json` workspaces field, Bun-style filter scripts `bun --filter app dev`). The `app/package.json` lists no pnpm-specific config; everything is Bun-flavored.

2. **Chain target**: the spec assumed Base Sepolia (env vars `BASE_SEPOLIA_RPC_URL` + `BASESCAN_API_KEY`). The hackathon pivot (`docs/00_HACKATHON_PIVOT.md`, ADR `0002`) re-targets the entire build to **Intuition Testnet** (chainId 13579). The MetaMask Delegation Framework v1.3.0 is officially deployed on Intuition Testnet — confirmed via the cloned `metamask/smart-accounts-kit` monorepo (`packages/delegation-deployments/src/index.ts` line 148 maps `CHAIN_ID.intuitionTestnet` to `DEPLOYMENTS_1_3_0`).

These drifts were not silent improvisations — they reflect decisions already made elsewhere (pivot doc, existing scaffolding choice). The task spec was simply stale.

A third smaller deviation: `forge install --no-commit` is the spec's command, but `--no-commit` was removed in forge 1.7.x (default is now no-commit). Used `--no-git` instead.

## Decision

`tasks/01-project-setup.md` is **rewritten in place** to reflect the post-pivot reality. Concretely:

- All references to `pnpm` are replaced with `bun`. Workspace commands use `bun --filter`, install is `bun install`, ad-hoc binaries via `bun x`.
- All references to Base Sepolia, Basescan, and their env vars are replaced with Intuition Testnet equivalents.
- A new section "Changes from the original spec" documents what diverged and why, so future readers can audit the drift without reading this ADR.
- Original "do not do" items (no contracts, no UI, etc.) are preserved.
- A completion note at the top declares Task 01 done as of 2026-06-01 with a pointer to the post-mortem.

The original spec is not preserved verbatim in the file — git history holds it. This ADR is the breadcrumb explaining the diff.

## Alternatives considered

- **Leave the spec as-is, document the deviations only in the completion report and the post-mortem.** Rejected — every future re-reader of `tasks/01-project-setup.md` would have to cross-check against the ADR + the post-mortem + the actual repo state to know what was actually done. Rewriting the spec at the source removes that lookup.
- **Add a "Post-pivot addendum" section to the original spec without rewriting it.** Rejected as messy — the pnpm/Base Sepolia language would still read as authoritative in most of the file, with a small "actually it's bun/intuition" footnote. Confusing.
- **Migrate the repo back to pnpm to match the original spec.** Rejected as user-confirmed: *"bun cest essentiel"*. Bun is the chosen package manager, and the lockfile already exists. Churn for zero gain.
- **Keep Base Sepolia as a parallel test target alongside Intuition Testnet.** Rejected — the pivot explicitly scopes mainnet AND Base Sepolia out. Multi-chain support is out of scope per the pivot.

## Consequences

**Positive:**
- Future readers of `tasks/01-project-setup.md` see the spec that was actually executed, with the divergence summary inline.
- The Deliverables checklist now matches what's on disk — `task-verifier` can verify cleanly.
- New tasks (02b, 03b, 04b) reference Bun-based commands by default. No risk of someone copy-pasting `pnpm install` into a script.

**Negative:**
- The git log for `tasks/01-project-setup.md` is the only place where the original pnpm/Base Sepolia version is preserved. A reader looking at the current file does not see the pre-pivot history without `git log -p`. Mitigation: this ADR + the breadcrumb in the file's "Changes from the original spec" section.
- One more ADR to maintain.

**Neutral (worth knowing):**
- The same revision pattern should be applied to other task files (02, 03, 04, 05) when they're touched during the hackathon. Specifically Task 03 (deploy + Intuition atoms) hard-codes Base Sepolia in several places per the original spec — it will need a similar pass before execution.
- The Bun choice means no `pnpm-lock.yaml`; the lockfile is `bun.lock`. CI scripts (when added later) must call `bun install --frozen-lockfile` for reproducibility.

## References

- Original spec (git history): pre-2026-06-01 version of `tasks/01-project-setup.md`
- Revised spec: `tasks/01-project-setup.md` (current)
- Pivot brief: `docs/00_HACKATHON_PIVOT.md`
- Earlier ADRs: `0002-hackathon-pivot-metamask-cookoff.md`, `0005-intuition-skill-vendored-locally.md`
- Chain reference: `deployments/13579.json`
- Post-mortem (written by task-verifier on pass): `.claude/learning/01-project-setup.md`
