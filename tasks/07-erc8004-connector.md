# Task 07 — `@arp-protocol/erc8004`: the read connector

> **Status: NOT STARTED** (specified 2026-09-16).
>
> Phase 1 · option O1 of `docs/08`. Serves tier 1→2 of the evidence ladder (`docs/09` §2): it does not
> produce a new signal, it makes the existing ones legible and checkable.

## Objective

A read-only TypeScript package that takes an ERC-8004 identity `(chainId, tokenId)` and returns one
merged, honest profile: every trust provider's assessment with its **signature verified** and its
**freshness enforced**, the agent's capability triples, and the live market on each provider claim.

ARP cannot be infrastructure for 28,648 agents while its SDK reads only its own testnet registry.
This is the price of entry, and it is useful on its own.

## Why it matters beyond ARP

Providers publish EIP-712-signed assessment documents and declare freshness windows. **Nobody
verifies either.** A consumer today reads a number off a URL and trusts it. This package is the first
client that checks the signature recovers to the declared signer and that the document is still
inside its own declared validity window. That is cheap to build and it is the honest-broker position
in a market where everyone publishes and nobody audits.

## Required reading

- `docs/07_INTUITION_ERC8004_PARTNER_GUIDE.md` — the canonical pattern, the query shapes, Appendix B
  term IDs. Authoritative.
- `docs/08_ERC8004_AGENT_LAYER_OPPORTUNITY.md` §4 (the connector spec) and Appendix A/B.
- `docs/09_POSITIONING_AND_PLAN.md` §2 — what this serves.
- `.claude/rules/code.md` — service purity, no `any`, named exports, `Result`-style typed errors at
  boundaries.
- `sdk/` — the existing `@arp-protocol/sdk` for the established package shape, build config and voice.

## Placement

New workspace at `erc8004/`, publishing `@arp-protocol/erc8004`. Added to the `workspaces` array in
the root `package.json`, mirroring how `sdk/` is set up.

Deliberately **not** folded into `sdk/`: that package reads ARP's own contracts on Intuition testnet;
this one reads the ERC-8004 cohort across chains. Different network, different concern, different
release cadence.

## Source abstraction — the load-bearing design decision

**Intuition is _a_ source, never _the_ source.** This is the difference between ARP being an Intuition
product and ARP being a neutral layer that currently uses Intuition as its substrate. It costs an
interface and a folder now; retrofitting it later would mean every call and every type in the package
already carries the shape of the Intuition graph.

Two consequences make it concrete rather than theoretical:

- **The primary key is the ERC-8004 identity, not the Intuition atom ID.** Everything is addressed by
  `AgentRef = {chainId, tokenId, registry}`. The Intuition `term_id` is a source-specific detail that
  never appears in a public signature.
- **Coverage stops being capped at 28,648.** Intuition mirrors Base only. Roughly 73,000 more agents
  live in the ERC-8004 registries on BSC and Ethereum and are invisible to the graph — but readable
  directly from their registries.

```ts
interface TrustSource {
  readonly id: string; // "intuition" | "erc8004-registry" | …
  resolveAgent(ref: AgentRef): Promise<AgentIdentity | null>;
  getAssessments(ref: AgentRef): Promise<ProviderClaim[]>;
  getCapabilities(ref: AgentRef): Promise<Capabilities>;
  getMarkets?(ref: AgentRef): Promise<ClaimMarket[]>; // optional — only a staking graph has these
}
```

`getMarkets` is optional on purpose. A registry read can tell you an agent exists and what it declares;
only Intuition can tell you who has capital behind a claim. The type should say so rather than
returning empty arrays and pretending the capability is universal.

Ship two implementations:

1. **`IntuitionSource`** — `sources/intuition/`. Everything below in "the read path". The only source
   implementing `getMarkets`.
2. **`Erc8004RegistrySource`** — `sources/erc8004-registry/`. Reads the ERC-8004 Identity Registry
   contract directly with viem on Base (8453), BSC (56) and Ethereum (1). Returns identity plus the
   raw `registrationFile` URI. Needs no Intuition, no graph, no TRUST.

Do **not** parse the registration file into capabilities in this task — that is Phase 2. Expose the
URI and stop. The point of doing the source split now is that Phase 2 has somewhere to land.

The merge layer composes sources in a declared order and records, per field, which source produced it.
Where two sources disagree, keep both and mark the conflict; do not silently pick a winner.

## Hard rules

- **Read-only.** The package never signs and never sends a transaction. No private keys, no wallet
  client.
- **Never resolve a predicate by label.** On mainnet `use`, `implement`, `has tag` and `Base` each
  resolve to multiple atoms; `has trust provider` resolves to two. Term IDs are constants. This is
  already a standing rule (ADR 0015).
- **No new runtime dependencies.** `viem` is already in the repo and supplies `keccak256` and
  `recoverTypedDataAddress`. RFC-8785 canonicalisation is ~60 lines — write it, with tests against
  the RFC's own vectors, rather than adding a package.
- **Provenance on every field.** A consumer must be able to tell a claim from an inference. Nothing
  is silently defaulted.
- **`strict: true`, no `any`.** Use `unknown` and narrow at the network boundary — every GraphQL and
  HTTP response is untrusted input written by third parties.

## Surface

```ts
// Sources, composed in declared order. Intuition first by default.
createErc8004Client(config?: {sources?: TrustSource[]; fetch?; timeoutMs?}): Erc8004Client
intuitionSource(config?: {graphqlUrl?}): TrustSource
erc8004RegistrySource(config?: {rpcUrls?: Record<number, string>}): TrustSource

// The one-call path.
getAgentProfile(client, ref: AgentRef): Promise<AgentProfile>

// Composable pieces — source-neutral signatures, all keyed by AgentRef.
resolveAgent(client, ref): Promise<AgentIdentity | null>
getAssessments(client, ref): Promise<ProviderClaim[]>
getCapabilities(client, ref): Promise<Capabilities>
getMarkets(client, ref): Promise<ClaimMarket[]>      // empty when no source supports it — say which

// Pure functions, no client, no network. Independently useful and independently testable.
fetchAssessment(claim, opts?): Promise<AssessmentFetch>
verifyAssessmentSignature(doc): SignatureVerdict
assessFreshness(doc, now?): FreshnessVerdict
canonicalizeRfc8785(value: unknown): string
```

`getAgentProfile` is the one-call path; everything else is composable so a consumer takes only what it
needs. The last four are pure and exported deliberately: **a consumer who wants nothing from ARP but
the ability to check a provider's signature should be able to import just that.** That is the smallest
useful unit of this whole package and the easiest thing for another platform to adopt.

Every function is keyed by `AgentRef`. No public signature mentions an Intuition term ID.

### The read path, in order

1. **Preflight resolve.** Match the canonical `same as` predicate
   `0xbeebfb7d177cbd96ffc239d2196c72ec346efe81f39dc595773f13d83506f5f0` against the exact CAIP string
   `eip155:{chainId}/erc721:{registry}/{tokenId}`. Registry defaults to
   `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`. Returns the subject atom, or `null` if the agent is
   not in the graph — `null` is a legitimate answer, not an error.
2. **Trust surface.** Triples on that subject filtered by `predicate_id`, selecting `term` and
   `counter_term` market data explicitly (they are never returned by default), with
   `vaults(where: {curve_id: {_eq: "1"}})` for `position_count`.
3. **Resolver fetch.** Follow `object.value.thing.url`. **Not** `object.data` — that is the atom's
   pinned `ipfs://` URI, not the live document. Getting this backwards is the most likely bug in the
   whole package; assert it in a test.
4. **Signature verification.** See below.
5. **Freshness.** Compare `freshness.validUntil` to now. `fresh` / `stale` / `unknown`, with the age
   in seconds. Never silently serve a stale document as current.
6. **Capabilities.** `use`, `has type`, `has category`, `has tag`, `available on`, `uses` triples.

### Signature verification

Observed shape on a live document:

```json
"signature": {
  "alg": "EIP-712",
  "eip712": {
    "domain": {"name": "ERC8004FeedbackTrustAssessment", "version": "1"},
    "primaryType": "FeedbackTrustAssessment",
    "types": {"FeedbackTrustAssessment": [
      {"name": "provider", "type": "string"},
      {"name": "agent", "type": "string"},
      {"name": "contentHash", "type": "bytes32"}
    ]}
  },
  "payload": {"canonicalization": "RFC8785", "excludes": ["assessment.signature"], "hash": "keccak256"},
  "signer": "0x27A6265e6daf8d9935A3031f2E7cDC4bDFbe2Ebe",
  "value": "0x4d6e…1c"
}
```

Procedure: strip the paths in `payload.excludes`, canonicalise per RFC-8785, `keccak256` → the
`contentHash` value, build the typed data from the document's own `domain` / `types` / `primaryType`,
recover, compare to `signature.signer`.

**The `provider` and `agent` string values are not specified in the document.** The plausible mapping
is the provider's name and the agent's CAIP-19, but this is a genuine unknown.

Handle it honestly: make the value mapping a **named, swappable strategy**, try the plausible
candidates, and if none recovers to the declared signer return
`{status: "unverified", reason: "could not reconstruct the signed payload"}` — _not_ `verified`, and
_not_ a thrown error. Record what was tried. **Do not weaken the check to make a test pass**, and do
not claim the signature verifies if it does not. A correct "we cannot verify this yet" is a shipping
result; a false "verified" is the one outcome this package exists to prevent.

Distinguish three verdicts: `verified` (recovered == declared signer), `mismatch` (recovered a
different address — a real red flag, surface it loudly), `unverified` (could not evaluate: absent
signature, unsupported `alg`, or reconstruction failed).

## Fixtures (real, on mainnet)

| Case                                                 | Atom term ID                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| Rich — 21 triples, 2 providers, full capability set  | `0x20dd3a62fee16233e1747a597291dd8faa10a1eb6783afe2bc52eab62df89028` |
| Bare — 5-triple shell, fallback metadata, 1 provider | `0x0ea137804fd2180aca6c35474e7db6e3c2fb0f7990dd798452ed5b412610765e` |
| Multi-provider                                       | `0x45078ae569def2264355f77e592028dd6f1f5d6373c204fe82bf3141ab1861fb` |

Term ID constants (cross-checked against Appendix B and confirmed live 2026-09-16):

```
same as                  0xbeebfb7d177cbd96ffc239d2196c72ec346efe81f39dc595773f13d83506f5f0
has type                 0xa632a94306ab1d56911cff8c06473659a7caa2dfec6de3921bc23ec8ebf96ced
implement                0xfa02609bfde5a9a7ba18fa8afc1c42bc643edfaf7d44e3ce9e50835290d03324
has trust provider       0xdc3c5639b39f9b6553b75b37c47fa4810961392b28956234ba9f401a98f43888
Trust Assessment Source  0xf8a0ea34c8e7195b63d1641141166cc56e9128e25cf8c9f68ac6b81527b78f07
ERC-8004 (object)        0x595ba5059b23a9aa4d64deff324ff3d957866715d5b7b8015eebc9009bab78b2
AIAgent (object)         0x800342c0ded1c288e69f39a2dc96d8cff9b242e9f573193e6e0a849e5315d3e9
```

`has trust assessment` and `provided by` are not in the confirmed set — resolve them once at build
time via GraphQL with an explicit zero/multiple-match check, record the result as a constant with a
comment naming the date and how it was derived, and never fall back to label matching at runtime.

Endpoints: reads `https://mainnet.intuition.sh/v1/graphql` (no auth). Testnet
`https://testnet.intuition.sh/v1/graphql` configurable.

## Tests

Vitest, matching `sdk/`'s setup. Mock at the network boundary only, never internals.

- RFC-8785 canonicalisation against the RFC's published test vectors, including the number-formatting
  and string-escaping edge cases. These are the ones that silently break signature checks.
- Preflight: resolves; returns `null` for an unknown identity; never falls back to label matching.
- Trust surface: multi-provider ordering; market fields present; `counter_term` read for the
  opposition side.
- Resolver URL taken from `value.thing.url` and **never** from `data` — assert explicitly.
- Signature: all three verdicts, including a tampered document that must produce `mismatch`.
- Freshness: fresh, stale, missing window.
- `getAgentProfile` end-to-end against recorded fixtures for all three cases above.
- Network failures, malformed JSON, and a resolver returning HTML instead of JSON are handled as typed
  results, not exceptions.

**One live smoke test**, opt-in behind an env flag so CI stays hermetic: resolve the bare fixture
against real mainnet and assert the atom ID matches. It catches schema drift, which is the failure
mode most likely to hit this package.

## Acceptance criteria

- [ ] `bun run build` in `erc8004/` produces working ESM types
- [ ] `bun run test` green, every public function covered
- [ ] `bun run lint` clean, `prettier --check` clean
- [ ] `grep -rn ": any" erc8004/src` returns nothing
- [ ] No predicate resolved by label anywhere in the package
- [ ] `getAgentProfile` returns a correct profile for all three fixtures, including the bare one
- [ ] Signature verdicts are honest — no `verified` that has not actually recovered to the declared signer
- [ ] **No public signature mentions an Intuition term ID.** `grep -rn "term_id\|termId" erc8004/src` finds hits only under `sources/intuition/`
- [ ] **`Erc8004RegistrySource` resolves an agent with `IntuitionSource` removed from the client entirely** — the portability claim is tested, not asserted
- [ ] Every field in `AgentProfile` carries which source produced it
- [ ] The four pure functions are importable and usable without constructing a client
- [ ] A short `erc8004/README.md`: what it does, the one-call example, how to run it without Intuition, and a plain statement of what it cannot yet verify
- [ ] `task-verifier` pass

## Out of scope

- No UI. The panel is a separate task.
- No writes, no staking, no signing.
- No capability _inference_ from registration files — that is Phase 2. `Erc8004RegistrySource` exposes
  the `registrationFile` URI and stops there.
- No caching layer or indexer. Live reads. If it turns out too slow, that is a measured follow-up.
- **No bulk indexing of BSC or Ethereum.** `Erc8004RegistrySource` resolves agents one at a time, on
  request. Mirroring those registries into the graph is `docs/08` O7, which is a partnership question
  before it is an engineering one — do not start it here.
- No third source. `8004scan` / `agentscan` as a metadata fallback is an obvious third implementation;
  leave the seam for it and do not build it.
