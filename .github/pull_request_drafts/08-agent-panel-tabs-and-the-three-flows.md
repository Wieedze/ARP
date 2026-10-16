# feat: tabs, the predicate fix, and the plan for rating agents that never heard of ARP

**Branch** `feat/agent-panel-tabs` → `main` · 32 commits · 66 files · Tasks 12, 15 and 20 shipped; 17–19 specced.

Three separable things. Review in this order, they get progressively more consequential.

1. **UI** — tabs on the agent panel, and the copy stripped back. Tasks 12 and 15.
2. **A write path that was writing into a node nobody queries.** Task 19 step 1, ADR 0030. This is the one that matters.
3. **Docs and specs** — the plan for flows the cohort can't opt out of. `docs/13`, `docs/14`, tasks 17–20.

---

## 1 · The UI

**Task 12** — one tab per trust provider instead of stacked sections, so two providers' opinions of
the same agent sit at the same place on screen and compare by switching rather than scrolling. ADR `0028`.

**Task 15** — every explanatory paragraph removed from the panel and the directory; the facts kept.
"N stakers" became a person mark and a number. The Agent tab leads and is the default. One sentence
over the stake control, with the cap and the irreversibility moved to the confirmation step where
they bite. ADR `0029`.

### The bug review caught here

The task's removal list named one string — `no signature block at assessment.signature` — and the
implementation suppressed `verdict.reason` for **every** `unverified` verdict. The connector emits
nine. The worst collapse:

```
could not reconstruct the signed payload: no strategy is confirmed for provider "asterpay"
```

That is a statement about **the connector's own limits** on a document that _is_ signed, and it
rendered identically to a document with no signature block at all: two words, `NOT VERIFIED`. On a
page whose argument is that providers sign and nobody checks, that conflation is a **tier
regression** — the panel fell back from demonstrating the evidence ladder to asserting it.

Nothing caught it because the only `unverified` fixture carried the one reason that _should_ be
dropped. A fixture set covering one member of a nine-member union is not coverage of the union.

Fixed by exporting `ABSENT_SIGNATURE_REASON` from the connector and suppressing only that reason —
one copy of the string, no brittle literal comparison, public `SignatureVerdict` unchanged.

### What the strip cost, recorded rather than engineered away

ADR `0029` carries six Negative bullets. Two are outright fact losses:

- **`Weight unknown.`** no longer says whose omission that is, so a reader can read it as a limit of
  the panel rather than of the provider's document — which inverts the point.
- **The `Statements` column lost the floor of its own scale.** The removed note read "the mirrored
  shell gives every agent five, so anything above five is somebody having bothered." The column is
  now a bare integer, so `5` and `7` are indistinguishable in meaning. Not a sentence explaining how
  to judge — the constant a reader needs in order to judge at all.

All of these removals were dictated by name. They are reported, not reversed.

---

## 2 · ARP was writing into a node nobody queries

`intuition-graph.ts` minted its **own** predicate atom by pinning a Thing named `"uses"`. Atom ids
are content-deterministic over the pinned URI, so this produced a node in neither of the ids the
connector filters on. **One half of the repo wrote edges the other half could not see, and no third
party could either.** `docs/07` names the failure exactly: _"do not mint your own copies — a
differently-pinned duplicate is a different node and fragments the staking surface."_

### Two mistakes on the way to fixing it, both caught by review

**First pass fixed a function with no production callers.** `declareUsesTriple` is referenced only by
its own definition and its tests. The writers are `scripts/agent-stake-on-use.ts` and
`scripts/agent-loop.ts`, which both still minted. Running either would have written orphan edge #22,
silently.

**And it chose the predicate on the wrong axis.** It picked `use` `0x9ddda4ac…` because that is the
id published in Appendix B, reasoning that ADR `0015` makes publication the rule and the 27-edge
difference was noise. Both statements true, conclusion wrong: **publication and volume only decide
between nodes that mean the same thing.** Measured, every edge on each, by object:

| predicate            | objects that are a protocol              |
| -------------------- | ---------------------------------------- |
| `use` `0x9ddda4ac…`  | mainnet **153/158**, testnet **166/166** |
| `uses` `0x5c0bde1c…` | mainnet **0/185**, testnet **0/143**     |

`use` means **"supports this protocol"** — A2A 69, MCP 68, OASF 16 — and Appendix B's object table
for it is five standards, enumerated and closed. `uses` means **"this entity uses this tool"**:
Intuition, Base, Ethereum, IPFS, Claude, GitHub, Obsidian, Cursor.

**So: write on `uses`. Where meaning and publication disagree, meaning wins — wrong data is not
repaired by being discoverable.** ADR `0030` records the reversal with what the first pass had
claimed quoted in place.

The cost is real and accepted: `uses` is not in Appendix B, so a third party following the guide will
not see ARP's edges. The remedy is canonisation, and the proposal has evidence — a vocabulary slot
with no published owner, fragmented across four atoms on mainnet and five on testnet.

### Task 20 · a tool is not a protocol

Both predicates mapped to one relation, bucketed as `protocols`. Split into `supports-protocol` and
`uses-tool`, with a new `tools` bucket. Named by meaning, deliberately breaking the label-mirroring
convention, because the one-letter gap between `use` and `uses` _is_ the bug.

**The defect was latent, not live, and an earlier version of this branch said otherwise.**
`getCapabilities` only runs on a subject resolved through `same as`. Of the distinct subjects carrying
a `uses` edge — 83 mainnet, 69 testnet — **zero** carry a `same as` edge, against 79 of 80 for `use`.
So nothing was ever reported to a reader as a protocol. The fix stays necessary: ARP was about to
write `uses` edges on exactly the reachable subjects, which converts latent into live. **A defect
fixed before it could fire, which is worth saying plainly instead of inflating.**

### Also in here

- An `isTermCreated` preflight on the predicate, throwing `PredicateNotOnChainError`. It replaced an
  on-chain revert that fired _after_ the user had approved and paid gas.
- `declareUsesTriple` and both scripts now need **no pinning credential**. A predicate is not ours to
  create. The scripts had kept `requirePinAuth()` and hard-threw without a key they no longer used,
  so nobody could run the newly-fixed path.
- **Orphan census**: `0x3707e587…`, label `uses`, pinned description byte-for-byte the string from the
  deleted helper. 21 edges, **testnet only**, 21,000,000 wei ≈ 2.1 × 10⁻¹¹ tTRUST, absent from
  mainnet. Not migrated — Intuition has no deletion. The bug cost nothing material.

---

## 3 · Docs and specs

`docs/13_THE_THREE_FLOWS.md` sets out three ways an agent gets rated and the order to build them.
`docs/14_THE_WITNESS_PROBLEM.md` answers the question both earlier plans dodged.

### The load-bearing conclusion

**You cannot observe a runtime, and a connector inside the agent's process is under the agent's
control.** It sees only what the agent passes it, so an agent can call `declare_used(["A"])` having
used B. An SDK **moves the lie one layer in** rather than reducing it. Proving what a program did
internally needs a hardware root of trust or a zk proof, not an npm package.

So the connector stops being presented as verification. What is a fact is only what touched a **third
party** — a payment, an on-chain call, a delegation redemption — or what the **counterparty**
attests. Hence the reversal: **do not ask the agent what it used, ask the tool who used it.**

And the collapse that makes it cheap: in ERC-8004 plus MCP the tool layer and the agent layer are the
same layer. Agent `8453:2340` declares six MCP tools _and_ holds an ERC-8004 identity, so
`(A, use, B)` joins two atoms that already exist. No namespace to invent, no `ModuleRegistry` to
deploy — ADR `0025` was right for a reason it did not know.

### Measured, with every script committed

|                                                | n        | result                               |
| ---------------------------------------------- | -------- | ------------------------------------ |
| declares a protocol endpoint                   | 122 docs | 63 — **51.6%** (CI 42.9–60.3%)       |
| **answers one**                                | 122 docs | 3 — **2.5%** (CI **0.8–7.0%**)       |
| `tokenURI` reverts or empty                    | 140 ids  | 23%                                  |
| of those with a URI, document does not resolve | 108      | **37%**                              |
| declared endpoints that are probeable at all   | 90       | **16** — 76% templated, 7% not a URL |

**About half the cohort says it is callable; between 1% and 7% is.** The gap survives the error bars:
bottom of the claiming range against top of the answering range is still roughly sixfold.

Quote the interval, not the point — at n=3 the extrapolation spans 741 to 6,160 agents.

Nothing in these percentages is a defect on the agent's part. **82% of declared endpoints are
unprobeable** (templated `{placeholder}`, CAIP address, ENS name), and conflating that with _failing_
would mass-slander the cohort on the first run. Hence three groups, not pass/fail: confirmed, not
checkable, inconclusive.

---

## Verification

|           |                                                                                          |
| --------- | ---------------------------------------------------------------------------------------- |
| `app`     | `tsc -b` 0 · `lint` 0 · **205 passed / 2 skipped** (was 124 at the start of this branch) |
| `erc8004` | build 0 · **174 passed / 4 skipped**                                                     |
| `scripts` | both bundle; the constant is present and the minted description gone                     |
| Reviews   | `ui-reviewer` PASS · `task-verifier` PASS · `intuition-integrator` PASS                  |

## Gaps, stated plainly

- **Nothing was visually verified.** No browser in the build environment. Open `/agents` and
  `/agent/8453/2340` before showing anyone.
- **`scripts/` is outside every gate.** `app/tsconfig.app.json` includes only `src`; there is no
  eslint config at the repo root; `bun build` strips types without checking unused locals. A dead
  variable survived all three, in the two files a fix existed to repair. Recorded in task 19.
- **`strict` has never been set** in `app/tsconfig.app.json`, which `code.md` calls non-negotiable.
  Measured: **zero errors**. So every "tsc clean" since task 01 was weaker evidence than the rule it
  was cited against. `tasks/18`, one line, deliberately not slipped in here.
- Task 19's gate is **not** claimed. `getCapabilities` keys on a subject resolved through `same as`
  while the write paths pass a CAIP-10 atom; the predicate was half the problem.
- `ensureAtomForURI` mints an atom for any `ipfs://` string without validating it is a CID. 18
  permanent testnet atoms with fabricated CIDs already exist. `tasks/20` appendix.

## Two things not from these tasks

- **`502a010`** recovers ADR `0027` plus a population correction in `docs/12`; it rides this branch
  because it never reached `main` through the earlier stacked PRs.
- **`CLAUDE.md`** cited the evidence ladder as `docs/09` §2; it is §3. Fixed — a wrong pointer in the
  section that gates every task misroutes every reader of it.

## New in `.claude/`

`STATE.md` (the project's position in one read), `rules/claims.md` + ADR `0031`, and generated
`INDEX.md` for both `choices/` and `learning/`.

ADR `0031` exists because **six statements in this session were wrong while every underlying
measurement was right** — two reviewers re-derived the numbers and got identical values. The break was
always the step from a measurement to a sentence. Four checks: reachability before blast radius, one
number one context, cite third parties to a file and a line, confirm a gate's scope covers your
change. Plus: commit the script, not the number.

The index generator immediately surfaced that **ADR `0015` is still `Proposed`** while the project
depends on it.

## Which tier of the evidence ladder does this serve?

**Tier 3, and it repairs the path to tier 4.** The UI protects the one tier-3 affordance ARP ships.
The predicate fix is what makes a staked usage edge _exist and be readable at all_ — without it every
stake-on-use was TRUST spent into an orphan node. `docs/14` names the first thing in this ecosystem
that is not an assertion: two parties with opposing interests agreeing.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
