# 0058 — The network banners come off; the warning lives at the signature

**Status:** Accepted
**Date:** 2026-10-27
**Triggered by:** user instruction — _« enleve tout les avertissement comme celui ci : Intuition
mainnet · chain 1155 · real TRUST »_, then three more lines named individually.

## Context

Two banners said which network a page touched. `MainnetNotice` sat at the top of seven pages as a
paper-on-ground inverted bar; `Layout`'s testnet strip said the opposite on every other route, with
a faucet link. Measured against the finished design on 2026-10-22, the mainnet bar was the
**lightest element on every page it appeared on** — louder than the accent, which ADR `0057` spends
only on the primary action.

The design session had already removed it: ADR `0057` §2 records _"the inverted monochrome 'real
TRUST' bar is dropped from the stake flow at the user's request; this reopens ADR `0017` safeguard 4
and ADR `0029`'s 'the mainnet warning moves to the confirmation', which need a decision of their
own."_ `HANDOFF.md` step 0 then said: **do not delete it in code, ask first.** This ADR is that
decision, taken by the user.

## Decision

**Both banners are removed. The warning stays where a wallet is about to open.**

`StakeControl`'s confirmation step reads _"Real TRUST, Intuition mainnet, not recoverable by this
panel."_ and `WithdrawControl`'s reads _"Real TRUST, Intuition mainnet."_ Both are inside the
confirmation, after the amount is chosen and before anything is signed. That is **exactly what ADR
`0029` prescribed** — "the mainnet warning moves to the confirmation" — so this completes a move
that was half-done rather than reversing a safeguard.

**ADR `0017`'s seven safeguards are untouched in code.** Safeguard 4 is the confirmation step, not
the banner, and it is intact. Safeguards 3 and 7 — the ceiling and the `minShares` floor — still
bind; what went with this change is the **sentence announcing** them in the form's help text, which
the user also named. A refusal still prints the number that refused.

Four further lines removed by name in the same instruction:

| removed | where |
| --- | --- |
| "It stays yours — a position you can redeem, not a payment to the agent." | `AgentBacking`'s stake blurb |
| "Nobody has staked on this claim, so there is no distribution to read." | `TermShapePanel`'s empty state, now renders nothing |
| "Minimum 0.01 (the MultiVault's own minDeposit), ceiling 1 per transaction." | `StakeControl`'s amount help text |
| "Running on Intuition Testnet — no real value at stake." + faucet link | `Layout`'s shell strip |

The first of those is **ADR `0056` §4's own UI constraint** — _"the UI states it has no other
side"_. It is dropped on the user's instruction. The substantive half of that constraint survives
where it is load-bearing: the confirmation for an atom target still reads _"Nothing here can
contradict it, and the deposit stays yours — it is a position you can redeem, not a payment"_, which
is the screen `0056` was protecting.

## Alternatives considered

- **Keep the mainnet bar, restyle it quieter** — not offered. The user named the exact string and
  said remove it; a dimmer version of a sentence he removed is not what was asked.
- **Keep the testnet strip only** — rejected as the worse half. "No real value at stake" is the
  sentence that can be false in the expensive direction; the mainnet one could only ever be
  redundant with the confirmation.
- **Delete `lib/mainnet-routes.ts` with its test** — rejected. The footer's network label still
  reads it, so it lives on as a hand-maintained list for a cosmetic job. Its test could not survive:
  it derived the answer from `MainnetNotice` in a page's source, and that component is gone.

## Consequences

**Positive:**

- The loudest element on seven pages is gone, so the accent is the brightest thing again, which is
  what ADR `0057` §2 reserves it for.
- Completes ADR `0029`'s move rather than leaving the warning in two places at two volumes.

**Negative:**

- **A reader browsing without transacting is no longer told which chain they are reading.** The
  footer's network label is the only remaining signal and it is dim. This is the cost, stated: the
  warning is now tied to the act rather than to the page.
- `lib/mainnet-routes.ts` is **hand-maintained again and nothing checks it**. That is tolerable for
  a footer label and is not tolerable for anything safety-bearing. Written in the file itself: if
  something safety-bearing reads it again, the check comes back with it.
- `AgentBacking` now presents its form with no sentence at all. The act is named by the heading
  ("Back this agent") and by the confirmation. If a reader ever mistakes the deposit for a payment,
  this is the change that allowed it.

**Neutral (worth knowing):**

- Four tests went with `mainnet-routes.test.ts`: 344 → 340. They tested a mechanism that no longer
  exists, not behaviour that stopped being checked.
- The agent panel's owner address and Intuition atom became links in the same change — the owner to
  its own chain's explorer (never Intuition's, which would be a live link to the wrong network), the
  atom to `portal.intuition.systems/explore/atom/{termId}`, probed rather than assumed.

## References

- Related ADR: `0017` (the seven safeguards — unchanged in code), `0029` (the warning moves to the
  confirmation — completed here), `0056` §4 (the backing constraint, whose UI half is dropped),
  `0057` §2 (which flagged this decision as needed)
- Related rule: `.claude/rules/ui.md`, `.claude/rules/security.md` (mainnet signing is unchanged)
- Code: `app/src/components/agent/StakeControl.tsx`, `WithdrawControl.tsx` (the surviving warning),
  `app/src/lib/mainnet-routes.ts` (what is left of the mechanism)
