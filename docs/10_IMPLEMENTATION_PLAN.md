# 10 — Implementation plan: Phase 0 + Phase 1

**Date**: 2026-09-16
**Commitment**: `docs/09_POSITIONING_AND_PLAN.md`
**Goal for this session**: ship Phase 0 complete and Phase 1 reviewable, on isolated branches, with
every change traceable to a decision.

---

## Constraint discovered up front

`gh` is not authenticated and the repo has no push credentials:

```
git push --dry-run origin main
  fatal: could not read Username for 'https://github.com'
```

Read access to `github.com/Wieedze/ARP` works; write does not. **No PR can be opened from here.**

What ships instead: local branches with atomic commits, plus a complete PR body per branch in
`.github/pull_request_drafts/`. Opening them afterwards is one command each — see §5.

---

## 1. Branch map

Each branch is one reviewable unit, cut from `main`, targeting `main`.

| Branch                          | Delivers                                                    | Depends on | Serves              |
| ------------------------------- | ----------------------------------------------------------- | ---------- | ------------------- |
| `docs/strategy-and-positioning` | The measurement, the positioning, the ADRs, `verify:pin`    | —          | the decision record |
| `feat/pin-writes-server-side`   | Task 06 — restore the write path, key server-side only      | —          | Phase 0             |
| `feat/erc8004-connector`        | `@arp-protocol/erc8004` — read, merge, verify signatures    | —          | Phase 1 · O1        |
| `feat/agent-trust-panel`        | `/agent/:chainId/:tokenId` — merged panel + curation market | connector  | Phase 1 · O1 + O6   |

The shape is a fan-out, not a linear stack:

```
main
 └─ docs/strategy-and-positioning        (7)
     ├─ feat/pin-writes-server-side     (+5)   ← sibling
     └─ feat/erc8004-connector         (+10)   ← sibling
         └─ feat/agent-trust-panel     (+12)   ← stacked, consumes the connector
```

`feat/pin-writes-server-side` and `feat/erc8004-connector` touch disjoint files and are independent —
the connector is read-only and never touches the write path, so neither needs the other. Merge order:
the strategy branch first, then the two siblings in any order, then the panel after the connector.

---

## 2. What each branch contains

### `docs/strategy-and-positioning`

Already in the working tree. Six atomic commits:

1. `fix(gitignore)` — a bare `docs` rule was ignoring the whole directory, which is why
   `docs/07_INTUITION_ERC8004_PARTNER_GUIDE.md` was never committed despite ADR 0015 declaring it
   canonical. Adds the guide, and protects it from reformatting.
2. `docs` — `08`, the measured ecosystem analysis.
3. `docs` — `09`, positioning and plan.
4. `feat(scripts)` — `verify:pin`, `.env.example`, `package.json`.
5. `docs(adr)` — `0015`, `0016`, and `tasks/06`.
6. `fix(ui)` — stray character in the delegation summary.

### `feat/pin-writes-server-side` — Phase 0

Spec: `tasks/06-pin-writes-server-side.md`. Decision: ADR 0016.

`pinThing` targets `pin.intuition.systems` and takes its credential as an **explicit parameter**, so
only Node entry points can supply one and browser code loses the call by construction. Threaded
through `ensureAtomForThing`, `redeemEnsureAtomForThing`, `getOrCreateUsesPredicateAtomId`. One shared
`scripts/pin-env.ts` reads the env and fails loudly. `scripts/seed.ts` drops its duplicate
implementation. Three test suites follow the signature. The vendored `intuition` skill gets a
staleness note.

**Gate**: `bun run verify:pin` green (already passing), `bun run test` green, no `process.env` read
anywhere under `app/src/services/`.

### `feat/erc8004-connector` — Phase 1 · O1

New workspace package. Read-only; never signs.

- Preflight resolve `(chainId, tokenId)` → canonical agent atom, by term ID, never by label.
- Trust surface: every `has trust provider` / `has trust assessment` triple with `term` and
  `counter_term` market data selected explicitly.
- Resolver fetch from `object.value.thing.url` — not `object.data`, which is the atom's pinned
  `ipfs://` URI.
- **EIP-712 signature verification** over the RFC-8785-canonicalised document with
  `assessment.signature` excluded. Reports `verified` / `unverified` / `mismatch` per provider.
  Nobody in this ecosystem currently checks this.
- Freshness against `freshness.validUntil` — stale is surfaced, never silently served.
- One `AgentProfile`, every field carrying its provenance.

**Gate**: resolves and merges correctly for a fixture set covering a rich agent, a metadata-less
agent, and a multi-provider agent. Unit tests mock at the network boundary only.

### `feat/agent-trust-panel` — Phase 1 · O1 + O6

A route rendering the merged panel: each provider's assessment with signature status and freshness,
the capability triples, and each `has trust provider` claim with its live support and opposition
market — position counts and distinct stakers, never bare market cap.

**Mainnet caveat.** The cohort lives on Intuition mainnet; ARP's contracts are on testnet 13579.
Reads are free and keyless, so the panel reads mainnet. Staking on mainnet spends real TRUST, which
`CLAUDE.md` forbids without explicit per-session confirmation. So the stake control ships built but
disabled behind a flag, with the UI stating plainly why. Enabling it is the user's call, and its own
ADR.

---

## 3. Review gates

Two layers, per the repo's own protocol.

**Per task.** Every branch ends with `task-verifier` against its spec and the matching rules. A fail
returns a punch list and the branch is not proposed until it passes. UI work additionally goes through
`ui-reviewer`; nothing here touches Solidity, so `contract-reviewer` is not in the loop.

**Global.** After all branches pass individually, one reviewer reads the combined diff for
cross-branch coherence: duplicated logic between the connector and existing services, drift between
what the ADRs decided and what landed, and anything that contradicts `docs/09`.

Each task's post-mortem lands in `.claude/learning/`, per `.claude/rules/workflow.md`.

---

## 4. Commit and PR discipline

Conventional commits, one logical change each, tests shipping with the feature. No `--no-verify`, no
force-push, no fixup commits after the fact.

Each PR draft answers, in order: what problem, what changed, what was decided and why, how it was
verified, what is explicitly not in it. A reader should understand the change without reading the
diff — that is the whole point of writing them.

Since the hackathon is over, the narrative-preservation check is replaced by the question `docs/09`
§10 proposes: _which tier of the evidence ladder does this serve, and does it move ARP up it?_

---

## 5. Opening the PRs

Once credentials exist:

```bash
gh auth login                      # once

git push -u origin docs/strategy-and-positioning
gh pr create --base main --head docs/strategy-and-positioning \
  --title "docs: measured ERC-8004 positioning, ADRs 0015-0016, verify:pin" \
  --body-file .github/pull_request_drafts/01-strategy-and-positioning.md
```

…and the same shape for each remaining branch. Merge order follows the dependency column in §1.

---

## 6. Out of scope for this session

- Phase 2 (capability indexing) — the moat, but it is a write path at scale and needs Phase 0 merged
  and a gas budget first.
- Phase 3 and 4.
- Deploying any ARP contract to Intuition mainnet, and creating atoms or triples there at scale
  (ADR 0021 costs that: 0.5 TRUST per agent, ~14,300 across the cohort).

  **Superseded:** this section originally read "any mainnet write, including enabling the stake
  control". ADR 0017 authorised one narrow class of mainnet write — deposits into existing
  `has trust provider` vaults, signed by the operator — and the panel ships it enabled. The
  prohibition above is what survives.

- Deploying ARP contracts to Intuition mainnet.
- The `CLAUDE.md` authority re-point proposed in `docs/09` §10 — the router does not change silently;
  it needs its own ADR and the user's acceptance of `docs/09`.
