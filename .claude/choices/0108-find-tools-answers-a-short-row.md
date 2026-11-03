# 0108 — `arp_find_tools` answers a short row, by text, a page at a time

**Status:** Accepted
**Date:** 2026-11-02
**Triggered by:** user, 2026-11-02: _« je veux réduire les coûts »_, _« et la pagination et le
système de recherche »_, _« maximiser les résultats et la découverte, mais moins de tokens »_.
Task `docs/tasks/49-lean-search.md`.

## Context

One live Claude Desktop session spent about 21,000 tokens in three `arp_find_tools` calls. Most of
each row was what the agent does not use to choose: ids, an IPFS URI, amounts in wei. Copies of one
skill across repositories came back once each. There was no free-text search and no pagination,
so an agent either got the first 100 of a domain or nothing.

## Decision

The default answer is a short row: `id`, `name`, `url`, `purpose`, `declarations`, `installs`,
`copies`. Copies of a skill with the same name and purpose collapse into the one with the most
declarations, then the most installs; declarations are not summed across copies.
`query` searches names and descriptions; `offset` pages. `detail: "full"` keeps every field the
previous answer had, so nothing an agent could read before is gone.

The search ranks by words matched. It orders results and is never returned: it measures the text,
not the tool, which keeps it clear of ADR `0046` (no score).

## Alternatives considered

- **Drop fields without a full mode.** Cheaper, but the backing behind a declaration is how an
  agent checks a figure (`docs/12`). It stays one parameter away.
- **Embeddings or a hosted search.** Better recall, but a hosted service. ADR `0045` keeps ARP out
  of the path of a request, and ADR `0092`'s amendment lets a hosted service exist only if
  unplugging it costs money or a click, never a capability. A search that lived only on a server
  would be that capability. Word matching runs in the server the user already installed.
- **Keep every copy.** Each copy is a different repository and could differ. Collapsed only when
  name and purpose are identical, and `copies` says so.

## Consequences

**Positive:**

- 2.3 to 2.6 times more distinct tools per byte (task 49 §3).
- An agent can ask in its own words and page through a large domain.

**Negative:**

- The default answer no longer shows the backing behind each result. An agent that wants it
  asks for `detail: "full"`.
- The short row's field names differ from the full row's (`id` and `url` against `tool_atom_id`
  and `hosted_at`). Nothing outside this repo reads them yet; nothing is published.

**Neutral (worth knowing):**

- The skill descriptions are skills.sh's, measured 2026-10-29, and the install counts with them.
  `detail: "full"` dates them with `installs_read_at`.

## References

- Related task: `docs/tasks/49-lean-search.md`, `docs/tasks/45-discovery-without-a-command.md` (45c)
- Related ADR: `0046`, `0045` (as amended by `0092`), `0102`
