# 0119 — What the connector checks, and what it no longer defaults

**Status:** Accepted
**Date:** 2026-11-03
**Triggered by:** `docs/tasks/60-audit-cleanup.md`, stream B (the 2026-11-02 audit of `packages/`)

## Context

The audit found five places where `@arp-protocol/core` either reported more than it had checked
or picked a value the caller never named.

1. **The signed exclusion list.** `verifyAssessmentSignature` read `payload.excludes` from inside
   `assessment.signature`, which is itself excluded from the hash. Whoever serves the document can
   therefore write any list there. A mirror could add `assessment.injected`, exclude it, and keep a
   provider's genuine signature `verified`.
2. **The document's own subject.** `getAgentProfile` never compared the signed document's `agent`
   block (chainId, registry, tokenId) with the ref it fetched for. Agent A's genuine document,
   served at agent B's resolver URL, verified as B's assessment.
3. **The indexer.** The mainnet GraphQL URL was copied into five files. Eleven readers fell back to
   it when the caller named no network, so a testnet caller that forgot ended up on mainnet with no
   error.
4. **The bonding curve.** Seven files each defined `DEFAULT_CURVE_ID`, and `recent.ts` used a bare
   `1`. Writes read `defaultCurveId()` from the chain.
5. **The RPC's chain.** `multiVaultReads` read every cost and term id from an RPC without checking
   which chain it served. Costs on 1155 and 13579 are 100× apart (`rules/portability.md` rule 3).

## Decision

**What `verified` now guarantees, and what it still does not.** An assessment is `verified` only
when all of the following hold:

- the document's EIP-712 signature recovers to the signer the document names;
- the hashed payload is the document minus exactly `assessment.signature`. That is the one
  exclusion set accepted, and it is the one all three Deep3 fixtures declare
  (`packages/protocol/test/fixtures/deep3-*.assessment.json`). Any other list is `unverified`
  with the reason `unsupported payload excludes`;
- in `getAgentProfile`, the document's `agent` block names exactly the agent that was asked for
  (chain id, checksummed registry, token id compared as integers). Otherwise the verdict is
  `unverified` with a reason beginning `DOCUMENT_AGENT_MISMATCH_REASON`, and the signature is not
  checked at all.

It still does **not** guarantee that the signer is the provider. The signer is self-certified: the
document names its own signer, and nothing binds that address to Deep3 or to the provider atom on
the graph. `verified` means "this document is intact and signed by the key it names, about the
agent asked for". It does not mean "this provider said it". The status keeps its name for now;
renaming it is a separate decision the user has not made yet.

**No default network.** `graphqlUrl` is required on every reader config that builds its own
transport. A config may give a pre-built `transport` instead, and tests do. `createErc8004Client`
and the declaration-subject resolvers take either an indexer or an explicit source, as a type-level
union. `INTUITION_MAINNET_GRAPHQL` is exported once, from the Intuition source, for callers that
mean mainnet and say so.

**One curve default, still optional.** `DEFAULT_CURVE_ID` exists once, in the Intuition source,
and every reader imports it. `curveId` stays an optional config field. Making it required would
have reached every reader call site in `apps/` and `scripts/` for a value that is the same on both
chains today. The real risk is a read and a write disagreeing about the curve, and that is
handled where it lives: writes read `defaultCurveId()` from the chain, and a caller that both
reads and writes passes what it read (the constant's own doc comment says so). The domain
hierarchy now reads shares on one curve instead of summing across curves.

**The RPC is asked which chain it serves.** A `multiVaultReads` built from `rpcUrl` or `transport`
asks `eth_chainId` once, before its first read. A failed lookup is forgotten, so the next read
retries; a mismatch is remembered. An injected `client` is the caller's, and it was built for a
chain. Its `chain.id` is compared at construction, without a round trip. An injected client with
no chain is trusted as given. Either mismatch throws `RpcChainMismatchError`.

## Alternatives considered

- **Rename `verified` now** — out of this stream's hands; the user has a pending decision on
  rename, anchor or keep.
- **Accept any `excludes` list that is a subset of known-safe paths** — no provider declares
  anything but `assessment.signature`, so a wider allow-list would only grow the attack surface.
- **Make `curveId` required everywhere** — real churn across apps and scripts for no change in
  behaviour today. Revisit if a second curve ever becomes the default on one chain.
- **Ask `eth_chainId` on injected clients too** — every app test mocks a `PublicClient` without it.
  An injected client already carries its chain, which is the cheaper and equally strong check.

## Consequences

**Positive:**

- A third party can no longer extend or retarget a provider's signed document and keep the
  `verified` verdict.
- Forgetting the network is a type error, not a silent read of mainnet.
- A wrong RPC URL fails on the first read instead of pricing a plan at the other chain's costs.

**Negative:**

- `createErc8004Client()` with no arguments no longer compiles. Every caller names an indexer or a
  source list. That is a breaking change to the package's public surface (it is at `0.0.1`).
- A document whose `agent` block is missing or incomplete is now `unverified` in a profile even if
  its signature recovers.

**Neutral (worth knowing):**

- An injected `PublicClient` without a `chain` is not checked. Every app in this repo passes a
  chain-bound client, so the gap is latent.
- `INTUITION_TESTNET_GRAPHQL` is still exported beside the mainnet constant. It is a convenience,
  not a default.

## References

- Related rule: `.claude/rules/portability.md` (rules 1 and 3), `.claude/rules/security.md`
- Related ADR: `.claude/choices/0019-*.md` (the `confirmedProviderIds` gate on `mismatch`),
  `.claude/choices/0038-*.md` (the package holds no key)
- Task: `docs/tasks/60-audit-cleanup.md`, stream B

## Addendum, 2026-11-02 — `verified` is renamed `self-signed`

**Decision (user, 2026-11-02):** rename the status so it says only what is checked. Of the three
options left open above (rename, anchor, keep), the user chose rename. Anchoring the signer to the
provider stays a separate, unmade decision.

- **Code value:** `SignatureVerdict["status"]` is `"self-signed" | "mismatch" | "unverified"`. The
  document names its own signer and the signature recovers to it; nothing more is claimed.
- **Screen label** (`apps/web/src/services/trust-format.ts`, `describeSignature`): **"Signed, author
  not checked"**, in place of "Signature verified". The tab strip's short form
  (`apps/web/src/services/agent-trust.ts`, `SIGNATURE_TAB_LABEL`) is **"self-signed"**. Both follow
  ADR `0103`: plain words, and the detail line underneath is unchanged.
- **Unchanged:** `mismatch` and `unverified` keep their names, and the guarantee list in the
  Decision section above still holds word for word under the new name.
- **Breaking:** `@arp-protocol/core` is at `0.0.1`; a caller comparing against `"verified"` no
  longer matches. No MCP tool returned this status, so the MCP surface does not change.
- **Not rewritten:** append-only records that name the old value (ADRs `0018`, `0019`, `0028`,
  `0029`, post-mortem `09`, task files `07` and `08`, `docs/10`, `docs/reference/pr-drafts/`) keep
  it as written. They describe the status as it was named then.
