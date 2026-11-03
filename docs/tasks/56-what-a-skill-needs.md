# Task 56 — What a skill needs, shown to the agent before it picks one

**Status:** **PLAN**, 2026-11-02. Nothing built. Decided with the user the same day.
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

It serves no tier directly. It keeps the discovery claim honest: a skill found but unusable without
an account is a result that tasks 52 and 54 would otherwise count as a success.
