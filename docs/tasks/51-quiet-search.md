# Task 51 — A quieter search: every word must match, and nothing invites a second call

**Status:** **BUILT**, 2026-11-02, branch `feat/51-quiet-search`. ADR `0111`.
**Rules:** `code.md`, `claims.md`, `workflow.md`.
**Reviewers:** `task-verifier`.

---

## 1. Why

Task 45c measured the cost of consulting ARP (`data/measurements/discovery-eval-2026-11-02.jsonl`).
It found that the registry often answers with tools that do not fit. "card payments" returned ten
tools that only said "card" (orbit cards, marketplace cards). The agent read them, said there was
nothing relevant, and answered from memory anyway. The user agreed to this fix and a re-measure on
2026-11-02 (« oui »).

## 2. What shipped

- **Every word of a query must match** (`apps/mcp/src/tool-search.ts`, `relevance`), at the start of
  a word or by its root, as before. A small list of filler words ("my", "tool", "for", "how") is
  ignored, because they say nothing about a need.
- **A query that finds nothing no longer carries `domains_available`**
  (`apps/mcp/src/handlers/find-tools.ts`). The list invited a second call that had nothing to find.
  A `domain` that finds nothing still carries it.
- **The tool description** asks for one or two words, says that a result must hold every word, and
  says that an empty result means the agent should answer from what it knows rather than search
  again (`apps/mcp/src/tools.ts`).
- **The eval records what each call asked** (`toolInputs` in `scripts/measure/discovery-eval.ts`).

Probe, built server, testnet 13579, 2026-11-02, one-off: `{query: "card payments"}` went from 4,071
bytes and 10 results to 97 bytes and 0 results.

## 3. Measured

The same script and prompts, run from the working tree on top of `f6fa9b7`; the code was committed
unchanged with this file. The output is
`data/measurements/discovery-eval-2026-11-02T2015.jsonl` and the agent runs cost $2.47; the judge
calls are not costed. Re-derive the figures with `--summarise` on either file.

| prompts that need a tool | 45c, before | 51, after |
| --- | --- | --- |
| consulted, runs | 39 of 42 | 39 of 42 |
| tokens ratio arp / none | 3.14, 95% 2.62 to 3.80 | 2.90, 95% 2.35 to 3.65 |
| cost ratio arp / none | 1.84, 95% 1.57 to 2.15 | 1.46, 95% 1.30 to 1.63 |
| turns per run, arp | 2.7 | 2.9 |
| judged better, arp / none | 5 / 37 | 7 / 35 |

The intervals overlap on both ratios, so this run does not establish that the change saved
anything. A saving is still not claimable, and the answers are still judged worse.

**Why it barely moved.** Each turn re-sends the whole conversation, so the cost of a consultation
is mostly turns, not the size of a result. The agent still makes 2.9 turns against 1 for answering
from memory, because:
- it retries with other words or with a `domain` (uptime: `uptime monitoring`, then the `monitoring`,
  `observability` and `website` domains, 4 calls in each rep);
- a `domain` search is unchanged and still answers with whatever is filed under it (Stripe: the
  agent asked `domain: payment` in all 3 reps).

## 4. Known limits

- Requiring every word misses a tool described with a synonym ("transcription" is found, "podcast
  transcription" is not). Search by meaning is in `FUTURE.md`.

## 5. Do not do in this task

- Change the domain search or the short row.
- Add a hosted search (`FUTURE.md`, decided 2026-11-02).

## 6. Evidence ladder

Tier 3 (staked): it changes how agents reach the registry where declarations are staked. It does not
move ARP up the ladder.
