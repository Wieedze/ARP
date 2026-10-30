# Task 34 — The design handoff: tool page, agent page, CLI v0

**Status:** **PLAN**, 2026-10-30. Not started. Each phase is verified on its own and can stop there.
**Rules:** `code.md`, `ui.md`, `portability.md`, `claims.md`, `workflow.md`; `security.md` for phase 3.
**Reviewers:** `ui-reviewer` (phases 1, 2, 4), then `task-verifier` per phase.
**Source:** `docs/design/` — its `README.md` says what each folder is and what is already built.

---

## 1. What the handoff holds, against what the repo already has

Measured 2026-10-30 by diffing each handoff file against `refactor/monorepo-apps`.

| handoff item                    | in the repo today                                                        | left to do                                  |
| ------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------- |
| `claim-field/v2-ring-names/`    | applied in `53c022c`, and the repo has moved past it (focus ring, card link) | nothing — do **not** apply the patch        |
| `pages/skill/`                  | `apps/web/src/pages/SkillPage.tsx`                                       | the 390px fix the new `skill-page.html` adds |
| `pages/repo/`                   | `apps/web/src/pages/RepoPage.tsx`                                        | the same                                    |
| `pages/tool/`                   | nothing: a tool atom renders through the generic `AtomPanel`             | **phase 1**                                 |
| `pages/agent/`                  | `AgentTrustPanel.tsx`, not in docs/16's order                            | **phase 2**                                 |
| `cli-v0/`                       | nothing; `apps/hook` is a different hook (one JSON line per call)        | **phase 3**                                 |
| `cli-surfaces/`                 | nothing                                                                  | **phase 4**, after phase 3                  |
| `readme-badges/`                | nothing                                                                  | production release — `FUTURE.md`           |

## 2. Phases

### Phase 1 — the tool page, as the skill page's other variant

`TOOL-PAGE.md`: a skill is a kind of tool, so **one component tree, two variants**.

1. Extract the blocks `SkillPage.tsx` and `RepoPage.tsx` share (classification, external signals,
   market + curves, relations, on the record) into `components/atom/`. No visible change: the
   existing page tests are the gate.
2. `SkillPage` becomes the `skill` variant of that tree; add the `tool` variant (MCP server): purpose,
   install line, classification, external signals (stars, last push, npm downloads).
3. "How it does for operators": **the empty state only.** No signed weekly report exists, so the
   dashed box and the `init` command are the whole section. Building the full section now would mean
   rendering sample figures, which the handoff forbids.
4. `AtomPanel` routes a tool atom to it, as it already does for `skill` and `repo`.

### Phase 2 — the agent page in docs/16's order

`AGENT-PAGE.md` + `docs/16_THE_AGENT_PAGE.md`, which wins. Restructure `AgentTrustPanel` section by
section, one commit each, reusing phase 1's market and relations blocks. "Does it answer?" ships as
its designed slot with `not checked yet`; nothing fills it yet. One Saffron action:
**Declare you used it**, wired to task 30's existing write.

### Phase 3 — CLI v0 lands

Do **not** `git am` the patch: it targets `b5682d9` and rewrites root `package.json` and `bun.lock`.
Copy `cli-v0/files-packages-cli/` in, add it to the workspaces, `bun install`, run its own tests
(Node ≥ 22.13, `node:sqlite`, no dependency). Where it goes is decision 1 below.

### Phase 4 — the surfaces

`CLI-SURFACES.md` §1–2: alerts first, the columns, colour only on a TTY without `NO_COLOR`, the
footer, `arp status <tool>`, `arp init`, the session line. Columns needing the network show
`not enough data`, as v0's own first verdict rule already says.

### Phase 5 — the probe

ADR `0093`. Its own service, `apps/probe`: a Worker with a five-minute cron, a D1 history, and a
read route. One `initialize` per remote endpoint (answers, asks for auth, does not answer, with
the time it took), and for a package its registry record. Dated, off chain, no colour. Local
first; a deploy waits for the user. Its first cycle is the reading the endpoints ADR `0087` still
needs are validated from. It fills docs/16 §4 and the tool page's same block.

## 3. Decisions for the user before the phase that needs them

1. **Phase 3 — where the CLI lives, and the two hooks.** The handoff's package is
   `@arp-protocol/cli`, the same name task 33 gives the one installer. Recommendation: land it as
   `apps/cli` (it runs, ADR `0082`), make it task 33's binary, and keep `apps/hook` untouched until
   task 33 decides whether `arp hook` absorbs it. Until then an operator who installs both gets two
   hooks on every call.
2. **Before CLI week 2 — the tool's identity** (`TOOL-PAGE.md` §3). The catalogue names Supabase by
   its repository URL, the CLI by its npm page: two atoms under ADR `0054`, and a `uses` triple on
   the wrong one is permanent.

   **Decided by the user, 2026-10-30:** _« cli doit être la même chose que web … url = repo, npm
   package = package, mais le tout doit être relié à l'identité de celui-ci »_. The CLI and the web
   resolve a tool the same way. The repository and the package each keep their own atom, under their
   own URL, and both are linked to one identity. Then: the identity is the package or the skill,
   linked to its repository by `source`, and a wrong registration is retired by redeeming ARP's
   position. **ADR `0087`**, with its two open points.
3. **Phase 1 or later — red on a week.** `TOOL-PAGE.md` paints a week under 95 % and an `outage` in
   alarm red. `ui.md` reserves `--color-alarm` for a signature mismatch or a module used but never
   declared (ADR `0018`), and ADR `0046` says ARP grades nobody. Not needed while the section is
   empty; it needs a yes or a no before the reports exist.

## 4. Do not do in this task

- Apply `claim-field/*.patch` — the repo is ahead of it.
- Ship any figure marked `sample`.
- Build the badges, the weekly reports, `arp sync`, or anything that publishes.

## 5. Evidence ladder

Phases 1 and 2 serve the **staked** tier: the pages are where a `uses` claim and the money behind it
are read. Phase 3 is below the ladder until week 2, when the hook's record becomes a `uses` triple.
