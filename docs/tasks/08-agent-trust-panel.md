# Task 08 — The agent trust panel

> **Status: COMPLETE** (2026-09-16). Branch `feat/agent-trust-panel`, commits `9c60ef6..b8a63ee`.
> Post-mortem: `.claude/learning/10-agent-trust-panel.md`. ADRs `0018` (design and edge join) and
> `0020` (package-local Prettier config). `ui-reviewer` pass at `ec65620`; `task-verifier` pass.
>
> **Two lines below are stale and were deliberately not followed.** The acceptance criterion "Stake
> control present, disabled" and the out-of-scope entry "Any mainnet write, including enabling the
> stake control" predate ADR 0017, which was accepted the same day and states "The control ships
> enabled" and "Supersedes: the 'ship it disabled' provision". The body of this task (§"The staking
> control — live, with real TRUST") already says the same. The control ships **enabled**. No real
> stake transaction has been executed; the first one is the operator's.
>
> Phase 1 · options O1 + O6 of `docs/08`. Serves tiers 2→3 of the evidence ladder (`docs/09` §2): it
> makes existing ratings checkable, and it builds the surface where staked conviction becomes
> possible.

## Objective

A route that renders, for any of the 28,648 ERC-8004 agents, the full trust surface in one view:
every provider's assessment with its signature verified and its freshness enforced, the agent's
capability triples, and the live support/opposition market on each provider claim.

This is the Phase 1 deliverable and the artifact to put in front of Intuition and Deep3 — a working
thing rather than a proposal.

## Why it matters

Nobody ships this today. Providers publish signed documents and declare freshness windows, and no
consumer checks either. The panel's job is to make the _quality of a trust signal_ visible next to
the signal itself: a `67.25` backed by one reviewer and a `55.35` backed by twenty-six must not look
the same on screen.

The staking surface Intuition built to answer _whose opinion deserves weight_ has one or two
positions per vault, all bootstrap deposits. It has no front end. This is that front end.

## Depends on

`@arp-protocol/erc8004` (task 07). Do not start until its surface is stable. Consume it — do not
reimplement any of its reads in the app.

## Required reading

- `.claude/rules/ui.md` — **the anti-template rules are binding.** No gradient backgrounds, no
  universal `rounded-xl`, no emoji, no three-column hero, no generic skeleton loaders. Every shadcn
  primitive is restyled before shipping; default classes are a rejection on sight.
- `.claude/rules/code.md` — a component never calls a service directly; it calls a hook, which calls
  a service. Services never import React.
- `docs/05_UI_DESIGN.md` — the visual spec.
- `docs/09_POSITIONING_AND_PLAN.md` §2 — what the panel is arguing.

## Routes

**`/agent/:chainId/:tokenId`** — the panel.

**An entry point.** Capability search is Phase 2 and out of scope, so for now: a lookup form
(chain + token id) plus a short list of real agents worth opening, including the three task-07
fixtures. Label that list honestly as a starting set, not a ranking — an empty-state that explains
what would normally be there, per `ui.md`.

## What the panel shows

**Identity.** Name, description, image, the CAIP-19, the atom term ID, a link to the explorer. When
the metadata is the ERC-8004 fallback (`Agent 8453:6649` + the `8004scan.io` URL), **say so** — 54%
of the cohort is in that state and hiding it would misrepresent the data.

**Assessments**, one row per provider:

- score and dimensions
- **reviewer count, given equal weight to the score.** A score resting on one reviewer must read as
  weak at a glance — this is the panel's central editorial claim and the design should carry it.
- signature verdict: `verified` / `mismatch` / `unverified`. `mismatch` is a red flag and must be
  impossible to miss. `unverified` states the reason plainly; it is not a failure of the provider.
- freshness: fresh, or stale with how long past its own declared window
- a link to the resolver document so anyone can check the raw source

**Capabilities.** The graph's `use`, `has type`, `has category`, `has tag`, `available on` triples.
When there are none — the common case, 194 `use` triples exist across the entire graph — the empty
state says that plainly and explains it is what Phase 2 fills in. Do not pad it.

**The curation market**, one row per `has trust provider` claim: support market cap, opposition
market cap, **position count and distinct stakers**. Never a bare market cap — a market this thin is
moved by one participant and a lone number would misrepresent it.

## The staking control — live, with real TRUST

**Authorised by the user on 2026-09-16**, which is the per-session mainnet confirmation
`CLAUDE.md` requires. Recorded in ADR 0017. The control ships **enabled**.

This is the point of the panel. A curation market with a disabled button is a mockup; ARP putting its
own capital behind its own reads is the credible commitment the positioning argues for
(`docs/09` §6).

Target — Intuition **mainnet**, not testnet:

|            |                                              |
| ---------- | -------------------------------------------- |
| chain id   | `1155`                                       |
| RPC        | `https://rpc.intuition.systems/http`         |
| explorer   | `https://explorer.intuition.systems`         |
| MultiVault | `0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e` |

`intuitionMainnet` is already defined in `sdk/src/client.ts` — reuse it, do not redefine it.

### Safety rails — all of these are acceptance criteria, not suggestions

Real money, and the operator is away while this is built. Every one of these is required:

1. **Chain guard.** Refuse to build a transaction unless the wallet is on `1155`. Offer an explicit
   switch (`wallet_switchEthereumChain`); never assume. A stake sent from the wrong chain is the most
   likely way to lose funds here.
2. **Explicit amount, no defaults that spend.** The amount field starts empty. No preset that
   submits, no "quick stake".
3. **A hard ceiling in the UI**, `VITE_MAX_STAKE_TRUST`, defaulting to **1 TRUST** per transaction.
   Above it the control refuses and says why. A fat finger must not be able to drain the wallet.
4. **A confirmation step before the wallet opens**, restating in plain words: which claim, which side
   (support or oppose), how much, and the vault's current position count — so the user knows when
   they are about to be the only participant in a market.
5. **Never auto-stake.** No action on mount, no retry-on-failure that resubmits, no stake triggered by
   navigation.
6. **Show the real cost.** Deposits on Intuition carry protocol fees and the bonding curve means the
   shares received are not linear in the deposit. Read the actual on-chain cost and display it before
   signing rather than implying a 1:1 conversion.
7. **Post-transaction, link the explorer** and refetch the market rather than optimistically
   rendering a result that may not have landed.

### The call, exactly

Source: the vendored `intuition` skill (`.claude/skills/intuition/`), `operations/deposit.md` and
`reference/reading-state.md`. Follow those files — the shapes below are the summary, not a substitute.

```solidity
function deposit(address receiver, bytes32 termId, uint256 curveId, uint256 minShares)
    payable returns (uint256)
```

Session setup, once, cached:

- `getBondingCurveConfig()` → `(registry, defaultCurveId)`. **Query it; do not hardcode.** Mainnet is
  currently `1` (linear), but it is governance-configurable.
- `getGeneralConfig()` → carries `minDeposit`. Reject anything below it in the UI, with the real
  number, before the wallet opens.

Per stake:

- **`termId` is the triple's term ID** for _support_ — the `has trust provider` triple itself.
- For _oppose_, deposit into the **counter-triple**: `getCounterIdFromTripleId(tripleId)`. Every
  triple gets a counter vault automatically. Do not invent an "oppose" mechanism; this is it.
- **`previewDeposit(termId, curveId, assets)` → `(shares, assetsAfterFees)`.** Call it before every
  transaction. Display both: the shares actually minted, and how much of the deposit survives fees.
  Multiple fee layers apply (protocol, entry, atom deposit fraction for triples) — the difference is
  not rounding and the user must see it.
- **`minShares` is slippage protection.** Derive it from the preview with a small tolerance. Do not
  pass `0` — that disables the protection entirely.
- `msg.value` = the deposit amount.
- `receiver` = the connected account. Must be non-zero; never default it to the zero address.

Reading vault state for the market display: `getVault(termId, curveId)` →
`(totalAssets, totalShares)`, `currentSharePrice(termId, curveId)`, and `getShares(account, termId,
curveId)` for the user's own position. The GraphQL `position_count` gives distinct stakers.

Simulate before executing — `reference/simulation.md`. A revert with no message almost always means a
bad `bytes32` or a missing `curveId`.

### For whoever implements this

**Do not execute a real stake transaction to test your work.** Verify with unit tests over a mocked
wallet client, type-checking, `previewDeposit` read-only calls, and `eth_call` simulation. The first
real transaction is the operator's, deliberately, with their own wallet. An agent spending someone's
TRUST to check its own code is not acceptable, and a passing test suite is not a reason to try it.

## Design stance — two sources, and how they resolve

`.claude/rules/ui.md` and the global `frontend-design` skill both exist and both are anti-template.
Where they differ, **`ui.md` wins** — it is this project's established system, and a panel that does
not match `/hire` and `/tool/:id` is worse than one that is merely restrained.

Concretely: `frontend-design` suggests gradient meshes, noise, dramatic shadows and grain. `ui.md`
forbids gradients and shadows and calls for hairline borders. Follow `ui.md`.

What to take from `frontend-design` is its _stance_, which `ui.md` shares: commit to a direction,
choose characterful type rather than the safe default, make one thing memorable, never ship the
generic. Spend that on **typography and information design** — the two places `ui.md` leaves open.

The panel's editorial claim is that _a score's weight is not its number_. A `67.25` resting on one
reviewer and a `55.35` resting on twenty-six must not look alike. That contrast is the one thing worth
designing hard; everything else stays quiet.

## Data layer

- Hooks under `app/src/hooks/` own lifecycle and call the connector. No component touches it directly.
- Loading states carry the shape of what is coming, not a grey block on a grey background.
- **Every network boundary can fail, and several will**: a resolver that 404s, returns HTML, or times
  out is normal here, not exceptional. Render the row with what is known and state what could not be
  fetched. A provider whose document is unreachable is itself information.
- The panel reads mainnet regardless of the wallet's connected chain. Make that explicit in the UI —
  a reader must never mistake mainnet data for testnet.

## Tests

Per ADR 0011 the app test scope is services and hooks, not pages.

- Hook tests over a mocked connector: success, partial failure (one resolver down), no providers,
  agent not found.
- Any pure formatting helper (freshness phrasing, TRUST amounts, distinct-staker copy) unit-tested.
- Assert the panel requests mainnet, not `deployments.chain.graphqlUrl`.

## Acceptance criteria

- [~] `/agent/8453/6649` renders the bare fixture correctly, fallback metadata labelled as such —
      the view model was checked against live mainnet data; **no browser was available, so the
      render itself is unverified.** Open it once.
- [~] `/agent/8453/2340` renders the rich fixture with both providers and the full capability set —
      same caveat. Live read returns both providers, 14 capability edges, scores 59 and 55.35.
- [x] A provider with an unreachable resolver renders as a row stating what failed, not a crash
- [x] Signature verdicts are displayed exactly as the connector reports them — the UI never upgrades
      `unverified` to `verified`
- [x] Distinct stakers shown wherever a market is shown
- [x] ~~Stake control present, disabled, with its reason stated~~ — **superseded by ADR 0017.** The
      control ships enabled, behind the ADR's seven safeguards.
- [~] `bun run test`, `bun run lint`, `prettier --check` all clean — test and lint clean;
      `prettier --check` is clean for every file this task touched and red on 23 pre-existing files
      (ADR 0020). It was never achievable as written: 180 files fail repo-wide.
- [x] Keyboard reachable, visible focus rings, labelled controls, WCAG AA in dark mode — contrast
      measured numerically by `ui-reviewer`, not eyeballed.
- [~] Renders at 400px wide without horizontal body scroll — verified by reading code and built CSS,
      not in a browser.
- [x] `ui-reviewer` pass, then `task-verifier` pass

## Out of scope

- Capability search or ranking across the cohort — Phase 2.
- ARP's own assessment — Phase 3. The ARP row shows `insufficient-evidence` and says why.
- ~~Any mainnet write, including enabling the stake control.~~ **Superseded by ADR 0017**, accepted
  the same day this task was written. Mainnet *deposits into existing vaults* are in scope and
  shipped; deploying any ARP contract to mainnet remains out of scope and unauthorised.
- Redesigning existing pages. New components share the existing design tokens; do not refactor
  `/hire` or `/tool/:id` in this task.
