# Claim field v2: the code, ready to apply

Built on `feat/agent-panel-tabs` at `b5682d9`. Checked there: `tsc -b`, `eslint`, `prettier --check`, `check:tokens` and the full `vitest` suite (518 passing, including the AtomPanel claim field tests) are green, and the field was rendered in Chromium for 3 predicates, 250 on one, 9 predicates (fold) and zero.

## Apply

From the repo root:

```bash
git apply --check docs/design/claim-field/v2/claim-field-v2.patch
git apply docs/design/claim-field/v2/claim-field-v2.patch
```

Or copy `files/` over the repo: same content, same paths.

## What it touches

| file | what |
|---|---|
| `app/src/components/atom/ClaimField.tsx` | rewritten: loupe, card, grain, fold, alarm ring, zero state, legend. Same props, so `AtomPanel` and `AgentClaims` need no change |
| `app/src/components/atom/use-claim-loupe.ts` | **new**: the loupe's rAF loop (glide, lock on arrival, 4 s tour, pointing via hover and focus, reduced motion) |
| `app/src/components/atom/claim-field-geometry.ts` | additions only: `MAX_RINGS`, `foldGroups`, `claimGrain`, `dotDiameter`, `SIZE_BY_POSITIONS`, `LOUPE`, `loupeRest`, `loupeLine` |
| `app/src/components/atom/__tests__/claim-field-geometry.test.ts` | tests for the fold, grain count, dot size at zero positions, loupe rest and line |
| `app/src/index.css` | one token in `@theme` (`--claim-dot`), and the `.arp-cf-*` block before the manifesto section |

## Things to know

- **Size by positions** is on (`SIZE_BY_POSITIONS = true` in the geometry file). Set it to `false` and every dot is 10px. Record the decision in ADR 0073's follow up or a new ADR.
- **Plain CSS classes, not utilities**, on purpose: the Tailwind silent failure and the unlayered `:focus-visible` and `button` rules. Every value is a token.
- **The opposition ring is an `outline`**, not a `box-shadow` (ui.md forbids shadows).
- The card keeps `data-claim-sentence` (`none` until a claim is read, `one` after), which the existing AtomPanel test reads.
- `CLAIM-FIELD-V2.md` is the spec, `claim-field.html` the visual reference. Every name in its `CASES` is a sample: never ship one.
