# 32 — The sponsoring service: a proven deposit, paid by ARP, owned by the agent

**Task:** `docs/tasks/40-the-sponsoring-service.md` (built with `docs/tasks/37` 37b, 37c)
**Completed:** 2026-10-30
**Commit:** `c8d5d41` on `feat/40-sponsoring-service` (this post-mortem lands on top of it)
**Verifier verdict:** PASS (second pass)

Written as 31; renumbered 32 when `origin/dev` was merged, because dev had landed
`31-the-receipt-enforcer.md` the same day. Both `INDEX.md` files were regenerated on the merge.

## What shipped

- `apps/sponsor/` — the service. `GET /` prints the limits, `POST /gas` sends approve gas once per
  agent, `POST /deposit` sends `deposit(receiver = agent, …)` after the proof gate, and `POST /publish`
  (task 37) is built but answers 503 from `main.ts`. Testnet 13579 only, the key comes from a 0600
  file, bound to 127.0.0.1, and the ledger is a JSONL file reserved before each send.
- `packages/protocol/src/sponsor/` — `plan.ts` (sponsored deposit), `approval.ts` (`approve(sponsor, 1)`),
  `proof.ts` (hire and content proof check), `limits.ts` (ADR `0092` limits, withdrawal bps),
  `request.ts` (the agent's signed request).
- `packages/protocol/src/delegation/register.ts` — task 37's publication plan.
- `packages/protocol/src/declare/resolve-subject.ts` — `resolveIdentityAtomStrict`, which returns found, none or ambiguous.
- `packages/protocol/src/receipt.ts` — `corroborationOf` compares against `receiver` (40c).
- `scripts/measure/multivault-sponsor-abi.ts` + `data/measurements/multivault-sponsor-abi-2026-10-30.json`:
  a read-only check of the deployed ABI (40a).
- ADR `0096`, a strike-through correction in ADR `0094`, and `security.md` signature sites 5 → 6.

## Surprises

- The content-receipt path cannot hold both halves of ADR `0094` §2 until a fetch has a price, so
  the service verifies a content receipt and then refuses it. The only sponsored path today is a hire.
- A hire payment is a transfer, not a burn. The "costs more than it earns" rule holds only between two
  operators. ADR `0094` was corrected in place.
- A first pass failed on an `agentWallet` self-hire, where `callee !== receiver` holds and the
  agent is still one agent, and on an unordered `same as` read that let a third party choose the
  edge a deposit pays for.

## Decisions made

- **A proof unlocks a sponsorship only when it has a price**: content is refused until task 41. ADR `0096`.
- **The ledger is written before the send**: a pending row counts as spent. ADR `0096` item 2.
- **The approval is `DEPOSIT`, never `BOTH`**: the sponsor can never redeem. ADR `0096` item 3.
- **The deposit goes on the proof's edge only**, with a strict identity read and the canonical `uses`. ADR `0096` item 5.
- **Self-hire is refused** by identity and by atom. ADR `0096` item 6.

## Rules touched

- `security.md`: amended, signature sites 5 → 6, recorded in ADR `0096`.
- `claims.md`: check 4 held. The verifier re-ran the gates outside the builder's claimed scope
  (`apps/web` `tsc -b`, `apps/mcp` lint+test, `apps/node` lint, `check:scripts`), and all were green. Check 5
  held in part: two "not built" sites were updated, and `docs/12_THE_IDEA.md:82` still reads
  "designed, ADR `0094` — not built".
- `portability.md`: sufficient. Every chain value is read at call time, and the chain is asserted at start.

## Suggestions for future tasks

- Update `docs/12_THE_IDEA.md:82` after merge to "built for hire proofs, not running; content refused until 41".
- Add a one-line guard so `/deposit` and `/gas` refuse an agent whose holder is the sponsor's own
  address. This is latent, not live: only ARP's treasury key can sign such a request. It matters if
  ARP ever mints testnet agents with that key (ADR `0047`).
- When a protocol type widens (`PreparedCall.kind` gained `approve`), run every consumer's gate, not
  only the new app's.

## Amended after the merge with dev (2026-10-30)

- The user decided testnet sponsors everything (ADR `0094` status line). The cost-of-proof rule is
  now `SponsorLimits.belowProofCost`, `false` on testnet; the withdrawal threshold stays unset. A
  content receipt is still refused until task 41. ADR `0096` status line and items 7, 8.
- `/gas` and `/deposit` refuse an agent held by the sponsor wallet itself (task 40 §3).
- `security.md`'s signature sites are seven after the merge: this branch's sponsor request and
  dev's `ReceiptEnforcer` (ADR `0098`).
