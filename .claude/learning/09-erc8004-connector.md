# 09 — `@arp-protocol/erc8004`: the source-neutral ERC-8004 read connector

**Task:** `tasks/07-erc8004-connector.md`
**Completed:** 2026-09-16
**Commit:** `cba9aa5` (on top of `032d851`, `7d899ef`, `238b30f`, `20b0a9e`, `3dd8d37`, `430ed00`)
**Verifier verdict:** PASS

## What shipped

- `erc8004/src/canonicalize.ts` — hand-written RFC 8785, ~70 lines, rejecting lone surrogates; tested against the RFC's Appendix B number vectors and the §3.2.3 property-ordering example.
- `erc8004/src/signature.ts` — EIP-712 verification with per-provider confirmed value-mapping strategies and three verdicts (`verified` / `mismatch` / `unverified`).
- `erc8004/src/freshness.ts` — `fresh` / `stale` / `unknown` against the provider's own declared `validUntil`.
- `erc8004/src/assessment.ts` — resolver fetch + narrowing, returning typed results (`http`, `not-json`, `malformed`, `timeout`, `network`, `skipped`, `no-resolver-url`) rather than throwing.
- `erc8004/src/sources/source.ts` — the `TrustSource` interface, with `getMarkets` optional on purpose.
- `erc8004/src/sources/intuition/` — graph source; the only place in the package where a term ID may appear. `terms.ts` freezes every predicate ID with its derivation and date.
- `erc8004/src/sources/erc8004-registry/` — reads `ownerOf` / `tokenURI` straight off the identity registry on Base, BSC and Ethereum. No graph, no API key, no TRUST.
- `erc8004/src/profile.ts` — merge layer, `getAgentProfile`, `AllSourcesFailedError`, per-field provenance, conflicts kept rather than resolved.
- `erc8004/test/` — 144 tests, 11 files, hermetic against 15 fixtures recorded live from mainnet on 2026-09-16; one opt-in live smoke behind `ERC8004_LIVE=1`.
- `erc8004/README.md` — one-call example, "Running it without Intuition", and an explicit "What it cannot verify" section.
- `.claude/choices/0019-erc8004-connector-surface-deviations.md` — the two spec-surface deviations plus the strategy-confidence restructure.

## Surprises

- **The signature actually verifies.** The task spec framed the `provider` / `agent` value mapping as a genuine unknown and explicitly authorised shipping `unverified` across the board. It was not necessary. A brute force over 5 `provider` × 9 `agent` × 5 contentHash × 3 domain candidates (540 distinct recovered addresses) found exactly one mapping that recovers Deep3's declared signer, and it holds across all three of their live documents. Lesson: the spec's "expected outcome" was a floor, not a ceiling — the ten minutes of exploration before writing any package code changed the whole shape of the deliverable.
- **`provider` is the slug, not the display name.** `provider.id` (`"deep3-labs"`), not `provider.name` (`"Deep3 Labs"`). Plausible-looking and wrong is exactly the failure mode the "do not fabricate a mapping that passes on one fixture" instruction was guarding against; the defence was testing across three documents, not across one.
- **A third ambiguous predicate.** The spec named `has trust assessment` and `provided by` as needing build-time resolution. `uses` is a third: two atoms by label, 183 edges against 1. The ambiguity is broader than the spec's list, so the "never resolve by label" rule earned its keep on a case nobody had written down.
- **Appendix B already published two of the three.** `has trust assessment` and `provided by` are in `docs/07`'s Appendix B verbatim, despite the spec saying they were "not in the confirmed set". Deriving them independently and *then* finding they matched was a stronger result than reading them off — it cross-validated the derivation procedure itself.
- **Half the live provider surface is unsigned or broken.** AsterPay KYA publishes no signature block at all, and its advertised resolver URL for Captain Dackie 404s. The package's value is as much in reporting this cleanly as in verifying the documents that are signed.
- **Coverage could not be measured.** `@vitest/coverage-v8` fails under bun ("Coverage APIs are not supported") and there is no `node` binary on this machine. Substituted a direct audit: every one of the public value exports is referenced by the suite.

## Decisions made

- **`mismatch` is scoped to providers whose scheme we confirmed** — a strategy confirmed against Deep3 is confirmed *for Deep3*; `confirmedProviderIds` binds it, so the package cannot accuse a stranger on an unvalidated reconstruction. ADR: `.claude/choices/0019-erc8004-connector-surface-deviations.md`.
- **`verifyAssessmentSignature` is async** — forced by viem's `recoverTypedDataAddress`, which the spec's own "no new dependencies" rule mandates. ADR: same.
- **`getCapabilities` returns `Capabilities[]`** — collapsing per-source results would drop provenance or pick a winner, both hard-rule violations. ADR: same.
- **`getMarkets` optional on `TrustSource`** — a source that cannot see stake declines the method rather than returning `[]`, because "nobody is backing this" and "we cannot see backing" are opposite facts. Specified in the task; recorded here because it shaped every downstream type.
- **Package-local `.prettierrc.json`** — matching `sdk/`'s real 4-space/double-quote style and passing `prettier --check` are mutually exclusive under the root config. A local config gets both without touching the pre-existing ~139-file backlog.
- **`PROVIDED_BY` demoted to a comment** — the derivation is worth keeping, an unreferenced export is not. This package always walks from the agent, so the trust pattern's fourth edge is never traversed.

## Rules touched

- `.claude/rules/code.md` — sufficient. Three findings in review all traced back to it (unused exports, typed errors at boundaries, naming), which is the rule working as intended rather than a gap in it.
- `.claude/rules/workflow.md` — sufficient, and it caught a real slip. See below.
- `.claude/rules/metamask-delegation.md` — not loaded; this task touches no delegation surface.
- No rule changed, so no rule-change ADR is owed.

### Process slip worth recording

`workflow.md` says *"Tests that go with a feature ship in the same commit as the feature."*
`erc8004RegistrySource` shipped in `20b0a9e`; `test/registry-source.test.ts` shipped in `3dd8d37`.
The cause was that the test file also contains the portability describe block, which needs the client
from the later commit, and the file could not be split across two commits. The correct fix was to
split the *test file* — a source-level suite in `20b0a9e` and a portability suite in `3dd8d37` — not
to defer the whole file. Not corrected by rebase, on instruction; recorded here instead.

Related: the first commit (`032d851`) is scaffolding only, so `bun run lint` reports TS18003 at that
single commit. Bisect hygiene, not a deliverable. If a future task scaffolds a workspace, fold the
config into the first commit that also adds a source file.

## Suggestions for future tasks

- **Spend the first ten minutes on the hardest unknown, before any structural code.** Resolving the
  signature mapping first turned a "we cannot verify this yet" deliverable into a working one, and it
  would have been far more expensive to discover after the package was built around the pessimistic
  assumption.
- **Validate an empirical finding across every instance you can reach, not the one in front of you.**
  Three Deep3 documents, not one. The same discipline applies to the predicate derivations: edge
  count plus an independent cross-check against Appendix B, not a single query.
- **When a verdict names a third party, ask what the type is actually entitled to claim.** The
  false-`mismatch` bug was invisible on every fixture and only appears for a provider that does not
  exist yet. A confidence grade that is not scoped to what was confirmed will drift into over-claim.
- **Prefer mutation-testing a security-critical branch over adding another happy-path test.** Two
  mutations (flipping `providerField`, removing the `confirmedForProvider` gate) proved the new gate
  is load-bearing in a way that no additional assertion would have.
- **For the follow-up UI task**, `AgentProfile.conflicts`, `sourceErrors` and `marketCapableSources`
  exist specifically so a panel can show "we could not check this" distinctly from "this failed" and
  from "nobody staked". Do not collapse them in the presentation layer.
- **`confirmedProviderIds` is a maintenance surface.** Adding a provider means recovering their own
  declared signer from their own live documents first. Never widen it to make a test pass.
