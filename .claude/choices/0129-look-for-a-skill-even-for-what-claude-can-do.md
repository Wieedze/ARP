# 0129 — Look for a skill even for what Claude can do itself

**Status:** Accepted
**Date:** 2026-11-03
**Triggered by:** `docs/tasks/54`, its first smoke run; the user's choice the same day (« 1 »)

## Context

The claim task 54 has to test is that a user who searches nothing gets a skill found for them:
_« c'est le combiné découverte sans recherche préalable qui compte »_. The instructions ARP sends
at `initialize` said `LOOK HERE FIRST` for a task that needs a tool "you do not already have".

Smoke run, testnet 13579, 2026-11-03, one request (turn notes into `deck.pptx`), `claude -p`,
Sonnet, ARP in sponsored mode with `arp_find_tools` and `arp_get_skill` allowed: Claude built the
deck from memory and never called ARP
(`data/measurements/result-eval-smoke-2026-11-03T1328-before.jsonl`, arm B, `arp.queries: []`). It
could build a deck, so it had nothing to look for. Measured on a "do it" request, the facilitator
does not happen. Task 52 asked "what can do it" instead, and there ARP was consulted.

## Decision

In the modes that can fetch a skill (`ARP_TOOLS=desktop` and `sponsored`), the instructions now add
a paragraph: before making something for the person (a document, a deck, a spreadsheet, a PDF, a web
page, an image, a video, a data job), call `arp_find_tools` even when Claude could do it itself, and
follow a skill that fits and whose `requires` asks for nothing the person lacks. Read mode is
unchanged: it has no `arp_get_skill`.

Re-run of the same smoke, 2026-11-03
(`data/measurements/result-eval-smoke-2026-11-03T1345-after.jsonl`): arm B called
`arp_find_tools` with `pptx`, fetched `anthropics/skills` pptx with its whole directory, and used
its validator. One run each, so this says the paragraph can work, not how often.

## Alternatives considered

- **Leave the instructions alone and measure** — rejected by the user: arm B would have measured
  Claude alone, and the full run would have cost money to show that.
- **Say it in the tool description of `arp_find_tools`** — weaker: a description is read when the
  tool is chosen, and the failure was that it was never chosen.
- **A list of every kind of deliverable** — not possible, and the list in the paragraph is examples.

## Consequences

**Positive:**

- The mechanism the product claims is the one the measurement now tests.

**Negative:**

- One `arp_find_tools` call before a deliverable, on every such request: tokens and a few seconds,
  even when nothing fits. Smoke cost, arm B: $0.106 before, $0.171 after, n = 1 each.
- An agent told to prefer a skill can prefer a worse one. Task 54's judge is what would show it.

**Neutral (worth knowing):**

- It changes the Desktop extension's behaviour too: same instructions.
