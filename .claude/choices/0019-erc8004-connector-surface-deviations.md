# 0019 — `@arp-protocol/erc8004` public-surface deviations from the Task 07 spec

**Status:** Proposed
**Date:** 2026-09-16
**Triggered by:** `tasks/07-erc8004-connector.md`, two-axis review of `feat/erc8004-connector`

## Context

`tasks/07-erc8004-connector.md` publishes an exact public surface under "Surface":

```ts
verifyAssessmentSignature(doc): SignatureVerdict
getCapabilities(client, ref): Promise<Capabilities>
```

The shipped package deviates from both. `.claude/rules/workflow.md` says a rule or spec may be
broken with cause, but the break must be recorded. Both reviewers flagged the absence of this record.
This ADR is that record. Neither deviation is being re-litigated — both are sound; what was missing
was the paper trail.

A third change is recorded here too, because it also moved a published type: the signature strategy's
`confidence` grade became per-provider `confirmedProviderIds`. That one came out of the review rather
than the spec, but it changes the same surface and belongs in the same record.

## Decision

Three deviations, accepted:

**1. `verifyAssessmentSignature` returns `Promise<SignatureVerdict>`, not `SignatureVerdict`.**

Forced, not chosen. The task spec's own "Hard rules" section says: *"No new runtime dependencies.
`viem` is already in the repo and supplies `keccak256` and `recoverTypedDataAddress`."* viem's
`recoverTypedDataAddress` returns a `Promise<Address>`. The spec therefore mandates an async
primitive and a synchronous signature in the same document; they cannot both hold. The hard rule
wins over the illustrative surface listing.

**2. `getCapabilities(client, ref)` returns `Promise<Capabilities[]>`, one entry per source that
answered, not a single `Capabilities`.**

The spec's "Hard rules" also says: *"Provenance on every field. A consumer must be able to tell a
claim from an inference. Nothing is silently defaulted."* and, on the merge layer: *"Where two
sources disagree, keep both and mark the conflict; do not silently pick a winner."* Collapsing
several sources' capability sets into one object requires either dropping the per-source
`provenance` or choosing a winner between sources. Both are hard-rule violations. Returning one
`Capabilities` per source is the only shape that satisfies the rules the same spec states.

Note the single-source method on `TrustSource` still returns a single `Capabilities`. Only the merge
layer pluralises, which is where the multiplicity actually exists.

**3. `SignatureValueStrategy.confidence: "confirmed" | "speculative"` became
`confirmedProviderIds: readonly string[]`, and `SignatureAttempt.confidence` became
`confirmedForProvider: boolean`.**

The original grade asserted that a strategy was confirmed, full stop. What was actually established
is narrower: that reconstruction recovers *Deep3 Labs'* declared signer from *Deep3 Labs'* live
documents. A different provider can publish the same three field names (`provider`, `agent`,
`contentHash`) and encode `agent` differently. Under the universal grade, that provider's document
would pass the field-shape check, the confirmed strategy would build cleanly, recovery would return
an unrelated address, and the package would publish `mismatch` — a public accusation against someone
who did nothing wrong. Binding confirmation to `provider.id` makes the type say what is true.

`verified` is deliberately *not* gated by `confirmedProviderIds`; only `mismatch` is. The asymmetry
is the decision: vouching for a signature that demonstrably recovers to its declared signer costs
nobody anything, while accusing a stranger on an unvalidated reconstruction is the one error this
package exists to prevent.

## Alternatives considered

**For deviation 1:**

- **Reach into viem's bundled `@noble/curves` for synchronous secp256k1 recovery** — would keep the
  spec's signature, at the cost of depending on a transitive package viem does not export as public
  API. A signature checker whose correctness rests on an undeclared internal is a bad trade for a
  cosmetic type.
- **Add a synchronous crypto dependency** — directly violates "no new runtime dependencies".

**For deviation 2:**

- **Return a single merged `Capabilities` with a source-id on each `CapabilityRef`** — viable, and
  close. Rejected because `Capabilities` itself carries a `provenance`, and merging leaves that field
  with no honest value to hold: it would have to name one source or be dropped. It also destroys the
  information that source A returned *nothing* while source B returned a full set, which is exactly
  the kind of silent defaulting the rules forbid.
- **Return `Record<string, Capabilities>` keyed by source id** — same information, marginally more
  convenient to index, but it invites callers to hardcode `["intuition"]` and reintroduces the
  Intuition-shaped coupling the whole source abstraction exists to prevent. The array keeps callers
  iterating.

**For deviation 3:**

- **Keep the universal grade and accept the false-`mismatch` risk** — rejected outright. `mismatch`
  is the most damaging verdict the package emits.
- **Pin confirmation to the declared signer address rather than `provider.id`** — rejected: a
  provider legitimately rotating its signing key would fall out of confirmation, and an impersonator
  copying a known `provider.id` *should* be flagged, which address-pinning would prevent.
- **Drop `mismatch` entirely and return only `verified` / `unverified`** — rejected: a tampered
  document from a provider we *have* studied is a real, actionable red flag, and collapsing it into
  `unverified` would discard the package's most valuable output.

## Consequences

**Positive:**

- Every deviation is now traceable from the spec to a rule that forced it.
- Deviation 3 removes a class of false accusation the package could previously make about a third
  party, and encodes the scope of a confirmation in the type rather than in a comment.
- The `Capabilities[]` shape keeps per-source provenance intact, which the UI task will need in order
  to show a consumer where each declaration came from.

**Negative:**

- `verifyAssessmentSignature` being async means the "smallest useful unit" of the package — the pure
  signature check a third party might adopt on its own — cannot be used in a synchronous code path.
- Deviation 3 gives up a true positive: a provider outside `confirmedProviderIds` gets `unverified`
  even when their document is genuinely tampered. Recorded in the README's "what it cannot verify".
- `confirmedProviderIds` is a maintenance surface. Every new provider needs its scheme established
  empirically before the package can flag anything about them, and that is manual work.

**Neutral (worth knowing):**

- The package is unpublished, so none of these changed a surface anyone depends on yet.
- If a future EIP or ERC-8004 profile specifies the `provider` and `agent` encodings normatively,
  deviation 3 can narrow to a single spec-derived strategy and `confirmedProviderIds` becomes
  unnecessary. That would supersede this part of the ADR.

## References

- Related rule: `.claude/rules/workflow.md` (rule breaks must be recorded), `.claude/rules/code.md`
- Related doc: `docs/08_ERC8004_AGENT_LAYER_OPPORTUNITY.md` §4
- Related ADR: `.claude/choices/0015-adopt-canonical-intuition-erc8004-pattern.md`
- Triggered by post-mortem: `.claude/learning/09-erc8004-connector.md`
