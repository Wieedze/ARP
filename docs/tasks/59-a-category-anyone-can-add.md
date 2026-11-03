# Task 59 — A category anyone can add, by the same rules as the rest

**Status:** **IN PROGRESS**, 2026-11-03. Built: `planCategory` and its rules in `packages/protocol` (PR #56); the index reads both of ARP's addresses (decision A, 2026-11-03, ADR `0124`), on `feat/59-attestors`. The sponsor's `POST /propose-category` is the sponsor owner's, on `feat/59-sponsor-category`. Next: the MCP tool, the weekly review list, the first run on the 61 skills, the verify check.
**ADR:** `0115`. The rules are written out in `docs/25_THE_DOMAIN_TREE.md` §8.
**Rules:** `code.md`, `portability.md`, `security.md` (the sponsor writes), `claims.md`, `workflow.md`.
**Reviewers:** `intuition-integrator`, `ui-reviewer` if the web proposes, then `task-verifier`.

---

## 1. Why

61 of 662 skills on testnet 13579 carry no category, and nothing outside a terminal session can add
one. The user wants the graph traversable, so a new category must meet the same conditions and take
the same links as the 21 already under `tool`.

## 2. What to build

1. **`packages/protocol`: one plan for a category.** It takes a label, a parent and a skill; it
   normalises the label, checks the conditions of `docs/25` §8, and returns the unsigned calls: the
   atom if new, `(category, is a sub-domain of, parent)`, `(skill, has tag, category)`, each with
   cost plus `minDeposit` read off the chain. The checks now in `seed-domain-tree.ts`
   (`normaliseLabel`, `assertLabel`) move here, and the script calls them.
2. **The MCP server: propose a category.** The agent gets the existing categories first and must
   give a reason none fits. A refused proposal says which rule refused it.
3. **The sponsor: write an accepted proposal as the attestor**, testnet only, within a daily limit,
   and log label, parent, skill, reason and transaction. Coordinate with session arp-30, whose
   service this is.
4. **A weekly review list** of new categories with their reasons, and the existing retirement path
   for one that duplicates another.
5. **The web, too** (user, 2026-11-03: « on enregistre des nouveaux tools via le navigateur »).
   Right after path C lists a tool, a "Choose its category" step: the existing categories from the
   tree, or "None fits" with a name, a parent and a reason. An **existing category is a valid
   choice** and the common one: the plan then writes only the tag, with no rule on the label and
   no reason required. `/propose-category` accepts the browser exactly as `/list-tool` does. The
   plan's owner for this change is the sponsor's owner session, which holds `category.ts` now.
6. **First run:** the 61 uncategorised skills.
7. **A check** that every category reaches `tool` (`scripts/verify/verify-domain-tree.ts`).

## 3. Do not do in this task

- Mainnet: the sponsor writing as attestor is a testnet licence (ADR `0092`).
- Rename or move an existing category: Intuition deletes nothing, and that is its own decision.
- Rank or score categories.

## 4. Evidence ladder

It serves the **staked** tier: a category is a claim with a position behind it, written by the
attestor whose filings the index reads.
