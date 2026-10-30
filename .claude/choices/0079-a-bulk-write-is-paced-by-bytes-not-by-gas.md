# 0079 — A bulk write to Intuition is paced by bytes, not by gas

**Status:** Accepted
**Date:** 2026-10-29
**Triggered by:** the 662-skill seed, which was refused three times before it landed

## Context

Every write this repository had made before 2026-10-29 was tens of calls carrying a few hundred
bytes. Seeding 662 skills is 1,979 terms, and the obvious shapes all failed:

| attempt | result |
| --- | --- |
| one call per term, 1,324 calls | 1,324 signatures and 1,324 gas floors to say one thing |
| batches of 20 (3,973 bytes, 5,154,033 gas) | 4 landed, the 5th refused |
| batches of 8 with a 1.5 s gap | 31 landed, then refused |
| resuming at 4 s per call | **0** landed — the quota had not refilled |

The refusal is `Bandwidth limit exceeded`, JSON-RPC code `-31002`, from
`eth_sendRawTransaction`. `eth_estimateGas` over the same calldata passed, and the block gas limit
is many orders of magnitude above 5.1M, so it is neither gas nor call size.

Two things make it worse than an ordinary rate limit:

- **It caps reads too.** Once spent, `eth_getBalance` and `eth_call` are refused as well, so a
  throttled session cannot even re-derive the plan it was sending.
- **`https://intuition-testnet.rpc.caldera.xyz/http` is the same backend** behind the published
  hostname, and is refused identically. The user has no endpoint without a ceiling.

Waiting for a receipt is not pacing: the receipt returns fast and the next 4 KB leaves immediately.

## Decision

Bulk writes are planned so they can be **stopped and resumed exactly**, and sent in waves that wait
the quota out.

1. **Batch** — `encodeCreateAtoms` / `encodeCreateTriples` take a list. Eight per call keeps a
   transaction near 1.6 KB.
2. **Filter before encoding** — a batch is atomic, so one member that already exists reverts all of
   it with `MultiVault_AtomExists`.
3. **Resume by count** — a plan's calls are deterministic and ordered, so `--from <n>` skips what
   landed. `scripts/deploy/send-plan-in-waves.sh` counts successes, sleeps, and resumes until the plan is
   exhausted, stopping loudly on any failure that is not the quota.
4. **Pace the reads too** — `Promise.all` over 662 rows is 662 requests leaving at once. Six at a
   time with a 120 ms gap.

## Alternatives considered

- **A bigger batch** — the direction that caused this. 20 per call is 4 KB and spends the quota
  four times faster.
- **A longer pause per call** — measured and refuted: 4 s per call landed nothing, because the
  window is long and the budget was already gone.
- **Another RPC** — Caldera's own hostname is the same backend, and the user has no endpoint
  without a ceiling. A paid endpoint would change this and nothing here forbids one.
- **Give up on the deposit** — creating terms at `cost` alone halves the value but not the bytes,
  and a term with no position is not in ARP's index at all (ADR `0053`).

## Consequences

**Positive:**

- 1,324 calls became 156, and the seed survived three refusals without losing a term or paying
  twice.
- `pauseMs` defaults to 0, so every plan written before this is unaffected.
- The resume path is exercised rather than theoretical: it ran four times on the day it was
  written.

**Negative:**

- A bulk seed is now an hours-long background job, not a command. It needs a detached process and
  somebody to read its log.
- The wave script counts successes by grepping the sender's own output, which couples it to that
  format.
- Batching hides which member of a batch failed. The plan's `why` names the first and last.

**Neutral (worth knowing):**

- The window length is not published and was not measured — only that it is longer than four
  minutes and shorter than an afternoon. A figure here would be a guess, so there is none.

## References

- Related rule: `.claude/rules/portability.md` — costs are read from the chain, not from a copy
- Related ADR: `.claude/choices/0038-*` — the connector plans, the runtime signs
- Scripts: `scripts/deploy/send-plan-in-waves.sh`, `scripts/send-plan.ts`, `scripts/seed/seed-skills.ts`
