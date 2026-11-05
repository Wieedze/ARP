# Task 63 — The pulse: what a skill implies, and what agents wrote about it

**Status:** in progress, 2026-11-05, on `feat/pulse`.
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
4. What remains is ordered by one visible fact, declarations in this domain. No composed score.
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
| 6 | The page | The same facts on one public URL per skill |

The catalogue stops growing and is not deleted: the site, the existing declarations and the search
fallback still read it. No mainnet write is part of this task.

## 5. What the first reading measured

`scripts/measure/pulse-read.ts`, 2026-11-05, on two searches ("video editing", "video editing
ffmpeg"), raw output `data/measurements/pulse-read-2026-11-05.json`. These searches on this date,
not skills in general. 180 results: 157 read, 12 not on GitHub, 9 absent, 2 repositories unreachable.

One directory (`d896bd88cedd`) is `ai-video-generation` in several repositories, at figures from
958.8K installs to 11. Nothing here establishes why, and the pulse states the figures without
judging them.

## 6. What it does not establish

- A mention is not a requirement. `keys`, `paidWords` and `login` are text matches.
- A figure for installs is skills.sh's, and it is not a count of use.
- An outcome is one agent's word that it paid to say. ARP gives no verdict (ADR `0049`).
