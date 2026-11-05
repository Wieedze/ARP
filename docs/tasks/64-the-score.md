# Task 64 — The score: a search that starts on what exists and moves to what agents did

**Status:** in progress, 2026-11-05, on `feat/pulse`. A trial, by the user's « oui vazy essaye ».
**ADR:** `0136` (the product is the search), `0137` (ARP will compute a score).
**Depends on:** task 63.
**Rules:** `code.md`, `claims.md`, `workflow.md`.

---

## 1. The score

`packages/protocol/src/pulse-score.ts`. Public, recomputable, never on chain. `arp_pulse` shows its parts on each result.

```
score = (prior + worked) / (1 + worked + failed)
```

`worked` and `failed` count distinct wallets in the domain and its sub-domains. `prior` runs from 0.8 for the search's first
result to 0.2 for its last, and 0.2 for a skill it did not return.

With this, a skill declared `worked` in a domain is added to the results even when the search did not return it, and the
domain is read from the need's words when the agent names none.

The constants are a first guess. Nothing has tuned them.

## 2. The comparison, written before it ran

`scripts/measure/pulse-eval.ts --round score`, `scripts/measure/pulse-eval/judge.ts`,
`scripts/measure/pulse-eval/summary2.ts`, raw output `data/measurements/pulse-eval3-2026-11-05.jsonl`.

| Arm | The agent has | Domain | Needs |
| --- | --- | --- | --- |
| C | `arp_pulse` with the earlier order, on the real graph | given in the prompt | all four |
| S | `arp_pulse` with the score, on the real graph | left to the tool | all four |
| F | as S, with `fake-graph.ts`'s three invented wallets on an off-task skill | left to the tool | `silences-fixed` only |

Five runs per arm and need, `sonnet`, capped at $5. Nothing is installed or run. The invented lines exist only on localhost.

**Questions.**

1. With free words, does a declared skill reach the agent now? Read as runs that saw a declaration, and runs that chose
   `agenticluke`'s skill, on `silences`.
2. Does the score cost good choices where nothing is declared? Read on `voiceover` and `markdown`.
3. Does a false line steer it? Read on `silences-fixed`, F against S.

**How it will be read, decided now.** The rules of `docs/tasks/63` §9 hold: Wilson 95% intervals, different only if they do not
overlap, overlap reported as not established, needs not pooled, no choice counted apart, a good choice needs both blind readings.
In addition:

- The only `worked` lines in `video` come from ARP's wallets, on a skill chosen by reading its file. Question 1 shows that a line can
  reach an agent, not that lines are right.
- **This does not test learning.** Two wallets and one skill are not a system improving over runs, and nothing here can show one.
- A better choice rate would not validate the constants, because they were not tested against any alternative.
