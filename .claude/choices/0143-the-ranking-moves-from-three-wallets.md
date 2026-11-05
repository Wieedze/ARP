# 0143 — The ranking moves from three wallets, and a line below that is only shown

**Status:** Accepted
**Date:** 2026-11-05
**Amends:** ADR `0137` (how the score reads declarations), ADR `0138`
**Triggered by:** `docs/tasks/70` item 3. The user chose design 1 of three, relayed by `arp-f3`

## Context

With `pulse-score-2`, one wallet saying `worked` took a skill in the middle of a list from 0.50 to 0.75, and one saying `failed` took the first result from 0.80 to 0.40. One false line moved every choice.

## Decision

**Below `WALLETS_TO_MOVE` different wallets saying the same thing, 3, a line adds nothing to the score and is only shown.** The count is per outcome, of wallets whose line concerns this search, so a `worked` and a `failed` do not add up. The constant is in one place, `packages/protocol/src/pulse-score.ts`. The score is `pulse-score-3`.

**Added by the user the same day, relayed by `arp-f3`:** a skill the search did not return enters the list only from the same threshold. And a line below it is shown with what it is worth: `unconfirmed`, naming how many wallets said what, not confirmed, to check in the skill's file. No further measurement of that wording, by the user's decision.

## Alternatives considered

- **A brake**, the search's position weighing as 3 wallets: every line moves less and any line still moves.
- **The reader's own list of wallets**: empty at the start, and ARP becomes the referee if it supplies it.

## Consequences

**Positive:** one false line no longer moves the ranking of what the search returned.

**One line no longer adds a skill to the list.** A skill entering from 3 wallets can say `failed` as well as `worked`, and enters at the floor.

**Negative:**
- **The first real lines do not move it either.** On 13579 no skill has 3 wallets saying the same thing, so no real line moves any ranking today, and a skill the search placed low stays low: task 64's one separation came from a line reaching the agent through the order, and that path now needs 3 wallets.
- **In simulation the threshold costs more than it saves**, in the worlds written so far (`docs/tasks/71` §3): 1.3 to 4.6 points without false wallets, and with false wallets a gain with an interval above zero in two cells of nine. Invented worlds, exploratory.
- **It holds the score, not the reading.** A line is still shown. In `docs/tasks/71` §4 a favourite went from 8/15 to 1/15 after one false `failed` line was shown, with the search's order also shifting and a third arm at 5/15 with no line about it. So whether one false line still moves choices is open.
- **Three wallets are cheap.** A line held on deposits costs about 50 times less than one written (ADR `0138`). This raises the price of a lie by a factor of 3. It does not stop a person with several wallets.

## References

- Task: `docs/tasks/71-a-false-line.md`, `docs/tasks/70` item 3
