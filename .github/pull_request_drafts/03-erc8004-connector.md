# feat(erc8004): a source-neutral read connector that actually checks signatures

**Branch** `feat/erc8004-connector` → `docs/strategy-and-positioning` · 10 commits · Phase 1 / option O1 of `docs/08`.

A sibling of the pin-writes PR, not stacked on it: this package is read-only and does not touch the
write path. Both branch off the strategy PR; review that one first, then either of these in any order.

---

## What this is

A new workspace, `@arp-protocol/erc8004`. Give it an ERC-8004 identity `{chainId, tokenId, registry}` and it returns one merged profile: every trust provider's assessment with its **EIP-712 signature actually verified** and its **declared freshness enforced**, the agent's capability triples, and the live market on each provider claim.

Read-only. It never signs and never sends a transaction.

## Why it exists

ARP cannot be infrastructure for 28,648 agents while its SDK reads only its own testnet registry. But the sharper reason is in the measurements (`docs/08`): providers publish EIP-712-signed documents and declare freshness windows, and **nobody checks either**. A consumer today reads a number off a URL and trusts it.

That is the honest-broker position, and it was available for the cost of writing it.

## The load-bearing design decision: Intuition is _a_ source, not _the_ source

Everything is keyed by `AgentRef = {chainId, tokenId, registry}`. The Intuition `term_id` never appears in a public signature. Two implementations ship behind one `TrustSource` interface: `IntuitionSource` (the graph, and the only one implementing the optional `getMarkets`) and `Erc8004RegistrySource` (reads the Identity Registry contract directly on Base, BSC and Ethereum — no graph, no TRUST, no Intuition).

This is what makes the answer to "is this usable outside Intuition?" _yes_ rather than _in principle_. It also uncaps coverage: Intuition mirrors Base only, and ~73,000 more agents sit in the BSC and Ethereum registries.

Both claims are **tested rather than asserted**:

- `grep -rn "term_id\|termId" erc8004/src` → hits only under `sources/intuition/`
- `test/registry-source.test.ts` builds a client with `IntuitionSource` removed **and** a `fetch` that throws if called, then resolves an agent and a full profile. A hidden graph dependency fails the test rather than passing quietly.

## Signature verification — it genuinely works, and here is how we know

The `provider` and `agent` values fed into the signed struct are not specified in any published document. This was expected to end in "we cannot verify this yet", which the spec explicitly named as an acceptable outcome.

It did not. A brute force over 5 `provider` × 9 `agent` × 5 `contentHash` × 3 domain candidates — 540 recovered addresses — found exactly one mapping that recovers the declared signer:

- `provider` = the provider **slug** (`"deep3-labs"`), not the display name
- `agent` = `eip155:{chainId}/erc721:{registry}/{tokenId}`, registry checksummed exactly as the document writes it
- `contentHash` = `keccak256(utf8(RFC-8785(document minus assessment.signature)))`

It recovers `0x27A6265e6daf8d9935A3031f2E7cDC4bDFbe2Ebe` on **all three** live Deep3 documents, so it is a mapping and not a coincidence on one fixture.

The spec axis of review re-implemented RFC-8785 and recovery **from scratch** and reproduced it, re-fetched the live document (byte-identical to the fixture, so the fixture is not fabricated), and mutation-tested the strategy: flipping `provider.id` to `provider.name` breaks 8 tests including all three `verified` ones. The verdicts come from real recovery, not from construction.

## What real documents get today

| Document                      | Verdict                                             |
| ----------------------------- | --------------------------------------------------- |
| Deep3 Labs × 3 live agents    | `verified`                                          |
| AsterPay KYA (2340)           | `unverified` — **no signature block at all**        |
| AsterPay KYA (1380)           | `unverified` — **its advertised resolver URL 404s** |
| Deep3, tampered               | `mismatch`                                          |
| An unknown provider, tampered | `unverified`                                        |

Those two AsterPay rows are the point of the package. A provider published on the graph, listed as a trust source, that signs nothing and has a dead endpoint. Nobody was looking.

## The last row is a deliberate trade, and it is the most important decision here

Review found that `mismatch` was reachable for a provider we have never studied: a future provider using the same three field names but a different `agent` encoding would pass the shape check, recover some other address, and get flagged. That is a red flag raised against someone who did nothing wrong — and it is the most damaging verdict this package can emit.

So confirmation is now scoped to the provider it was established against. `confirmedProviderIds` replaces a flat `confidence`, because the old field asserted something untrue at the type level: that a strategy was confirmed _full stop_, when what was established was that reconstruction recovers _Deep3's_ signer from _Deep3's_ documents.

`verified` is deliberately **not** gated the same way, and the asymmetry is principled rather than convenient: recovering exactly the declared signer by accident is cryptographically implausible, so a `verified` result retroactively proves the reconstruction was correct. A `mismatch` proves nothing — it is equally consistent with tampering and with us guessing the encoding wrong. Different evidential weight, different gates.

**The cost, stated plainly:** an unconfirmed provider now gets `unverified` even when their document is genuinely tampered. We give up a true positive about a stranger rather than ever cry wolf about one. In practice little is lost — for an unknown provider we could never distinguish tampering from our own error, so the old behaviour was not detecting fraud, it was guessing. It is in the README's "what it cannot verify", and it makes `confirmedProviderIds` a permanent manual maintenance surface.

## Other things worth knowing

**RFC-8785 is hand-written** rather than added as a dependency (~60 lines, viem was the only permitted runtime dep). Standards review read it closely: the RFC's own Appendix B vectors are genuinely used — `1e+23`, `9.999999999999997e-7`, `5e-324`, `-0 → "0"`, the 21-digit boundary — and key sorting is by UTF-16 code unit. The U+1F600-before-U+FB33 test is precisely the case separating UTF-16 from UTF-8 order; had it been wrong, signature verification would have broken silently on some documents. Lone surrogates are now rejected rather than re-escaped.

**`uses` was a third ambiguous predicate**, beyond the two the spec named. `has trust assessment`, `provided by` and `uses` each resolve to two atoms by label. Each was resolved once with an explicit multiple-match check, disambiguated by edge count, and frozen inline with its date and derivation. Label resolution never happens at runtime.

**Prettier**: a package-local `erc8004/.prettierrc.json` encodes `sdk/`'s actual style (4-space, double-quote, no bracket spacing). Matching the sibling and passing the root config are mutually exclusive, so a local config gets both without touching the repo's 139-file backlog.

## Verification

```
bun run build        → exit=0   (ESM + .d.ts for all 19 modules)
bun run test         → 144 passed | 2 skipped
bunx tsc --noEmit    → exit=0
grep -rn ": any"     → no hits
bun run format:check → clean
ERC8004_LIVE=1       → 2 passed against real mainnet
```

## Known slip

`erc8004RegistrySource` shipped in `20b0a9e` and its test in `3dd8d37`, against `workflow.md`'s "tests ship in the same commit as the feature". Not rebased away — recorded in the post-mortem with the root cause (the test file held two suites, and the right fix was splitting the file, not deferring the test).

ADR 0019 records the two public-surface deviations: `verifyAssessmentSignature` is async because viem's `recoverTypedDataAddress` is, and `getCapabilities` returns one `Capabilities` per source because collapsing them would drop provenance or silently pick a winner.

## Which tier of the evidence ladder does this serve?

Tiers 1 and 2 — it makes the signals that already exist legible and checkable. It writes nothing. The rungs above it are Phases 2 and 3.
