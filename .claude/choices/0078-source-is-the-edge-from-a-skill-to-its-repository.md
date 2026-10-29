# 0078 — `source` is the edge from a skill back to the repository it came from

**Status:** Accepted
**Date:** 2026-10-29
**Triggered by:** user — _« jaime bien source »_, after the vocabulary was measured on both chains

## Context

ADR `0077` made the skill the unit. 662 skill atoms then needed one edge each saying where they came
from, and the reason is not bookkeeping:

~~Measured 2026-10-29, **177 of the 662 are copies**. Six repositories named `superpowers` hold 26~~
~~identical skills each, copied from `obra/superpowers` which holds 15. `ai-video-generation` appears~~
~~8 times, `remotion-render` 7 times with `remotion-dev` itself among them. And the install count~~
~~cannot tell a copy from its original — **two of the copies out-install `obra/superpowers`, and the~~
~~six together carry 5× his total**.~~

> **Corrected 2026-10-29**, the same day, by `scripts/measure/skill-content-duplicates.ts`. The
> decision below stands; its evidence was wrong in one direction and understated in the other.
>
> **False:** that the six were copied from `obra/superpowers`. It shares **zero** SKILL.md files
> with any of them — it is a different project carrying the same repository name, so "two of the
> copies out-install the original" compared it to repositories it has nothing to do with. The
> shared **name** was read as evidence of shared content, which `claims.md` §3 forbids: a claim
> about a third party needs a source, and a repository name is not one.
>
> **True, and stronger:** of **531** distinct SKILL.md files in the catalogue, **116 exist in more
> than one repository**. The six `superpowers` repositories carry **86 files each, all 86
> byte-identical across every one of the fifteen pairs**. Proven by GitHub's blob sha —
> `sha1("blob " + length + "\0" + content)` — which anyone reproduces with `git hash-object` and no
> credential. The user's test, in his words: _« si le contenu est bien le même »_.
>
> 177 was a count of shared **names**. A shared name is a hint; a matching hash is a fact.

That is the limit of every popularity signal, and it is the gap ARP exists to fill. Telling which
one came from the author is work nobody else is doing.

The project's vocabulary rule (user, 2026-10-28): _« tout ne doit faire que un mot, pas de mot
tiret, jamais »_, and a term already on chain is reused rather than minted.

## Decision

`(skill, source, repository)`.

`source` was **already on chain** and is reused, not minted. Verified on both indexers on
2026-10-29 before anything was written:

| | |
| --- | --- |
| id | `0xe6b33153a6f58b47bcfe074cd154447608d5788e96446246536ddb9cd84105a4` |
| type | `TextObject` — a plain string, so the id is a pure function of the word |
| 1155 | exactly one atom carries the label, 0 edges as predicate |
| 13579 | exactly one atom carries the label, 1 edge as predicate |
| derivation | `calculateAtomId(stringToHex("source"))` returns that id |

## Alternatives considered

- **`provided by`** — the obvious candidate, and published in `docs/07` Appendix B. Rejected: it
  resolves to **three** atoms on mainnet (28,751 edges on one, 1 on another), and its documented
  meaning is the trust pattern's edge from an assessment source back to its provider. Reusing a
  published predicate outside its stated meaning is the drift this project keeps writing rules
  against.
- **`part of`, `repository`, `origin`, `owner`** — each exists as an atom and each has **zero**
  edges as a predicate on both chains, so none of them is a term the ecosystem uses. `part of` and
  `belongs to` each resolve to several atoms.
- **`from`** — one atom, one edge, and a word a reader cannot pin down. Rejected on meaning, not on
  measurement.
- **Minting a new term** — unnecessary once `source` was found, and the rule is to look first.

## Consequences

**Positive:**

- The copy question becomes readable: a reader following `source` from
  `…/101-skills/superpowers?skill=web-search` lands on a repository that is not the author's.
- Nothing was minted, so no near-duplicate was created. Third time this week that checking first
  saved one.
- A plain string, so the same edge means the same thing on mainnet when the time comes.

**Negative:**

- `source` is generic. Nothing stops somebody using it for a citation, a data feed or a river, and
  the graph is permissionless. ARP's reading is attestor-scoped, so that costs nothing here — but
  the term is not ours and will not stay clean.
- It says where a skill came from, **not** who wrote it first. A fork's `source` points at the fork.
  Deciding which of seven `remotion-render` atoms is the original is a separate question this edge
  only makes askable.

**Neutral (worth knowing):**

- 1 edge on 13579 before ours; 662 after. ARP is now effectively the whole of that predicate's use
  on testnet, which is worth remembering before citing its adoption.

## References

- Related ADR: `.claude/choices/0077-the-unit-is-the-skill-not-the-repository.md`
- Related rule: `.claude/rules/claims.md` — cite a third party to a file and a line
- Measurement: `measurements/skills-installs-2026-10-29.json`
- Script: `scripts/seed-skills.ts`
