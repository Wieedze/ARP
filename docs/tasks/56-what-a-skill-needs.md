# Task 56 — What a skill needs, shown to the agent before it picks one

**Status:** **BUILT and verified**, 2026-11-03, branch `feat/56-requires` (`afbc0a3`, `8b1174a`), `task-verifier` PASS on the second pass, post-mortem `.claude/learning/51-what-a-skill-needs.md`. Decided with the user on 2026-11-02. Measured and built in §5.
**Depends on:** task 31's content path (the SKILL.md files are already fetched for serving).
**Rules:** `code.md`, `claims.md`, `workflow.md`.
**Reviewers:** `task-verifier`.

---

## 1. Why

Task 54's pre-pilot reading (§4b) found that `arp_find_tools` can rank first a skill that needs an
account or an external CLI: `query: "slide"` returns `lark-slides`, `query: "landing page"` returns
`101-skills` landing-page-design. The agent learns it only after it has picked the skill and read
it. The user (2026-11-02): the agent must be able to see it **before** it chooses.

No standard frontmatter field says "needs an account". The two files show it in two ways, read on
2026-11-02 through the GitHub contents API:

| Skill | What shows it | Where |
| --- | --- | --- |
| `larksuite/cli?skill=lark-slides` | `metadata: requires: bins: ["lark-cli"]` | frontmatter, declared by the author |
| `101-skills/superpowers?skill=landing-page-design` | `allowed-tools: Bash(belt *)`, then `belt login` | frontmatter for the CLI, body for the login |

## 2. What to build

1. **Read the requirements at catalogue build time**, beside `skill-facts.json`: for each of the
   663 skills, from its own SKILL.md,
   - **`cli`**: the binaries the author declares (`metadata.requires.bins`, `allowed-tools:
     Bash(<name> *)`). A fact the author wrote.
   - **`login`**: the first line of the body that names a login or a key (`login`, `auth login`,
     `API key`, `sign up`), quoted with its line number. A keyword match, so it says "mentions", never
     "requires".
2. **Show them in `arp_find_tools`** as a `requires` field on each result, short form by default.
   Nothing is computed at query time.
3. **Measure** how many of the 663 declare a CLI and how many mention a login, with a committed
   script and its output file, so the share is quoted from a run and not estimated.

## 3. Do not do in this task

- Reorder or filter results by requirement. Task 54 forbids changing the ranking to improve its
  measurement, and an agent can choose for itself once it can see the field.
- Call a skill good or bad. ARP publishes no score (ADR `0046`): "this file mentions `belt login`"
  is a fact a reader can check; "this skill is worse" is not.
- Ask a third party for the data. Everything comes from the skill's own file.

## 4. Evidence ladder

It serves **asserted**, tier 1: `cli` is the author's own declaration and `mentions_login` a quote
from the author's own file, shown as what the file says and promoted to nothing. It does not move
ARP up the ladder, since it adds nothing staked or proven. What it protects is task 54's
measurement, which would otherwise count a skill nobody can use without an account as a success.

## 5. Built and measured (2026-11-03)

- `scripts/helpers/skill-requires.ts` reads `cli` (frontmatter `metadata.requires.bins`,
  `allowed-tools: Bash(<name> …)`) and the first body line matching login, sign up, API key or
  access token. No YAML library: these two fields have two shapes each. Tests:
  `scripts/test/skill-requires.test.ts`, on the two files task 54's reading found.
- `scripts/measure/skill-requires.ts` reads every located SKILL.md from
  `raw.githubusercontent.com`, at the paths of `skill-layouts-2026-10-29T2200.json`, and ARP's own
  from this repository. Output: `data/measurements/skill-requires-2026-11-03.json` (first run), then `skill-requires-2026-11-03T0839.json` (second run, same counts, now counting `ambiguousDiffering` itself; the catalogue is built from it).
- `scripts/build/build-skill-requires.ts` writes `data/catalogue/skill-requires.json`, and
  `arp_find_tools` adds `requires: {cli?, mentions_login?}` to a result, short and full. The tool's
  description tells the agent to read it before it picks. Test: `apps/mcp/test/requires.test.ts`.

Measured 2026-11-03 over 663 catalogued skills (re-run `bun run scripts/measure/skill-requires.ts`):

| | skills |
| --- | --- |
| read | 522 |
| not located on 2026-10-29, so not read | 139 |
| found at several paths with different content, so not read | 2 (`ambiguousDiffering` in the second run) |
| failed to read | 0 |
| declare a CLI | 211 |
| mention a login, a key or a sign-up | 263 |
| either | 288 |

Two readings of those figures, before anyone quotes them:

- **`belt` is 156 of the 211**: the same 26 skill names in six repositories named
  `superpowers`, all needing inference.sh. One skill set copied into six repos, counted six times. The other CLIs are `lark-cli` (28), `runcomfy` (19),
  `agents-cli` (7), `agent-browser` (1).
- **`mentions_login` has false positives by construction.** Three are in the measurement file:
  "Requires no API key, fully free" (`remotion-dev/skills` remotion-maps), a query containing
  "Failed Login" (`microsoft/azure-skills`), "after signup" (`coreyhaines31/marketingskills`
  onboarding). ARP's own skill is a fourth: its line is "You need **no API key**, no account…". That is why the field says
  "mentions" and the agent is told to read it.
