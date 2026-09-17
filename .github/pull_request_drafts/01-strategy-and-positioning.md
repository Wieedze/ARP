# docs: measured ERC-8004 positioning, ADRs 0015–0016, verify:pin

**Branch** `docs/strategy-and-positioning` → `main` · 7 commits · no runtime code paths changed except one new script and one stray-character fix.

This PR is the decision record behind everything that follows. It contains no feature work. The three feature PRs stack on top of it and should be reviewed after it.

---

## The problem

ARP's declared strategy was a hackathon that ended on 2026-06-15. `CLAUDE.md` still named `docs/00_HACKATHON_PIVOT.md` as the first source of authority, and the narrative-preservation check on tasks 02b–05b was still enforcing a submission that had already shipped.

Meanwhile the market moved underneath us and nobody had measured it.

## What was measured

Queried `mainnet.intuition.sh/v1/graphql` directly rather than reading announcements. Every figure below is reproducible — the queries are in `docs/08`, Appendix A.

|                                                  |                                                         |
| ------------------------------------------------ | ------------------------------------------------------- |
| Agents asserting `implement → ERC-8004`          | **28,648** (mirrored from the Base registry, Sept 2026) |
| `has trust provider` edges held by the incumbent | **28,644 of 28,683** — 99.99%                           |
| `use` triples in the entire 284,187-triple graph | **194**                                                 |
| `has category` triples                           | **120**                                                 |
| Positions on any `has trust provider` vault      | **1–2**, all bootstrap deposits from the writing wallet |
| Agents with no metadata beyond `Agent 8453:NNNN` | **15,513** (54%)                                        |

Every agent in the cohort carries the same 5-triple shell: `same as` (CAIP anchor), `has type → AIAgent`, `implement → ERC-8004`, `has trust provider`, `has trust assessment`.

Sampling twelve of the incumbent's assessment documents: the median agent is scored on **one reviewer**. Three different agents currently show an identical `67.25` — the same single review propagated through a deterministic curve.

## What was decided

**ARP is not a feedback aggregator.** That slot is filled by a competent open-source scorer with 99.99% coverage, and arriving second into a winner-takes-most slot with a worse distribution story is not a plan.

The argument in `docs/09` is the **evidence ladder** — trust signals differ by what they cost to produce:

| Tier       | Claim                                  | Cost to produce                    | Supplied by                        |
| ---------- | -------------------------------------- | ---------------------------------- | ---------------------------------- |
| 1 Asserted | "I am an agent, I do X"                | one gas fee                        | ERC-8004 · 28,648 agents           |
| 2 Rated    | "someone scored this 67.25"            | **nothing** — feedback is free     | the incumbent · 99.99%             |
| 3 Staked   | "I have capital at risk on this"       | capital that can be lost           | **nobody, at any real size**       |
| 4 Proven   | "this executed under enforced caveats" | a transaction a contract validated | **nobody — ARP has the machinery** |

You cannot aggregate your way out of a costless input. ARP takes tiers 3 and 4. Tier 4 is the durable one: producing it requires having built bounded execution, which is the expensive part everyone else skipped and which this repo already shipped.

## What ships in this PR

**`docs/08`** — the measurement, the gap map, seven costed development options, and the reproducible queries.

**`docs/09`** — the positioning: the ladder, explicit scope boundaries (the "is not" list is as long as the "is"), three audiences, four phases gated on outcomes rather than dates, and four falsifiers written down now so they cannot be rationalised later.

**`docs/10`** — the implementation plan this PR is part of.

**ADR 0015** — converging on Intuition's canonical ERC-8004 pattern. `docs/09` keeps it but demotes it: becoming a trust provider is Phase 3 and a _consequence_ of the positioning, not the positioning itself.

**ADR 0016** — Intuition writes move server-side. See the sibling PR.

**`bun run verify:pin`** — validates the partner pinning key and, in the same pass, proves ARP reproduces Intuition's canonical agent-atom recipe.

## Two fixes that fell out of the work

**`.gitignore` was ignoring the entire `docs/` directory.** A bare `docs` rule sat inside the MetaMask-skills block, meant for the installer's parallel copies (`.cursor/`, `.agents/`). The installer never creates a `docs` folder, so the rule only ever matched ours. `docs/00`–`06` survive solely because they predate it.

The consequence was not cosmetic: **`docs/07_INTUITION_ERC8004_PARTNER_GUIDE.md` had never been committed.** ADR 0015 declares it canonical and points at a file absent from every clone. This PR adds it, and pins it in `.prettierignore` because it is a verbatim vendored snapshot whose value depends on not being reformatted.

**A stray `a` in `AgentRegister.tsx`** rendered as literal text in the delegation summary.

## How it was verified

```
$ bun run verify:pin
[1/4] Key present: len=64 header=apikey
[2/4] Probing WITHOUT the key (expect 401)…  http=401 OK — endpoint is gated as expected
[3/4] Probing WITH the key (expect 200)…     http=200 OK — key accepted
[4/4] Determinism check against agent 8453:6649…
  returned: ipfs://bafkreif6xwptjdsux2iwnhdbxyjom23bzzimhk62y574rreexdghi6hlbq
  on chain: ipfs://bafkreif6xwptjdsux2iwnhdbxyjom23bzzimhk62y574rreexdghi6hlbq
MATCH — the canonical agent-atom recipe is reproducible.
```

That MATCH is the gate on Phase 0. It means ARP can derive any agent's canonical atom locally and preflight before minting, so the duplicate-atom fragmentation this architecture cannot recover from is off the table.

`bunx prettier --check` passes on every file touched. The repo has a pre-existing 139-file formatting backlog (`README.md` and `docs/00` among them) which this PR deliberately does not sweep up, so the diff stays reviewable.

## Explicitly not in this PR

- **No change to `CLAUDE.md`'s source-of-authority list.** `docs/09` §10 proposes re-pointing it and retiring the narrative-preservation check, but the router does not change silently — that needs its own ADR and your acceptance of `docs/09` first.
- No capability indexing, no trust-provider publication, no mainnet writes.
- `integration8004.txt` at the repo root is left untracked; it duplicates `docs/07`, which is now properly committed. Probably delete it.

## Which tier of the evidence ladder does this serve?

None directly — it is the decision record that says which tiers ARP is going after and why, replacing a commitment that expired three months ago.
