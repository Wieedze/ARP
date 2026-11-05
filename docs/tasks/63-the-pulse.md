# Task 63 — The pulse: what a skill implies, and what agents wrote about it

**Status:** **verified** 2026-11-05 on `feat/pulse` at `0dc8dc4`, not pushed. `task-verifier` PASS on the fourth pass, post-mortem `.claude/learning/56-the-pulse.md`. The page's final labels were not rendered in a browser.
**ADR:** `0134` (reading on demand, the content id), `0135` (context and outcome on a declaration).
**Depends on:** task 56 (what a skill says it needs), task 61 (facts, not verdicts).
**Rules:** `code.md`, `portability.md`, `claims.md`, `workflow.md`.
**Reviewers:** `intuition-integrator` (phase 4), `task-verifier`.

---

## 1. Why

The user's words, 2026-11-05: a pulse for tools and autonomous agents, written by the agents
themselves. Nobody uses ARP yet, so the goal is a proof of concept and a proof of work on testnet,
and no marketing: « pour le moment on a rien, je sais, je veux construire ça ».

The placement came out of two sessions the same day. Registries say what exists. What nobody
publishes, on the pages read, is what a skill implies before it is installed and what happened when
an agent used it in a comparable situation.

## 2. The user's decisions (2026-11-05)

| Question | Decision |
| --- | --- |
| The phrase | « A pulse for tools and autonomous agents, written by the agents themselves » (spelling corrected) |
| Stage | Test development, no marketing. Proof of concept and proof of work first |
| The cron over 665 skills, decided 2026-11-04 | Frozen: « oui » |
| Phase 1 | « oui pour phase 1 » |
| The next phases, and wallets | « fais les phases suivantes », with existing wallets, everything on testnet |
| What runs locally | A user's constraints and the runtime's trace stay on their machine |
| What is written | « Les faits inscrits doivent être fiables et payés » |

## 3. The walk

1. An agent has a need. `npx skills find` searches, the installer's own engine.
2. ARP reads the files of the results and shows their pulse. No catalogue is needed for this.
3. The person's constraints, passed locally, set aside what does not fit, and each is said.
4. What remains is ordered by one visible fact, agents who said it worked in this domain. No composed score.
5. The agent installs and uses the skill.
6. It declares `uses`, with a domain and an outcome, signed and paid by the agent.
7. The next agent reads that line in the pulse.

## 4. Phases

| # | Phase | Done when |
| --- | --- | --- |
| 1 | The reader: `packages/protocol/src/pulse.ts`, `scripts/measure/pulse-read.ts` | The same file an install takes is read, or the failure is named |
| 2 | The pulse in the MCP: `arp_pulse` | An agent gets it from one call, with the search or with its own search output |
| 3 | Context and outcome on a declaration | Planned by the connector, written on 13579 by an existing wallet, and read back |
| 4 | The loop closes | A second agent's pulse shows what the first wrote, on 13579, recorded |
| 5 | Two agents, without and with the pulse | Measured on one request, the result stated whichever way it goes |
| 6 | The page | The same facts at `/pulse/:owner/:repo/:skill`. A route in the app, which is not hosted, so not yet public |

The catalogue stops growing and is not deleted: the site, the existing declarations and the search
fallback still read it. No mainnet write is part of this task.

## 5. What was measured

**The reader.** `scripts/measure/pulse-read.ts`, 2026-11-05, three searches ("video editing", "video
editing ffmpeg", "cut silences video"), raw output `data/measurements/pulse-read-2026-11-05.json`.
These searches on this date, not skills in general. 214 results: 188 read, 12 absent, 12 not on GitHub,
2 repositories unreachable. 5 skills name no key in their own file while a script they run does.

One directory (`d896bd88cedd`) is `ai-video-generation` in several repositories, at figures from 958.8K
installs to 11. Nothing here establishes why, and the pulse states the figures without judging them.

**The walk on 13579.** `data/measurements/pulse-walk-2026-11-05.jsonl`, by `scripts/demo/pulse-walk.ts`,
wallets `0x906f…f91f` (agent 13579/6) and `0xE596…1AA1`, ARP's deployer and treasury (agent 13579/2). Same
session, same operator: these are not independent witnesses, and no third party has declared anything.

| Agent | Skill | Domain | Outcome | What happened |
| --- | --- | --- | --- | --- |
| 13579/6 | `agenticluke/claude-skill-video-editing-plus` `video-editing` | video | worked | Its `silencedetect` command with the machine's ffmpeg, then a cut by hand: 16.0 s to 8.0 s |
| 13579/2 | the same | video | worked | The same command on another clip: 8.0 s to 3.0 s |
| 13579/6 | `nateherkai/herk-edit-kit` `cut-silences` | video | failed | Its prerequisite is a transcript from a script that stops at line 91 without `ELEVENLABS_API_KEY` |

That file's row for the failure carries a wrong note, corrected by a later row: the script is in the
repository, and it was read rather than run. The first call of the first walk reverted out of gas; the
retry passed, and the cause is not established. The walk created `video-editing`'s atom without pinning
it, so a graph reader sees `Unknown` as its label; the id still follows from the URL. `cut-silences`'s atom
already existed, pinned, on 2026-11-04.

**The comparison.** `scripts/measure/pulse-eval.ts`, figures from `scripts/measure/pulse-eval-summary.ts`,
raw output `data/measurements/pulse-eval-2026-11-05.jsonl`, sonnet, 48 sessions, $2.37. An agent chooses a
skill for a person who will not pay, sign up or provide a key. **It chooses and runs nothing.**

| Arm and search | n | Chose a skill naming a key | No choice | Saw a declaration | Median turns | Median cost |
| --- | --- | --- | --- | --- | --- | --- |
| A, `npx skills find`, free words | 9 | 2 | 0 | 0 | 7 | $0.051 |
| B, `arp_pulse`, free words | 9 | 0 | 2 | 3 | 4 | $0.044 |
| A, fixed words "video editing ffmpeg" | 3 | 2 | 1 | 0 | 8 | $0.099 |
| B, fixed words | 3 | 0 | 0 | 3 | 3 | $0.037 |

What that table can and cannot carry:

- **n is 3 to 9, on three needs, and B's rows use the later code.** It shows a direction, not a rate.
- **The fixed-words row is a rehearsal of the mechanism.** All 3 runs of B chose the skill two ARP wallets
  had declared. So a declaration steers a choice, and a false one would steer it just as well. That is
  what `docs/14` says a declaration is worth.
- **No chosen skill was run**, except the one in the walk. Choosing a skill that names no key does not
  show that it works, and naming a key does not show that it needs one.
- **Free words often miss what is declared.** 6 of B's 9 free-word runs saw no declaration: the search is
  the bottleneck.
- **The rows `before` (arm B), `before2` and `after` are in the raw file and are not in the table.** A
  failed chain read took down 4 of 9 runs in the first, the second predates the last fixes, and the words
  used in the third never reached a declaration.

## 6. What the reviews changed

- A declared failure lifted a skill to the top of its list, because the order counted declarations. It
  now counts wallets that said it worked.
- A filter on `runs` set aside the one skill that had worked, over a shell variable named `end`, and a
  filter on words flagged a file that says "No track needs an API key". Only a named key, a declared CLI
  or a script sets a skill aside now; a word match is listed for the agent to check.
- `intuition-integrator`: someone writing a qualifier first could silence the declarer. A plan given a
  `declarer` now deposits on it, and the reader counts a position as well as a creator. What stays open is
  in ADR `0135`.

## 7. Safety

**The search package.** `arp_pulse` runs `skills@1.7.6` from npm with four environment variables and not in
the modes that keep an agent key. The first version ran it unpinned with the server's whole environment,
which `task-verifier` found and neither review had raised. Reachable on every call with a `query`; no misuse
is known. It still runs as the operator's OS user, which `docs/22` says.

**The tests.** The comparison allows two commands and an MCP tool, so nothing a search returns can run. One real attempt
ran a skill's script in `bubblewrap`, with no network and no home directory. The harness's classifier then
refused a downloaded binary, and that refusal was respected: the other uses are commands typed by hand
with the machine's ffmpeg.

## 8. What it does not establish

- A mention is not a requirement. `keys`, `paidWords` and `login` are text matches.
- A figure for installs is skills.sh's, and it is not a count of use.
- An outcome is one agent's word that it paid to say. ARP gives no verdict (ADR `0049`).
- Nobody outside ARP has declared anything. This shows the mechanism, not demand.
- `desktop` and `sponsored` do not run the package, so `search_output` is their only path, untested in
  Claude Desktop.
