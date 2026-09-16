# 0022 — Re-point the router at the active commitment, retire the narrative check

**Status:** Accepted
**Date:** 2026-09-16
**Triggered by:** global cross-branch review — `CLAUDE.md` still names an expired document as source of authority #1.

## Context

`CLAUDE.md` opens every task with a read order whose first entry is
`docs/00_HACKATHON_PIVOT.md`, described as "current strategic commitment (MetaMask Dev Cook-Off,
deadline 2026-06-15)". That deadline passed three months ago and the submission shipped.

`docs/09_POSITIONING_AND_PLAN.md` declares itself the active commitment and `00` historical. Both
statements cannot be true, and the router is the one that wins in practice — it is what a fresh
session reads first.

Three concrete harms, not just tidiness:

1. Every future task is pointed at an expired strategy before it sees the current one.
2. The router mandates a narrative-preservation check against a submission that has already shipped,
   on tasks 02b/03b/04b/05b.
3. The router carries `Do not deploy to mainnet without explicit user confirmation per session`
   alongside a hard constraint list that predates ADR 0017, which authorised one narrow class of
   mainnet transaction. A reader cannot tell from the router what is actually permitted.

`docs/09` §10 proposed this change and deliberately did not apply it, on the grounds that the router
does not change silently. This ADR is that record.

## Decision

1. **The source-of-authority list becomes**: `docs/09_POSITIONING_AND_PLAN.md`, then
   `docs/02_ARCHITECTURE.md` (locked decisions, unchanged), then `docs/03_MVP_SCOPE.md`.
2. **`docs/00_HACKATHON_PIVOT.md` becomes historical record.** It stays in the repo — it is the
   reason the MetaMask and Intuition stack was chosen, and deleting it would lose that — but it stops
   being read as a live commitment.
3. **The narrative-preservation check retires.** Its replacement, on every task under this
   commitment, is one sentence in the completion report:

   > _Which tier of the evidence ladder does this serve, and does it move ARP up it?_

   Same function at the same cost: a cheap check that an implementation has not drifted from the
   thesis. `docs/09` §2 defines the ladder.

4. **The mainnet constraint is restated rather than removed.** Contract deployment still requires
   explicit per-session confirmation and none is planned. Deposits into existing vaults are
   authorised by ADR 0017, narrowly. No agent or script may sign a mainnet transaction. The router
   points at `.claude/rules/security.md`, which now carries the distinction in full.

## Alternatives considered

- **Leave it and let readers infer** — rejected. The router's whole purpose is that a fresh session
  does not have to infer. An authority list that is wrong is worse than no authority list, because it
  is followed.
- **Delete `docs/00`** — rejected. It records why this stack was chosen, which is still load-bearing
  context; only its status changes.
- **Keep the narrative check, re-pointed at `docs/09`'s narrative** — rejected as a distinction
  without a difference. The evidence-ladder question is the same check phrased against the commitment
  that is actually live, and it is more answerable: a tier is a concrete thing to name.

## Consequences

**Positive:**

- A fresh session reads the current strategy first, and the completion check tests the current thesis.
- The mainnet position becomes legible in one place rather than spread across a stale router line, a
  rule file and an ADR.

**Negative:**

- Tasks 02b–05b in `tasks/` still reference the retired check in their own headers. They are complete
  and historical, so they are left alone; a reader of an old task file will see a check that no longer
  applies. Noted here rather than rewriting shipped history.

**Neutral:**

- `docs/01`, `04`, `05`, `06`, `07` are unaffected — none was ever an authority entry.

## References

- Related doc: `docs/09_POSITIONING_AND_PLAN.md` §10 (proposed this change), §2 (the evidence ladder)
- Related doc: `docs/00_HACKATHON_PIVOT.md` — demoted by this ADR
- Related rule: `.claude/rules/security.md` (deployment posture, corrected alongside)
- Related ADR: `0002` (the pivot this supersedes in status), `0017` (mainnet deposits), `0021` (coverage policy)
