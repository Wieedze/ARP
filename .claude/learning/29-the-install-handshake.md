# 29 — The install handshake: a rented tunnel, and the node bound to its ERC-8004 token

**Task:** `docs/tasks/39-the-install-handshake.md`
**Completed:** 2026-10-30
**Commit:** `4111c28` on `feat/39-install-handshake` (not merged)
**Verifier verdict:** PASS (second pass; the first failed on ADR `0095` §7's griefing costs)

## What shipped

- `packages/protocol/src/handshake.ts`, `handshake-http.ts`, `handshake-chain.ts` — EIP-4361 challenge, single-use nonce, short expiry, chain id in the message; owner and node key both sign; `verifyEndpointBinding` reads `transferred` after a transfer.
- `packages/protocol/src/declare/endpoint-binding-plan.ts` — `(agent atom) has endpoint (URL atom)` plus `(pinned document) in context of (that triple)`, planned, never signed (ADR `0038`).
- `packages/protocol/src/directory.ts` — `getAgentEndpoints` / `resolveAgentEndpoint`; a proof counts only for the agent asked about.
- `apps/node/src/tunnel.ts`, `node-key.ts`, `register.ts`, `node.ts` — loopback bind, operator's `cloudflared`/`ngrok` or `ARP_NODE_PUBLIC_URL`, `~/.arp/node.key` 0600.
- `apps/cli/src/node-init.ts` — `arp init --node`; owner signs by paste, the CLI never reads the owner's key.
- `data/deployments/13579.json` `arp.endpointBinding` — both predicates read from the graph (`scripts/measure/endpoint-predicate.ts`), none minted.
- ADR `0095`; `docs/22` and `docs/23` updated for the loopback node.

## Surprises

- The read path was hijackable before review: both triples are permissionless, so any token owner could hang a genuine binding for their own token under a victim's atom. Fixed by naming the agent on the read (ADR `0095` §7). Latent: no directory was hosted.
- The first ADR draft priced the surviving griefs on atom fees and on a precondition that did not exist. The real floor is triple fees only, because the read checks neither the claim's object nor, before `limit`, a context's subject.
- `docs/22`'s quoted `scripts/measure/node-outbound.ts` figures (9 call sites, 6 outbound) no longer match a run (11, 7). None of the measured modules changed on this branch, so the drift came from `dev`, not from this task.

## Decisions made

- **Node key signs the challenge too, and is the receipt key and payment address** — proof of possession; one key. ADR: `.claude/choices/0095-the-handshake-binds-a-node-key-both-keys-sign.md`.
- **Predicates `has endpoint` / `in context of` reused from testnet** — `reachable at` does not exist there.
- **Queries kept in `packages/protocol/src/directory.ts`** — task 42 edits `@arp-protocol/graphql` in the same wave.
- **The two-transaction write window is left to the submitter** — a plan does not choose submission (ADR `0038`).

## Rules touched

- `.claude/rules/portability.md` — sufficient; "read the predicate before minting" was followed and recorded.
- `.claude/rules/claims.md` — sufficient; check 5 caught a second stale copy, in a code comment.
- `.claude/rules/code.md` — the `as Record<string, unknown>` after an object guard has no comment, and `dev` has 16 more like it. Either the rule exempts the guarded narrow or the code adds comments. Undecided.

## Suggestions for future tasks

- Price an attack from the code's actual checks (the query and the loop that filters it), not from what the protocol intends.
- Task 40's sponsoring service should send the binding and context triples atomically. That closes the proof-crowding window.
- Re-run `node-outbound.ts` and re-quote `docs/22` in a docs task of its own.
