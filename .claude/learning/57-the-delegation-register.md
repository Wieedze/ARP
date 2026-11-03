# 57 — The delegation register, 37c turned on

**Task:** `docs/tasks/37-the-delegation-register.md` (sub-task 37c only)
**Completed:** 2026-11-03
**Commit:** `f7e33fb` (merged into `dev`); verified on `chore/close-37` at `a7cf492`
**Verifier verdict:** PASS

## What shipped

- `apps/sponsor/src/pin.ts` — `intuitionJsonPinner`, an arbitrary JSON document pinned through
  Intuition's `uploadJsonToIpfs`; answers `ipfs://<hash>`.
- `apps/sponsor/src/main.ts` — `publish` config set when `INTUITION_PIN_API_KEY` is set, `null`
  (503) otherwise; signature verified with `publicClient.verifyTypedData`; predicates read from the
  deployment record.
- `data/deployments/13579.json` — `arp.delegationRegister`: `delegateTo` `0xb56980d4…`,
  `inContextOf` `0x61a88b9c…`, `measuredAt` 2026-11-03, read from the graph, not minted.
- `apps/sponsor/src/routes/publish.ts` — unchanged since task 40: verify, registry check, limits,
  pin, plan, send, ledger.
- One publication on testnet 13579, five transactions; triple `0xbfd4b091…` re-read on the testnet
  indexer by the verifier, subject `caip10:eip155:13579:0x6673…F939`, object `…0x5c2b…2f75`,
  created 2026-11-03T12:51:16Z.

## Surprises

- The pinning question (§4.3) was settled by schema introspection: Intuition's pin API already
  exposes `uploadJsonToIpfs(json: jsonb)`, so Pinata was never needed.
- Both predicates already existed on 13579 as Things; nothing had to be minted.

## Decisions made

- **Intuition's pin API, not Pinata** — `uploadJsonToIpfs` takes `jsonb`, so key order is the
  database's; the planner builds the atom from the returned URI, so the CID still matches. No ADR
  (it was the first option listed in §4.3 / ADR `0092` item 8).
- **Stop after the publication** — user's decision. 37a, 37d, 37e and the rest of §3's walk (second
  browser, `arp`, revoke) move to `FUTURE.md` when task 37 closes.

## Rules touched

- `.claude/rules/security.md` — sufficient. The ADR `0092` row (testnet 13579 only, within limits)
  and the standing-licence paragraph (signature verified before pinning or writing) match
  `routes/publish.ts`: `verifyDelegationSignature` precedes the registry read, the limit check and
  `config.pin`; `assertSponsorChain` refuses any chain but 13579.
- `.claude/rules/claims.md` — the addendum's on-chain claims were re-read from the indexer, not
  taken from the note.

## Suggestions for future tasks

- `main.ts:106`'s comment says an unset pin key makes `POST /identity` answer 503; it now gates
  `/publish` and listing too. Widen it the next time the file is touched.
- The global-budget 429 for `/publish` is tested at `checkPublishLimits` level
  (`packages/protocol/test/sponsor.test.ts`), not through the route; a route-level test would match
  §3's wording exactly.
- `STATE.md` line for task 37 reads "Open: where the relay runs, Pinata vs Intuition's pin API
  **2026-11-03**: 37c is on" — the "Open" clause is stale; fix it when closing 37.

## Evidence ladder

**Which tier of the evidence ladder does this serve, and does it move ARP up it?**

37c serves the staked tier only indirectly: it publishes the delegation whose caveat bounds an
agent's deposits, making the guard rail on staking discoverable, and does not itself move ARP up a
tier.
