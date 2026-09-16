# `@arp-protocol/erc8004`

A read-only connector for the ERC-8004 agent layer.

Give it an ERC-8004 identity — `(chainId, tokenId)` — and it returns one merged profile: every trust
provider's assessment with its **EIP-712 signature actually verified** and its **declared freshness
window actually enforced**, the agent's capability declarations, and the live market on each provider
claim.

Providers publish signed assessment documents and declare how long they stay valid. Consumers read
the number off a URL and trust it. This package checks both, and reports what it could not check
rather than rounding it up to a pass.

## Install

```sh
bun add @arp-protocol/erc8004
```

`viem` is the only runtime dependency.

## The one call

```ts
import {createErc8004Client, getAgentProfile} from "@arp-protocol/erc8004";

const client = createErc8004Client();
const profile = await getAgentProfile(client, {chainId: 8453, tokenId: "2340"});

for (const entry of profile.assessments) {
    console.log(
        entry.claim.provider.name,
        entry.signature.status, // "verified" | "mismatch" | "unverified"
        entry.freshness.status, // "fresh" | "stale" | "unknown"
        entry.market?.support.positionCount, // distinct stakers — see the warning below
    );
}
```

> **On market numbers.** `positionCount` is the field to lead with: these vaults typically hold one
> or two positions, so a market cap shown without its staker count misrepresents the market.
>
> `support.totalAssets` is the **term**-level total, not the vault balance, and the two differ by
> roughly three orders of magnitude — 0.988 against 0.0009875 TRUST on a live claim measured
> 2026-09-16. If you need the vault balance, read `getVault(termId, curveId)` on the MultiVault
> directly; this package deliberately does not, because it is read-only and holds no chain client.
> ARP's own panel reads the chain for exactly this reason.

`registry` defaults to the ERC-8004 Identity Registry at
`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, which is deployed at the same address on Base, BSC and
Ethereum.

## Listing the cohort

Everything above is keyed by an identity. `listAgents` is the read for when you do not have one yet.

```ts
import {createErc8004Client, listAgents} from "@arp-protocol/erc8004";

const client = createErc8004Client();
const page = await listAgents(client, {order: "evidence-quantity", limit: 25, offset: 0});

console.log(page.total); // 28,648 on mainnet — the graph's count, not page.agents.length
for (const agent of page.agents) {
    console.log(
        agent.metadata.name,
        agent.metadata.isFallback, // `Agent 8453:6649` is the indexer's stand-in, not a name
        agent.statementCount, // how many statements exist about it
        agent.market?.totalMarketCap,
        agent.market?.positionCount, // always read this beside the cap
        agent.ref?.tokenId, // from the `same as` edge, never parsed from the label
    );
}
```

Two orders, and only two:

- `evidence-quantity` — how many statements the graph holds about the agent. The mirrored shell gives
  every agent exactly five, so anything above five is somebody having bothered.
- `economic-conviction` — what is staked on the agent's own atom.

**There is no order by score, and one should not be added.** A provider's score is the claim this
package exists to qualify; making it the ranking key would undo that in a single control.

Some caveats that are the point rather than footnotes:

- **The page is the source's, not yours.** It is ordered and paged by the indexer and returned
  untouched. Re-ranking the union of several pages client-side makes the order a property of the
  window instead of the cohort, and presents the result as if it were the latter.
- **`market.totalMarketCap` and `market.positionCount` are both summed across every bonding curve**,
  deliberately, so the two figures describe the same thing. That makes `positionCount` a count of
  positions rather than of distinct stakers — an account staked on two curves counts twice. The
  per-vault `MarketSide.positionCount` is the one that equals the distinct-staker count.
- **`ref` is `null` when the identity is not unambiguous.** Clawnch's atom carries a second `same as`
  edge to `did:web:clawn.ch`, which is ignored; one mainnet atom claims sixteen ERC-8004 token ids,
  and that one gets `isIdentityAmbiguous` and no `ref` rather than an arbitrary pick.
- **`listAgents` is optional on `TrustSource` and only Intuition implements it.** A registry contract
  cannot be enumerated, so a registry-only client raises `NoListingSourceError` instead of returning
  an empty page that would read as "there are no agents".
- **The listing has its own deadline**, `DEFAULT_LIST_TIMEOUT_MS` (30s), separate from the 10s every
  other read gets. Ordering the whole cohort is a different kind of read, and this endpoint's latency
  on it is wildly variable: measured at 0.78s, at 9.1s, and not returning inside 25s — on the same
  query, within an hour, with both orders affected alike. Override with `intuitionSource({listTimeoutMs})`.
  When every listing source fails, `ListAgentsFailedError.timedOut` says whether it was a deadline
  (worth retrying) or an answer (not).

## The pieces, separately

Everything is composable and keyed by the ERC-8004 identity. No public signature mentions an
Intuition term id.

```ts
resolveAgent(client, ref); // AgentIdentity | null — null means "not there", not "error"
getAssessments(client, ref); // ProviderClaim[]
getCapabilities(client, ref); // Capabilities[] — one per source that answered
getMarkets(client, ref); // ClaimMarket[]
marketCapableSources(client); // which sources can price a claim at all
listAgents(client, options); // AgentPage — one window onto the cohort
listingCapableSources(client); // which sources can enumerate agents at all
```

Four functions are pure — no client, no network, no configuration. **A consumer who wants nothing
from ARP except the ability to check a provider's signature can import just that.**

```ts
import {
    canonicalizeRfc8785,
    verifyAssessmentSignature,
    assessFreshness,
    fetchAssessment,
} from "@arp-protocol/erc8004";

const document = await (await fetch(resolverUrl)).json();
const verdict = await verifyAssessmentSignature(document);
const freshness = assessFreshness(document);
```

## Running it without Intuition

Intuition is _a_ source, not _the_ source. Drop it entirely:

```ts
import {createErc8004Client, erc8004RegistrySource, getAgentProfile} from "@arp-protocol/erc8004";

const client = createErc8004Client({sources: [erc8004RegistrySource()]});
const profile = await getAgentProfile(client, {chainId: 56, tokenId: "17"});
```

This reads the ERC-8004 Identity Registry contract directly on Base (8453), BSC (56) and Ethereum
(1). It needs no graph, no API key and no TRUST. It reaches the roughly 73,000 agents on BSC and
Ethereum that the Intuition graph — which mirrors Base only — cannot see.

It answers narrowly and says so: identity, owner, and the raw `registrationFile` URI. It has no trust
claims, no capabilities, and no `getMarkets`. `getMarkets` is optional on `TrustSource` for exactly
this reason — a source that cannot see stake declines to answer, instead of returning `[]` and
letting you read "nobody is backing this claim" into "we cannot see backing".

Custom sources implement `TrustSource` and slot into the `sources` array in whatever order you want.
Where two sources disagree on a field, both answers are kept in `profile.conflicts`; no winner is
picked for you.

## What it cannot verify

Being explicit about this is the point of the package.

- **Most documents are not signed at all.** Of the providers live on mainnet today, Deep3 Labs signs
  and AsterPay KYA does not. An unsigned document gets `unverified`, never `verified`.
- **Provider identity is unproven.** Anyone can publish an assessment under any provider name. The
  only real gate today is control of the resolver URL. Nothing here proves the address writing a
  provider's graph edges is one that provider controls.
- **`verified` means one thing only**: the EIP-712 signature recovers to the address the document
  itself names as the signer. It says nothing about whether the score is honest, the method sound, or
  the signer trustworthy.
- **The signed-value mapping is empirical, not specified.** The signed struct's field _names_ are
  published in the document; the _values_ behind `provider` and `agent` are not specified anywhere.
  The mapping this package uses — `provider.id` and the CAIP-19 asset id — was established by
  recovering Deep3's declared signer from its live documents, and is marked `confirmed` on that
  basis. A document whose struct shape does not match any confirmed strategy gets `unverified` with
  the attempts recorded, never a guess.
- **`mismatch` is reserved for real red flags, and is scoped to providers we have studied.** A
  strategy is confirmed _against a provider_, never universally: `providerIdCaip19Strategy` carries
  `confirmedProviderIds: ["deep3-labs"]` because that is whose declared signer it was actually shown
  to recover. `mismatch` is returned only when a strategy confirmed for _this document's_ provider
  applied cleanly and recovered a _different_ address.

    The consequence is deliberate and worth stating plainly: **a provider outside that list gets
    `unverified` even when their document is genuinely tampered.** Another provider can publish the
    same three field names and encode `agent` differently, in which case our reconstruction recovers a
    meaningless address — and publishing `mismatch` on that basis would be a public accusation against
    someone who did nothing wrong. We trade a true positive about a stranger for never crying wolf
    about one. Confirming a provider means recovering their own declared signer from their own live
    documents and adding their `provider.id` to that list; nothing less.

    `verified` is _not_ gated this way. Vouching for a signature that demonstrably checks out costs
    nobody anything, so any provider can reach it on an exact match.

- **Capabilities are relayed, never inferred.** Nothing is read out of the registration file yet; the
  URI is exposed and that is all.
- **Provider identity in the graph is not checked against the document.** Nothing verifies that the
  `provider.id` inside a document matches the provider atom whose edge pointed us at it. An
  impersonator who copies a known `provider.id` will get `mismatch` (which is the intent), but the
  graph-side binding is unproven either way.
- **No caching.** Every call is a live read, and each source method runs its own preflight, so a full
  profile is several round trips. If that becomes a problem it is a measured follow-up, not a
  guess-driven optimisation.

## Predicate resolution

No predicate is ever resolved by label. On mainnet `use`, `implement`, `has tag` and `Base` each
resolve to several atoms, and `has trust provider` resolves to two — picking the first match reads a
different graph than the one the ecosystem writes to. Every term id is frozen in
`src/sources/intuition/terms.ts` with its source: published in the Intuition partner guide, or
resolved once with an explicit zero/multiple-match check whose result and date are recorded inline.

## Tests

```sh
bun run test         # hermetic: recorded fixtures, no network
bun run build        # ESM + .d.ts into dist/
bun run lint         # tsc --noEmit
```

> **`bun run build` is a precondition for every consumer.** This package's `exports` point at
> `dist/`, which is gitignored, so anything importing `@arp-protocol/erc8004` — an app, a script, a
> one-off probe — reads whatever was last built. A stale `dist/` fails _silently_ and plausibly: it
> once reported agents with zero trust providers, which looked exactly like a regression in the
> connector rather than an old build. `app/`'s `dev`, `build` and `test` scripts run this build
> first for that reason. A standalone script has to do it itself.

Fixtures are real responses recorded from mainnet on 2026-09-16 — three live agents, three cohort
pages, and four live provider documents, including one provider whose advertised resolver URL 404s. Mocking sits at the
network boundary only, so the GraphQL transport, the document narrowing and the signature check all
run for real.

One live smoke test is opt-in:

```sh
ERC8004_LIVE=1 bun run test
```

It resolves a real agent against `https://mainnet.intuition.sh/v1/graphql`, re-verifies a live
signature, and reads a page of the cohort in both orders. It catches indexer schema drift, which
recorded fixtures cannot catch by construction — a fixture answers whatever it is asked, so a query
whose _variable declarations_ the indexer rejects passes every hermetic test and fails in production.
That happened once already, to the market read's `$curveId`.

## Read-only

This package never signs and never sends a transaction. There is no wallet client, no private key,
and no write path anywhere in it. Every read is unauthenticated.
