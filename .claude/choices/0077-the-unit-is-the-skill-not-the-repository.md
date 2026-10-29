# 0077 — The unit of the catalogue is the skill, not the repository

**Status:** Accepted
**Date:** 2026-10-29
**Triggered by:** user request — _« je veut noté les skills »_, after the measurement that made the mismatch visible

## Context

`catalogue/tools.json` held 53 rows: 22 MCP servers and 31 skill repositories. The 31 were rows
because that is the granularity the scrape returned, not because anyone decided a repository was
the thing being catalogued.

`scripts/measure/skills-installs.ts` made the mismatch measurable on 2026-10-29. Those 31
repositories hold **662 skills** between them — 71 in one, 1 in another — and skills.sh counts
installations **per skill**, because `npx skills add <repo> --skill <name>` is what a person runs.
The repository is the delivery vehicle; the skill is what is chosen.

Three aggregation rules were tried on the install counts and none survived:

| rule | top of the ranking | what breaks |
| --- | --- | --- |
| sum | `mattpocock/skills` 30.6M | 71 ordinary skills beat one excellent one |
| max | `vercel-labs/skills` 4.1M | says nothing about the other 54 |
| median | every single-skill repository | rewards holding one thing |

Only one repository appears in two of the three top fives. An aggregation rule was a patch over a
granularity that was wrong, so the granularity was changed instead.

## Decision

A catalogue row is one skill, identified by
`https://github.com/<owner>/<repo>?skill=<name>` — the two arguments of the install command and
nothing else. 662 atoms, each with a `source` edge to its repository (ADR `0078`) and one `has tag`
edge at its domain.

## Alternatives considered

- **`…/<repo>#<name>`** — rejected by measurement before anything was written.
  `normaliseToolUrl` **drops the fragment** (a fragment is a scroll position), so all 55 of
  `mattpocock/skills`' skills would have hashed to the repository's own atom. One atom for 55
  things, permanently, with nothing to notice at write time.
- **`…/<repo>/tree/HEAD/skills/<name>`** — the real file path, and the truest URL. Rejected because
  it needs 662 requests to resolve, the layout differs by repository (`skills/<name>/SKILL.md` in
  some, `<name>/SKILL.md` in others), and **a moved file forks the atom for ever**. Intuition has
  no deletion; `github.com` already resolves five distinct atoms on mainnet for exactly this class
  of reason (`declare/tool-thing.ts`).
- **Keep the repository and aggregate** — the three rules above. Each is defensible and they do not
  agree, which is the signal that the question was the wrong one.

## Consequences

**Positive:**

- A copy and its original are different atoms by construction, since they differ in the `<repo>`
  half of the URL. 177 of the 662 are copies by name — `ai-video-generation` appears 8 times,
  `remotion-render` 7 times with `remotion-dev` itself among them — and nothing has to be done to
  keep them apart.
- The URL is a pure function of two strings: no request, no path to resolve, nothing that can move.
- The install count now attaches to the thing it counts.

**Negative:**

- The catalogue grew 20×, and so did the cost of any pass over it: 662 atoms + 662 `source` edges
  + 655 tags is 1,979 terms and ~4 tTRUST on testnet.
- `?skill=…` is not a URL GitHub does anything with. It resolves to the repository page, which is
  the right place, but a reader who clicks it does not land on the skill.
- The 22 MCP servers keep the repository as their unit, because for them it **is** the unit. The
  catalogue is now two granularities, distinguished by `kind`.

**Neutral (worth knowing):**

- 662 pages of 20,000 on skills.sh. The catalogue is a sample, not the population.

## References

- Related ADR: `.claude/choices/0078-source-is-the-edge-from-a-skill-to-its-repository.md`
- Related ADR: `.claude/choices/0054-*` — tool URLs as the atom's only input
- Measurement: `measurements/skills-installs-2026-10-29.json`, `scripts/measure/skills-installs.ts`
- Script: `scripts/seed-skills.ts`
