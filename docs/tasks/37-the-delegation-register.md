# Task 37 — The delegation register: published on Intuition, found by the agent, sponsored on testnet

**Status:** **CLOSED** 2026-11-03 at 37b and 37c (`task-verifier` PASS on 37c,
`.claude/learning/57-the-delegation-register.md`). 37a, 37d, 37e and the rest of §3's walk were not
started, by the user's decision, and moved to `FUTURE.md`. Completion note at the end.
**ADR:** `0092` (sponsoring on testnet; amends `0045` and `security.md`).
**Required skills:** `mms-smart-accounts-kit` (`references/delegations.md`), `intuition`.
**Rules:** `code.md`, `security.md`, `metamask-delegation.md`, `portability.md`, `claims.md`,
`workflow.md`.
**Reviewers:** `intuition-integrator`, `ui-reviewer` (for the account page's part), then
`task-verifier`.
**Prior art:** Hourglass, `/home/max/Project/Hourglass`:

- `src/lib/intuition/discover.ts`, `publish.ts`, `enabled.ts`;
- `server/intuition-publisher.ts`;
- ADRs `0003` and `0005`.

---

## 1. Why

A signed delegation lives in one browser's `localStorage` today. `/account` (task 35) cannot list
it from another browser, and the agent receives it only through a `.env` copy. The user chose
Hourglass's answer, with the publication paid for by ARP on testnet (ADR `0092`).

## 2. Deliverables, in order

### 37a — Read: find a delegation by its agent (`packages/protocol`)

Read-only, and safe to ship first.

- `discoverDelegations(delegate, chainId, config)`. Config is the GraphQL URL and the predicate ids.
  No chain constant goes at module scope (`portability.md`). The steps:
  1. find the CAIP-10 atom for the delegate;
  2. find the `delegate to` triples pointing at it;
  3. find the `in context of` triples on those;
  4. fetch the `ipfs://` documents;
  5. recompute each delegation hash locally.
- `isDisabled(hash)`: `disabledDelegations(bytes32)` on the DelegationManager. If the read fails,
  the result is "unknown", not "enabled". Hourglass keeps a delegation when the read fails, and
  ARP shows the state as unknown instead.
- **The predicate ids are read from the graph first** (Hourglass ADR `0003` found that
  `delegate to` did not exist on testnet before it created it). Record what was found in
  `data/deployments/13579.json`.
- **Decode every caveat ARP uses.** That covers `TrustStakeCapEnforcer` and the standard enforcers
  `composeAndStakeCaveats` adds. Hourglass's decoder returns `null` for anything that is not an
  ERC-20 transfer caveat.
- Tests: against a mocked GraphQL transport, plus one live read on 13579 recorded as a fixture.

### 37b — Write: the document and the triples (`packages/protocol`, plans only)

- `delegationDocument(delegation)`: the JSON pinned to IPFS. It is a schema.org Thing plus the full
  signed struct, with a deterministic key order (Hourglass found that a different key order gives a
  different CID).
- `planPublishDelegation(...)` builds the unsigned calls: the delegator and delegate CAIP-10 atoms,
  the document atom, `(delegator) delegate to (delegate)`, and `(document) in context of
(that triple)`. Each call is skipped if its term already exists (`isTermCreated`).
- It never signs (ADR `0038`). The relay and the operator's wallet are the two signers.

### 37c — The sponsor relay (`apps/relay`, testnet only)

New app, because it runs and holds a key (ADR `0082`).

- `POST /publish { delegation }`. The relay:
  1. **verifies the signature** (EIP-1271 for a smart account) and refuses anything that fails;
  2. checks the limits;
  3. pins the document;
  4. sends the plan from 37b.

  Nothing is pinned before step 1.

- Limits, both in config and both printed on `GET /`:
  - per delegator per day;
  - a global daily budget in TRUST.

  When either is reached, the relay answers 429 with the plan, so the page can offer "publish it
  yourself".

- **The key** is ARP's treasury key, as the user decided (ADR `0092`). It is read from a 0600 file,
  never from an environment variable (ADR `0089` §3). The relay refuses to start on any chain but 13579.
- No database. Daily counts live in memory, and a restart resets them. The relay's balance is the
  hard limit behind that.
- **Hosting** is undecided (§4.2). It must run locally first, as `apps/api` does.

### 37d — The account page uses it (task 35)

- `/account` lists the delegations found by 37a for the connected smart account, merged with the
  ones in `localStorage`. Each row shows whether it is **published**, **local only** or
  **disabled**.
- Signing a new delegation offers to publish it: through the relay by default, from the operator's
  wallet when the relay answers 429 or is unreachable. Before anything is sent, the page names the
  chain and the cost (`portability.md`).
- Revoke stays the operator's wallet calling `disableDelegation` (task 35).

### 37e — The agent finds its own

- In `arp` (task 33), the agent's runtime looks up its delegations by its own address instead of
  reading a `.env` blob. The `.env` path stays as the fallback.

## 3. Gates

- `packages/protocol`: unit tests for discovery, decoding and plan building, plus the live read
  fixture.
- `apps/relay`:
  - a forged or tampered delegation is refused **and nothing is pinned**;
  - the per-delegator limit returns 429;
  - the global budget returns 429;
  - starting it with a 1155 RPC refuses.
- One end-to-end walk on 13579 (ADR `0037` conditions): sign, publish through the relay, find it
  from a second browser and from `arp`, revoke it, and see it marked disabled. Record the
  transaction hashes in the task's completion note.

## 4. Decisions for the user, before the step that needs them

1. ~~**The limit values.**~~ **Decided 2026-10-30** (ADR `0092` item 3):
   - 2 publications per delegator per day;
   - about 1 tTRUST per day overall;
   - sponsoring only for a delegate that is a registered ERC-8004 agent.

   The relay checks the last one by reading the registry before it pins anything, and refuses with
   the self-publish plan otherwise. On 13579 one publication is about 5 term creations at about
   0.001 each (`getAtomCost` and `getTripleCost`, read from the chain at the time, never from this
   file).

2. **Where the relay runs.** Locally for development. For real use, a Cloudflare Worker would be
   consistent with `apps/api`, but a Worker holding a funded key is a different risk from
   `apps/api`, which holds none (ADR `0084`).
3. **Pinning.** Intuition's pin API if it accepts an arbitrary JSON document, otherwise Pinata
   (ADR `0092` item 8). Checked at the start of 37c.

## 5. Do not do in this task

- Anything on mainnet 1155: no relay, no publication, no discovery path presented as live.
- Sign from `packages/protocol`.
- Store or log a private key, or a signed delegation's signature, in the relay's logs.
- Let the relay pin or write before it has verified the signature.

## 6. Evidence ladder

The delegation is `docs/12` point 5's guard rail. Today nobody but the operator's browser can see
it. Once it is published, a third party can check the bound an agent operates under. It makes the
**staked** rung inspectable. It does not move a claim up a rung.

## 7. Completion note — 37b and 37c, 2026-10-30

On `feat/40-sponsoring-service`, with task 40. ADR `0096`, post-mortem
`.claude/learning/32-the-sponsoring-service.md`, `task-verifier` PASS on the second pass.

- **37b.** `planPublishDelegation` and `delegationDocument` in
  `packages/protocol/src/delegation/register.ts`: plans only, each call skipped when its term
  exists, nothing signed.
- **37c.** Built as `POST /publish` in `apps/sponsor`, not a separate `apps/relay`: one service holds
  the one treasury key for publications and for task 40's deposits. The signature is verified before
  anything is pinned; the per-delegator limit and the daily budget answer 429 with the plan.
  **Two departures from the text above:** the daily counts are kept in an append-only JSONL ledger,
  not in memory, because a restart would replay task 40's deposits (ADR `0096` item 2); and
  `main.ts` answers 503 on `/publish`, because the pinning service (§4.3) and the two predicate ids
  (37a) are not decided or read yet. The route is tested with both injected.
- **Not done:** the end-to-end walk on 13579 in §3, so there are no transaction hashes to record;
  37a, 37d and 37e.

**2026-11-03, arp-c4: 37c is on, and the publish half of §3's walk ran on 13579.**

- **Pinning (§4.3), decided by measurement.** Intuition's pin API has `uploadJsonToIpfs(json: jsonb)`
  besides `pinThing` (schema introspection, 2026-11-03), and the existing `INTUITION_PIN_API_KEY`
  reaches it. Pinata is not needed. `intuitionJsonPinner`, `apps/sponsor/src/pin.ts`.
- **The two predicates, read from the graph (37a's first step).** On 13579, 2026-11-03, exactly one
  atom carries each label, a Thing: `delegate to` `0xb56980d4…` in 10 triples, `in context of`
  `0x61a88b9c…` in 29. Recorded in `data/deployments/13579.json`, `arp.delegationRegister`.
- **`main.ts` turns `/publish` on** when the pinning key is set. The signature is checked with
  viem's `verifyTypedData`, which covers EIP-1271 and EIP-6492, before anything is pinned.
- **One publication, the user's go, 2026-11-03.**
  - The delegator was a throwaway key generated in memory, never printed (`0x6673…F939`). The
    delegate was agent 11's holder, `0x5c2b…2f75`. The caveat was `TrustStakeCapEnforcer`, 0.001
    tTRUST a day.
  - The sponsor answered `published: now`: delegation hash `0xfac09d84…`, document
    `ipfs://QmdjNZV568RAHQzP8bMnnxMEbtQDmf7Cstq9BwwadrwdHZ`, and 5 transactions
    (`0x443fd90d…`, `0x1131bd38…`, `0xe53855a6…`, `0x2c2acbef…`, `0x14c0fd40…`).
  - Read back on the testnet indexer: `(caip10:…0x6673…F939, delegate to, caip10:…0x5c2b…2f75)`
    is triple `0xbfd4b091…`. The pinned document resolves as a Thing labelled "ARP delegation", in
    context of it.
- **Still not done:** 37a's discovery, 37d and 37e, and the rest of §3's walk (find it from a
  second browser and from `arp`, revoke it, see it disabled). The user chose to stop after this
  publication.

**2026-11-03, closed.** `task-verifier` PASS on 37c as turned on that day, post-mortem
`.claude/learning/57-the-delegation-register.md`. The task closes at 37b and 37c. 37a (find a
delegation by its agent), 37d (the account page reads it), 37e (the agent finds its own) and the
rest of §3's walk (find from a second browser and from `arp`, revoke, see it disabled) are in
`FUTURE.md`. The global-budget 429 is tested on `checkPublishLimits` in `packages/protocol`, not
through the route.
