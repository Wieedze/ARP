# 0016 — Intuition writes move server-side; the browser stops pinning

**Status:** Accepted
**Date:** 2026-09-16
**Triggered by:** user request — the partner pinning API key was located in another local project, which surfaced that ARP's write path had already been broken by an upstream endpoint change.

## Context

While measuring the ERC-8004 agent cohort for `docs/08_ERC8004_AGENT_LAYER_OPPORTUNITY.md`, the
pinning endpoints were probed directly. `pinThing` no longer exists on the indexer GraphQL endpoints:

```
POST https://testnet.intuition.sh/v1/graphql   -> {"errors":[{"message":"no mutations exist"}]}
POST https://mainnet.intuition.sh/v1/graphql   -> {"errors":[{"message":"no mutations exist"}]}
POST https://pin.intuition.systems/v1/graphql  -> 401 {"message":"No API key found in request"}
```

Pinning moved to the gated `pin.intuition.systems`, exactly as `docs/07` describes. ARP never
followed the move. `app/src/services/intuition-pin.ts` still posts to `deployments.chain.graphqlUrl`,
which is now read-only, so every ARP write path that mints an atom is dead:

| Call site                                                                      | Invoked from                          | Effect                            |
| ------------------------------------------------------------------------------ | ------------------------------------- | --------------------------------- |
| `scripts/seed.ts` (own local `pinThing`)                                       | node                                  | seeding dead                      |
| `scripts/agent-loop.ts:142` → `redeemEnsureAtomForThing`                       | node runtime                          | compose path dead                 |
| `scripts/agent-stake-on-use.ts:173` → `redeemEnsureAtomForThing`               | node runtime                          | stake-on-use path dead            |
| `intuition-graph.ts` → `getOrCreateUsesPredicateAtomId` → `ensureAtomForThing` | node runtime, via `declareUsesTriple` | "uses" predicate cannot be minted |

Every live invocation is already server-side. This was checked call site by call site rather than
assumed: `RegisterModule.tsx` takes the `schemaURI` as typed user input and never pins;
`ToolDetail.tsx` uses `ensureAtomForURI`, which is explicitly the non-pinning variant (ADR 0008 — the
`schemaURI` is already canonical); `AgentRegister.tsx` imports only `agent-identity`, `delegation` and
`smart-account`. No page, hook or component reaches a pin.

So the browser does not pin today. What it does have is pin-capable code sitting in
`app/src/services/`, reachable from a bundle, one import away from a future page wiring a partner key
into client code. Vite inlines every `VITE_`-prefixed variable into the client bundle, and
`.claude/rules/security.md` forbids shipping API keys that way outright. The decision below makes
that mistake impossible to make by accident rather than merely unlikely.

A partner API key now exists, held locally and outside the repo.

## Decision

**Intuition writes move server-side. The browser never pins and never holds the key.**

1. `pinThing` targets `https://pin.intuition.systems/v1/graphql` and takes its credential as an
   **explicit parameter**, not an ambient `process.env` read inside the service. This keeps
   `app/src/services/` pure and testable without a DOM or an environment, per `.claude/rules/code.md`.
2. The key is threaded through `ensureAtomForThing` and `redeemEnsureAtomForThing` as a required
   argument. Callers that cannot supply one — browser code — lose the call, by construction rather
   than by convention.
3. Only Node entry points read `process.env.INTUITION_PIN_API_KEY`: `scripts/*.ts` and the agent
   runtimes. They fail loudly on a missing key, with no silent fallback, matching the deployer-script
   rule in `.claude/rules/security.md`.
4. `INTUITION_PIN_API_KEY` is documented in `.env.example` with an explicit prohibition on the
   `VITE_` prefix. `INTUITION_PIN_API_KEY_HEADER` is optional and defaults to `apikey`.
5. `bun run verify:pin` (`scripts/verify-pin-key.ts`) validates the key and, in the same pass,
   confirms that the canonical agent-atom recipe from `docs/07` reproduces byte-for-byte against a
   known mainnet atom. It prints a key fingerprint, never the key.

The execution plan is `tasks/06-pin-writes-server-side.md`.

## Alternatives considered

- **Serverless pin proxy on Vercel** — a function under `api/` holds the key and the browser calls
  it. Rejected. It would add a backend surface ARP does not otherwise have, and an open proxy lets
  anyone spend the partner quota, dragging in rate limiting and an origin allowlist. Its one
  advantage — preserving a client-side pin — turned out to be worth nothing, because no browser flow
  pins today. Reconsider only if a self-serve flow with no runtime becomes a product requirement.
- **Read the key from `process.env` inside the service, branching on environment** — rejected. It
  makes a browser-safe module silently unsafe depending on its bundler, hides a hard dependency from
  the type system, and breaks the service-purity rule in `code.md`. An explicit parameter makes the
  browser's inability to pin a compile-time fact.
- **Self-pin to IPFS and skip the partner API** — rejected for now. It may work (identical canonical
  JSON should yield an identical CID), but it is unverified, and a divergent CID fragments an agent's
  staking surface — the exact failure the frozen recipe exists to prevent. Kept as a resilience
  question in `docs/08` §7; `verify:pin` step 4 is the experiment that would settle it.
- **Leave the write path broken and ship read-only** — rejected as a permanent stance, though it is
  the correct short-term sequencing: `docs/08` Phase 1 (O1 + O6) is entirely read-side and proceeds
  regardless of this ADR.

## Consequences

**Positive:**

- The partner key cannot leak through the client bundle; the type system enforces it rather than a
  code-review habit.
- Services stay pure and environment-free, so existing Vitest suites keep working without shims.
- One pin path for every runtime, replacing the duplicated `pinThing` in `scripts/seed.ts`.
- `verify:pin` doubles as the preflight proof that ARP can derive canonical agent atoms — a
  prerequisite for `docs/08` O2 and O3, not just a credential check.
- The change is smaller than it first appeared: no UI flow regresses, because none pins.

**Negative:**

- `ensureAtomForThing` and `redeemEnsureAtomForThing` change signature, so their four Node callers
  and the three test suites that mock `pinThing` change with them.
- ARP now has a hard external credential dependency for all writes. Reads remain keyless.
- Any future browser feature that needs to mint an atom from arbitrary metadata has to route through
  a runtime. That is the intended constraint, but it will read as friction the first time it bites.

**Neutral (worth knowing):**

- The vendored `intuition` skill is stale on this point — `reference/graphql-queries.md:35` still
  claims the indexer endpoint "supports pin mutations", and `reference/schemas.md` carries the old
  recipe. Per ADR 0005 it is a snapshot; it needs a re-sync, tracked in task 06.
- The pinning endpoint is network-agnostic: one key serves testnet 13579 and mainnet 1155.
- This does not change ADR 0015's direction. It changes where 0015's write path executes.

## References

- Related doc: `docs/08_ERC8004_AGENT_LAYER_OPPORTUNITY.md` §8 (the regression, measured)
- Related doc: `docs/07_INTUITION_ERC8004_PARTNER_GUIDE.md` (pinning API, canonical recipe)
- Related task: `tasks/06-pin-writes-server-side.md`
- Related rule: `.claude/rules/security.md` (no API keys in client code), `.claude/rules/code.md` (service purity)
- Related ADR: `0015` (canonical ERC-8004 pattern — unchanged in direction), `0005` (vendored intuition skill — re-sync flagged), `0008` (module URI coupling via Intuition pinning — the mechanism this restores)
