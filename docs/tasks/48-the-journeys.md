# Task 48 — The journeys: what a visitor meets, and the conventions they expect

**Status:** **built** 2026-11-02 on `feat/48-journeys`. Reviews and verification below.
**ADR:** `0105` (the app opens on testnet), `0106` (labels are at least 11px).
**Rules:** `ui.md`, `code.md`, `claims.md`, `portability.md`, `workflow.md`.
**Reviewers:** `ui-reviewer`, `intuition-integrator` (the cohort query), then `task-verifier`.
**Required skills:** `intuition` for the query change.

---

## 1. Why

After task 46 the user asked what could still improve in design and user journeys, against common
conventions (« en termes de design et de parcours utilisateur, norme, convention générale »). I
published nine findings, ranked by impact on a visitor. The user's answer was « fais tout ça ».

## 2. The user's decisions (2026-11-02)

| Question | Decision |
| --- | --- |
| The nine findings | **do all of them**: « fais tout ça » |
| The default chain (item 1), marked as their call | covered by the same answer. ADR `0105` records the trade-off |
| The label minimum (item 7), marked as a rule change | covered by the same answer. ADR `0106` |
| Global search (item 4), marked as a new feature | covered by the same answer |

## 3. What was built

| | Finding | Built |
| --- | --- | --- |
| 1 | A first visit landed on mainnet, where `/tools` showed 0 and `/activity` nothing | The app opens on testnet 13579. A stored "mainnet" is kept. `lib/chain-choice.ts`, `lib/__tests__/chain-choice.test.ts` (3). ADR `0105`. Three comments that called mainnet the default are reworded |
| 2 | `/activity` rows were not links, and tools showed as full URLs | The agent and tool open their `/atom/` page. A tool reads as `writing-plans` over `obra/superpowers`, like elsewhere in the app. `ChainFact` carries both atom ids. 1 test |
| 3 | Skill, repo and atom pages had no way back | `BackLink` ("← tools") on the three, and on the agent page ("← agents") in place of its inline copy |
| 4 | No search across both indexes | `/search?q=`: agents by name (the cohort query takes a name, below), tools by name, label, repository or description, and `chain/token` offers to open the agent. "Search" is in the nav, and `/` opens it from any page except while typing in a field. Tests: the page (3), `agentSearchQueryOptions` (2), `toolMatches` (2), `useSearchShortcut` (4, rendered under a router) and `isTypingTarget` (2), `cohortWhere` and `resolveListOptions` in the protocol (4) |
| 5 | On a phone the nav took three rows, about 200px | Below `md`: the mark and a Menu button on one row, 65px. The menu lists every item. Escape closes it and gives the focus back to the Menu button, and following any of its links closes it, the page already open included. `components/brand/__tests__/NavSplit.test.tsx` (4). Desktop unchanged |
| 6 | Dust figures and eight-decimal figures in lists | `shortTrust`, four significant digits, exact figure on hover, in the Agents and Tools lists. The market card shows "—" when nobody supports. Tools hides the counter vault's creation dust. Forms and confirmations keep `formatTrust`. Tests in `trust-format`, `agent-cohort` and `tool-catalog` |
| 7 | 24 labels hardcoded at 10px and one at 9px | All use `--text-label` (11px). `ui.md` says 11–12px. ADR `0106` |
| 8 | The activity bar said "open", "agent offline", "TRACE" | "show" / "hide", "your agent: live / connecting / not connected", "all activity →", "N from your agent". Tests updated |
| 9 | An atom page took about 15 seconds once | Measured twice in a browser on testnet: every read is done within about 2 seconds, and the slowest (`AtomStanding`) took 0.87s. It did not reproduce, so no code changed |

### The cohort query takes a name

`AgentCohort`'s filter is now a variable, `$where: triples_bool_exp!`, built by `cohortWhere`:
membership by term id on both ends always, and a name match only when a name was asked for. The
name is matched against the atom's label **or** its pinned Thing's name, because the list shows the
second when there is one (`intuition-integrator` review). The name's `%`, `_` and backslash are
escaped, which that review checked live against Postgres `ILIKE` on mainnet. A non-string name from
an untyped caller is ignored. Checked live on 2026-11-02: the filter as
a variable answers on testnet and mainnet, and `listAgents({name: "dackie"})` returns one agent on
each (cohort 256 on testnet, 28,648 on mainnet).

## 4. Do not do in this task

- Touch `ClaimField`, the Sigils, `SourceField` or `RingLoader`.
- Change the giant footer wordmark: the user keeps it.

## 5. Evidence ladder

UI work serves no tier directly. A visitor now lands where ARP's own staked tier is visible, and can
reach any agent or tool from one field. It does not move ARP up the ladder.
