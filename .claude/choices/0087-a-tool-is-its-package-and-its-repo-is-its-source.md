# 0087 — A tool is its package, and its repository is its source

**Status:** Accepted, one point open (below)
**Date:** 2026-10-30
**Triggered by:** user decision, `docs/tasks/34-the-design-handoff.md` §3 decision 2 — _« cli doit
être la même chose que web … url = repo, npm package = package, mais le tout doit être relié à
l'identité »_, then _« l'identité reste le skill ou le package qui eux-mêmes sont reliés à
l'identité du repo »_.

## Context

`data/catalogue/tools.json` registered all 53 tools under a `github.com` URL: 31 `skill-repo`, 22
`mcp-server` (counted 2026-10-30 from the file). For an MCP server that URL is the repository. The
CLI hook (`docs/design/cli-v0/`, `mcp-config.ts`) resolves a configured server to its npm or PyPI
page, or to its remote endpoint. Under ADR `0054` those are different atoms, so the hook's `uses`
triples would land on an atom the web never shows.

## Decision

**The identity is the thing an agent actually calls; the repository is where it comes from.**

| atom                                       | identity of    | typed by `has tag`        | linked by          |
| ------------------------------------------ | -------------- | ------------------------- | ------------------ |
| `npmjs.com/package/<name>`, PyPI page      | the package    | its kind, and `mcp`       | `source` → repo    |
| `github.com/<o>/<r>?skill=<name>` (`0077`) | the skill      | `skill`                   | `source` → repo    |
| a remote MCP endpoint, when no package     | the endpoint   | `mcp`                     | `source` → repo, when known |
| `github.com/<o>/<r>`                       | the repository | `maintained`, as today    | —                  |

- **Several tags per identity**, the user, 2026-10-30: _« plusieurs tags »_. A package that is an
  MCP server carries its kind and `mcp`, each a separate `has tag`. This does not amend ADR `0074`:
  that ADR allows one tag **per domain branch**, and these are different branches.
- The CLI and the web resolve a tool by the same function, in `packages/protocol/`. `uses` is
  written on the identity, never on the repository.
- `source` is the predicate the skills already carry. `same as` is not used: it is the only proof
  on the graph that a subject is an ERC-8004 agent (`packages/protocol/src/discover.ts:50`).
- **A wrong registration is retired, not deleted.** ARP redeems its position on it, and it leaves
  ARP's reading, which is the set of terms the attestor holds with `shares > 0`
  (`data/catalogue/ontology-13579.json`, `_theReadingRule`). Precedent: `card-payment`,
  `scripts/seed/retire-domain-edge.ts`. The redeemed amount comes back less the creation fee
  (0.002 deposited, 0.00098 returned there), and the term stays on chain for any reader without the
  attestor filter.

## Open

1. ~~**The kind tag's label.**~~ Settled the same day by ADR `0088`: a compound is allowed when it is
   necessary and says why, so the tag is `npm package`.
2. **The migration's cost** on 13579, before anything is signed: the package atoms, their tags and
   `source` edges, and the redemptions on the 22 repository atoms tagged as tools. A dry run prices
   it; ADR `0037` governs the signing.

## Consequences

- The tool page shows `Source → repo` where the reference had an "Also reached as" row.
- Of the 53 catalogue entries, the 22 MCP servers change identity; the 31 skill repositories
  already follow this shape through ADR `0077`.
