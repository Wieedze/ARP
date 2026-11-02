# 0117 — Scripts sign on testnet only, CI runs the gates, and the process files describe the repo as it is

**Status:** Accepted
**Date:** 2026-11-02
**Triggered by:** `docs/tasks/59-audit-cleanup.md`, stream E — the read-only audit of 2026-11-02,
every finding planned and executed on the user's decision.

## Context

The audit found three kinds of drift outside `apps/`, `packages/` and `contracts/`:

1. **Scripts that could spend on mainnet with a raw key.** `scripts/helpers/send-plan.ts` and
   `scripts/agent/agent-send-plan.ts` accepted `--chain 1155 --execute`; `.claude/rules/security.md`
   allows a raw key to sign on testnet 13579 only (ADR `0037`). `scripts/demo/demo-hire.ts` paid
   whatever price a remote node named, to the payee it named, with no chain check and
   `ARP_TARGET=mainnet` accepted.
2. **No CI.** Every gate was run by hand, and `check:scripts` failed on a fresh checkout because it
   typechecked against `packages/graphql/dist/`, which nothing had built.
3. **Process files that described another repo.** `task-verifier.md` ran the retired hackathon
   check and never mentioned the evidence ladder that `CLAUDE.md` says it enforces; `solidity.md`
   demanded a pragma no contract uses and gas targets for a deleted contract;
   `metamask-delegation.md` specified a deleted enforcer as a deliverable; `CLAUDE.md`'s map omitted
   three apps and named a skill path that does not exist; `portability.md` and `security.md`
   narrated their own past wordings at eleven sites, which a reader has to subtract to find the rule.

## Decision

**Scripts.** The raw-key signer (`sendPlan`) refuses any chain but 13579 before it reads the key,
and still refuses an RPC whose chain id differs from the plan's. `demo-hire.ts` takes testnet only,
checks the RPC's chain id, and caps the payment with `--max-pay <wei>` (default 0.01 TRUST),
refusing a node that asks more. Both have tests under `scripts/test/`.

**CI.** `.github/workflows/ci.yml` runs `bun run check`, `lint`, `test` and the CLI packaging check,
and a separate `forge build && forge test`, on push and pull request to `main` and `dev`. Actions,
bun and forge are pinned. `check:scripts` builds the protocol package first.

**Rules, each a change to what an agent is told:**

- `task-verifier.md` requires the evidence-ladder sentence on every task; `workflow.md` and
  `metamask-delegation.md` mark the hackathon question historical (tasks 02b–05b, closed).
- `solidity.md`: `0.8.23` exactly for anything importing the delegation framework, which pins it;
  vendored reference code (`src/erc8004/`, `^0.8.20`) keeps its upstream pragma; any other version
  needs an ADR. The `ModuleRegistry` rules are restated generally.
- `metamask-delegation.md`: the `DomainScopeEnforcer` section is historical; the `ModuleRegistry`
  fork-test line is dropped.
- `portability.md`, `security.md`: each passage that narrated a past wording now states the current
  rule and points at the ADR that holds the history. The mainnet-signing bullet's tables and
  substance are unchanged.
- `CLAUDE.md`: the map lists what exists, the local skill is `arp-contributing`, the duplicate
  end-of-task row is one row, and `docs/03` and `docs/04` are marked historical where superseded,
  with a header in each. Their bodies are not rewritten.

**Skills.** `.claude/skills/mms-oh-my-opencode/` is removed. ADR `0003` kept it so a re-sync would
not re-create it, and said it "could be revisited if the file becomes a real source of confusion".
It is listed in every session's skill list for a harness ARP does not use, so it is. **A re-sync of
the MetaMask skills re-creates it and must delete it again.** ADR `0003` is append-only and is not
edited; this is the record.

## Alternatives considered

- **Leave mainnet dry runs open in `sendPlan`.** A dry run signs nothing. Rejected: the refusal
  before the key is read is the simplest guard to check, and `demo-adopt.ts`'s mainnet dry run is
  the only casualty — it now reports a refusal.
- **Move `docs/00`, `06`, `08`–`11` into an archive folder.** Rejected: too many inbound links. The
  map marks them instead.
- **Rewrite `docs/03` and `docs/04`.** Rejected: they are the original scope, and a header saying
  what superseded them is enough.

## Consequences

**Positive:**

- No script in `scripts/` sends a transaction from a raw key on a chain other than 13579. The three
  that send (`grep -rln "sendTransaction\|writeContract" scripts`) are `helpers/send-plan.ts`,
  `demo/demo-hire.ts` and `sandbox/setup.ts`; each refuses another chain and an RPC that answers one.
- Every gate runs on every push to `main` and `dev`.
- A fresh agent reading the rules gets the current rule without subtracting its history.

**Negative:**

- CI is red until other task 59 streams land: `contracts/lib/` is absent on a fresh checkout and
  `solhint` is not installed (stream A), and `check:contrast` fails on `apps/web` (stream D).
- A re-sync of the MetaMask skills needs one manual delete.

**Neutral (worth knowing):**

- `format:check` fails on 286 files on this branch; formatting them is left to the end of task 59
  so it does not conflict with every stream.
- `scripts/measure/landing-fit.ts` still imports `NAV_HEIGHT` from `apps/web/src`: it measures the
  web app's layout, so the constant it checks is the app's own.

## References

- Related rules: `.claude/rules/security.md`, `solidity.md`, `metamask-delegation.md`,
  `portability.md`, `workflow.md`; `.claude/agents/task-verifier.md`
- Related doc: `docs/tasks/59-audit-cleanup.md`
- Related ADRs: `0003`, `0022`, `0037`, `0055`, `0065`
