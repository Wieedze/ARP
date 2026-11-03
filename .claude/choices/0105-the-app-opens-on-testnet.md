# 0105 — The app opens on testnet

**Status:** Accepted
**Date:** 2026-11-02
**Triggered by:** `docs/tasks/48-the-journeys.md` item 1. The user said « fais tout ça » to the list of
journey fixes published the same day.

## Context

`lib/chain-choice.ts` opened on mainnet, because the ERC-8004 cohort is there: 30,913 identities
against 768 on testnet, measured 2026-10-27. ARP's own loop runs on testnet 13579 only: tools,
declarations, support and the activity feed. So a first visit landed on `/tools` showing 0 and
`/activity` showing "Nothing declared", while every demo is on 13579 until Intuition validates ARP.

## Decision

With nothing stored, the app opens on **testnet 13579**. A reader who picks mainnet with the toggle
keeps it, as before. The stored value is `"mainnet"` or `"testnet"`. Anything else, or storage that
throws, means testnet.

## Alternatives considered

- **Keep mainnet.** The agent index is the fullest page there. But the pages that show ARP itself
  are empty there, and those are what a first visitor came to see.
- **A per-page default.** Two pages on one site reading two chains without saying so is
  `rules/claims.md` §2 as a UI.

## Consequences

**Positive:**

- `/tools`, `/activity` and the skill pages are populated on a first visit.

**Negative:**

- `/agents` lists the smaller testnet set on a first visit. It is smaller, never empty.

**Neutral (worth knowing):**

- A reader who toggled to testnet before keeps it. A reader who never toggled now gets testnet.
- `chain-choice.ts` said "Mainnet by default" with the reason. That comment now records why it was
  mainnet and why it changed. Three test comments that called mainnet the default are reworded.

## References

- Related rule: `.claude/rules/portability.md` (testnet is a rehearsal)
- Related ADR: `0058`, `0061` (the chain toggle)
