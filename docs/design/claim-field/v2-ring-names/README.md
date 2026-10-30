# Claim field v2, updated

Same as the earlier `docs/design/claim-field/v2/`, plus one change: **the legend grid under the field is gone**. Each ring now names itself on the field, at six o'clock, with its count (`uses 7`), outside the turning wrappers so the name holds still while the dots pass over it. A folded ring reads `+N other predicates` and lists its members in a `title`. The per ring counts stay available to screen readers in an `sr-only` list.

Built on `feat/agent-panel-tabs` at `b5682d9`. `tsc -b`, `eslint`, `prettier --check`, `check:tokens` and the full `vitest` suite (518 passing) are green.

Apply from the repo root: `git apply claim-field/claim-field-v2.patch` (it replaces the earlier patch; apply on a clean tree), or copy `files/` over the repo.
