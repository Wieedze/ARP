# Task 49 — Lean search: more tools found, fewer tokens spent

**Status:** **BUILT and verified**, 2026-11-02, branch `feat/49-lean-search` (`b850a45`, `f4ac9d4`). ADR `0108`.
`task-verifier` PASS on the second pass, post-mortem `learning/43`.
**Rules:** `code.md`, `security.md`, `claims.md`, `workflow.md`.
**Reviewers:** `task-verifier`.

---

## 1. Why

The user installed ARP as a Claude Desktop extension on 2026-11-02 and asked whether consulting it
costs more than letting Claude search by itself. Measured on that session: three `arp_find_tools`
calls returned 16.6 KB, 0.9 KB and 65.2 KB, about 21,000 tokens, where a web search and two
README reads came to about 31 KB. ARP cost more, for two reasons of its own:

- a row carried twelve fields, two of them 32-byte ids, an IPFS URI and three amounts in wei;
- the same skill copied into several repositories came back once per copy.

The user's goal: _« maximiser les résultats et la découverte, mais moins de tokens »_. And the
search took no free text: an agent could only name a domain, and an unknown word was ignored.

The same session found three defects that stopped the server under Claude Desktop's built-in
Node. They are fixed in the first commit of this branch (`b850a45`).

## 2. What shipped

- **`query`**, free text matched against each tool's name, address and description, best match
  first. A word matches at the start of a word ("form" is not in "platform"), by its root
  ("editing" finds "edit"), and a tool holding every word ranks above one holding only the loudest.
  The ranking is never returned.
- **`offset`**, with `total` and `next_offset` in the answer.
- **A short row by default**: `id`, `name`, `url`, `purpose` (one sentence, at most 140 characters),
  `declarations`, `installs` for a skill, and `copies` when the same skill sits in several
  repositories. Copies collapse into the one with the most declarations, then the most installs,
  so a declared copy is never hidden behind an undeclared one. `detail: "full"` returns the
  previous rows with their field names unchanged; `title` and `purpose` are now filled where they
  were `null`, and `installs` is added.
- **Descriptions for the 662 skills**: `data/catalogue/skill-facts.json`, moved from
  `apps/web/src/data/` so the MCP server and the web app read one file. Its builder,
  `scripts/build/build-skill-facts.ts`, now writes there.

## 3. Measured

Testnet 13579, 2026-11-02, the built `arp mcp` called over stdio. One-off reads, no script
committed:

| call | before | after |
| --- | --- | --- |
| `{domain: "video"}` | 16.6 KB, 25 rows holding 19 distinct skills | 9.6 KB, 25 distinct skills standing for 71 rows |
| `{domain: "video", limit: 100}` | 65.2 KB, 100 rows holding 68 distinct | 37.6 KB, 100 distinct |
| `{query: "youtube thumbnail"}` | not possible | 1.3 KB, 3 results for 13 rows |

The domain `video` holds 197 rows and 114 distinct skills. Distinct skills per KB: 1.14 before and
2.60 after at 25 results (2.3 times), 1.04 and 2.66 at 100 (2.6 times).

The user's own session, same request, before and after (Claude Desktop, one run each): three calls
for 82.7 KB, then one call, `{query: "video editing"}`, for 9.9 KB.

**Not measured:** the cost against a search without ARP. The 31 KB above was one web search path,
taken once. Task 45c's eval is what answers it, with n and an interval.

## 4. Known limits

- A catalogued tool whose description is thin is hard to find by text: "accept card payments"
  does not bring Stripe to the top.
- The query matches English best: the descriptions are mostly English.

## 5. Do not do in this task

- Rename the tool, its other parameters or any field of the full rows.
- Change what the web app shows.
