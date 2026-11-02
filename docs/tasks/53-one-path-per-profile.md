# Task 53 — One path per profile, from the landing

**Status:** **IN PROGRESS**, 2026-11-02, branch `feat/53-paths`. 53a built (scene 4 is the three-way chooser, `lib/start-paths.ts`). 53b built (`/start/:profile`, steps ticked from the local feed by `services/start-steps.ts`). 53c and the action gate are next. The user's decisions are in §2.
**ADR:** `0112` (the badge is free). A new ADR is needed for 53c (§3).
**Depends on:** task 50 for path A's last step; `@arp-protocol/cli` on npm for path B's first.
**Rules:** `ui.md`, `code.md`, `security.md` (53c), `claims.md`, `workflow.md`.
**Reviewers:** `ui-reviewer`, `contract-reviewer` is not needed (no contract), `intuition-integrator`
for 53c, then `task-verifier`.

---

## 1. Why

Scene 4 of `/` offers four jobs, and three of them say "Needs wallet" (`apps/web/src/pages/Landing.tsx`,
`jobsFor`). The person task 52 measured the gain for — a Claude user, 40 of 42 answers naming a
skill that exists against 6 of 42 without (`docs/tasks/52` §3) — is not offered a way in. Task 45's
promise is that nothing web3 is visible to that person.

The proposal the user answered is the artifact "Parcours d'entrée ARP"
(https://claude.ai/artifact/K6hM825k648X3BshkshjvP), with references from Mobbin and from the
onboarding skill ARP itself returned for "onboarding" (`coreyhaines31/marketingskills?skill=onboarding`).

## 2. The user's decisions (2026-11-02)

| Question | Decision |
| --- | --- |
| How many profiles | **Three at launch**: "J'utilise Claude", "Je construis un agent", "J'ai publié un outil". Agent operators and teams or registries come when they have something to offer |
| Scene 4 | **Replaced**, not added to. The deck keeps six scenes, and the four "Needs wallet" cards leave `/` |
| Listing a tool from path C | **Sponsored on testnet 13579, with a limit**, consistent with "free for testers" (task 45) |
| The badge | **Not decided.** Left out of this task |
| Onboarding, like Privy's | **The action is gated, not the read** (2026-11-02, « ok ça me paraît bien »). Index pages stay open; declaring, supporting, adding a tool and the personal pages open the onboarding first |
| How a visitor connects | **Their agent**, not an account: the extension's local key (ADR `0110`), seen by the activity bar on the web. MetaMask for whoever signs. No Privy for now. ADR `0114` |

## 3. The pieces

| | What | Exists today |
| --- | --- | --- |
| 53a | Scene 4 becomes one question, "What brings you here?", with three tiles: a title and what to have at hand, nothing else (`ui.md`, no sentence in a card). Saffron on the first tile only. The choice is kept in `localStorage`, wrapped in try/catch, so the nav can offer the path again | `SceneJobs` and `jobsFor`, to be replaced |
| 53b | `/start/:profile`, one page per path: an ordered list whose steps tick themselves when ARP sees the result, the first one ticked from the start ("testnet, nothing to pay"). No account | the activity bar's "your agent: live / connecting / not connected" (task 36, task 48 item 8); `/activity`; `/search` |
| 53c | Path C's "add it" step, sponsored: a sponsor route that creates a tool atom for a URL, within a per-address daily limit and the global budget | **no route**: `apps/sponsor/src/service.ts` serves `/gas`, `/mint-gas`, `/identity`, `/deposit`, `/publish`. Needs its own ADR, because `security.md`'s sponsor rows do not cover it |

The three paths, as the proposal has them:

- **A · J'utilise Claude.** Choose Desktop or Code; install the extension or the plugin; copy an
  example prompt from a need the catalogue covers; the page sees "your agent: live"; the first
  declaration shows in `/activity`, sponsored. No wallet, TRUST or chain word on the page.
- **B · Je construis un agent.** Copy `npx @arp-protocol/cli init`; run the agent; the page waits for
  the first recorded call; run `arp status`.
- **C · J'ai publié un outil.** Paste the repository URL in one field; land on the skill or repo page;
  not listed: add it, sponsored (53c).

### 53d — ARP's own skill in ARP's registry, done 2026-11-02

The user asked for it the same day (« ARP skill sur ARP ? bonne idée », « le skill pour agent »,
« dans son dépôt avec sa description refaite au propre »). On testnet 13579: the skill atom
`github.com/Wieedze/ARP?skill=arp`, the repository atom `github.com/Wieedze/ARP`, `source` between
them and `has tag development`, 0.008163237806 tTRUST, both documents pinned. The record is
`data/catalogue/own-skill-13579.json`; the plan is `scripts/seed/seed-own-skill.ts`, which prints
0 calls when re-run. `skills/arp/SKILL.md`'s description now leads with finding a tool for a need;
`build-skill-facts.ts` reads it as a first-party source, so a rewrite is a rebuild away.
`arp_find_tools` with `query: "arp"` returned both atoms the same evening, with `purpose: null`
until the rebuilt `skill-facts.json` is merged. The README badge is the next step and is not built.

## 4. Facts checked on 2026-11-02

- `curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/@arp-protocol%2fcli` → `404`.
  Path B's first step cannot be published on a public page until the package is.
- Path A's last step is task 50, which arp-7f reported working once on testnet; not merged as a
  finished task at the time of writing.

## 5. Do not do in this task

- The badge, its domain and its image service.
- The two profiles left for later (agent operator, team or registry), and any pricing page.
- Touch `ClaimField`, the Sigils, `SourceField` or `RingLoader`.
- Copy `SceneDeck`'s gesture handling to `/start` (`ui.md`: only the pinned deck owns the wheel).

## 6. Evidence ladder

It serves the **staked** tier indirectly: a Claude user who arrives through path A ends with a
sponsored declaration, which is a stake by an agent ARP does not control. It moves ARP up only if
those agents are third parties, which is the plan's gate and is not measured here.
