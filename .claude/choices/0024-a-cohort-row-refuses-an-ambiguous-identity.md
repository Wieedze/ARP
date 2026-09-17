# 0024 — A cohort row refuses an ambiguous identity rather than picking one

**Status:** Accepted
**Date:** 2026-09-16
**Triggered by:** `tasks/10-agent-directory-full-cohort.md`

## Context

Task 10 requires that each row's link be derived from the `same as` CAIP edge, not parsed out of the
display label — `Agent 8453:6649` looks like it carries its own token id, and relying on that would
break for the half of the cohort that has a real name and silently mis-link anything whose label
convention drifts.

Reading the edge exposed two shapes that a naive "take the first `same as` object" would get wrong,
both live on mainnet on 2026-09-16:

- **Clawnch** (`0x20dd3a62…`) carries two `same as` edges: its CAIP-19 identity and `did:web:clawn.ch`.
  The second is a true statement about a different namespace, not a second agent.
- **`Ouro Proof-of-Compute Oracle`** (`0x19510a00…`) carries **sixteen** `same as` edges, every one of
  them an ERC-8004 token id on Base — 18744, 18892, 21550, 21202 and twelve more. A second atom with
  the same label carries sixteen more. One atom is claiming to be sixteen agents.

The cohort query cannot page every edge of every row, so it reads a sample and must decide what the
sample proves.

## Decision

The cohort read selects a **sample of four `same as` edges plus a filtered aggregate count** of all of
them (`IDENTITY_SAMPLE_LIMIT = 4`). `AgentListing.ref` is set only when every edge was seen
(`identityEdgeCount <= IDENTITY_SAMPLE_LIMIT`) **and** exactly one of them parses as an ERC-8004
CAIP-19 asset id. Otherwise `ref` is `null` and `isIdentityAmbiguous` is `true`.

Edges that are not ERC-8004 asset ids are dropped by `parseCaip19` rather than guessed at, so
Clawnch's `did:web` edge costs it nothing and its row still links to `/agent/8453/2340`.

A row with no `ref` renders without a link and says why in place of the identity:
`claims 16 identities — no single agent to open`, or `no ERC-8004 identity edge in the graph`.

## Alternatives considered

- **Take the first edge** — sends a reader to a panel the row may not be about, sixteen times out of
  sixteen for Ouro, and does it silently. This is precisely the "a guess that looks like an answer"
  failure the connector was built to avoid.
- **Link to all of them** — a row in a dense list cannot carry sixteen links, and truncating to the
  four sampled would present an arbitrary subset as the whole.
- **Filter ambiguous atoms out of the list** — they hold real statements and real stake, and the
  cohort total counts them. Hiding them would make the list disagree with the total printed above it.
- **Page every `same as` edge per row** — 25 extra round trips per page to disambiguate a handful of
  rows. The aggregate count answers the same question in the same query.

## Consequences

**Positive:**

- No row links to an agent it is not about.
- The two real anomalies on mainnet are visible as anomalies rather than smoothed into plausible
  rows, which is the directory doing the same job as the panel.
- `parseCaip19` is already the package's inverse of `toCaip19`, so "is this an ERC-8004 identity" has
  exactly one definition in the codebase.

**Negative:**

- The `Ouro` rows sit high in the evidence order (35 statements) and cannot be opened at all. A
  reader who wants to see one has to use the lookup form with a token id the row does not offer.
- `IDENTITY_SAMPLE_LIMIT` is a magic number in the query text. Four is enough to separate the three
  observed shapes and small enough not to bloat a 25-row read; it is not derived from anything.

**Neutral (worth knowing):**

- An atom with more than four `same as` edges is marked ambiguous even if only one is ERC-8004. That
  is conservative and, at the time of writing, hypothetical — every such atom found on mainnet
  claimed several ERC-8004 identities.
- Ambiguity is computed in the package, not in the UI, because only the package knows the sample
  limit its own query used.

## References

- Related rule: `.claude/rules/code.md`
- Related ADR: `.claude/choices/0014-agent-identity-as-caip10-atom.md`,
  `.claude/choices/0019-erc8004-connector-surface-deviations.md`
- Task: `tasks/10-agent-directory-full-cohort.md`
