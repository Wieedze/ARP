# feat(ui): the agent trust panel, and live TRUST on mainnet

**Branch** `feat/agent-trust-panel` → `feat/erc8004-connector` · 12 commits · 40 files · Phase 1, options O1 + O6 of `docs/08`.

Stacked on the connector PR, which it consumes. Review order: strategy → connector → this. The pin-writes PR is a sibling and unrelated to this one.

---

## What ships

Two routes.

`/agents` — the whole mirrored cohort, all 28,648 of it, paged 25 at a time and ordered only by measures of evidence: how many statements exist about an agent, or what is staked on its atom. Never by score — that is the number the panel exists to qualify, and one descending score column would undo the argument in a single control. The page says in as many words that neither order is a quality ranking. Below it, the token-id form stays: it is the only route to an agent on BSC or Ethereum, labelled `registry only — no trust edges in the graph` — the connector's portability surfacing in the UI.

`/agent/:chainId/:tokenId` — the panel. Identity left, assessments and capabilities right. Both routes lazy-loaded; the panel is a 69 kB chunk most visits never fetch.

## The design, and the one thing it argues

Every trust UI in this space prints a number. The measurements in `docs/08` say the number is close to meaningless: the median agent in the cohort is scored on **one reviewer**, and three different agents currently carry an identical `67.25` — the same single review propagated through a deterministic curve.

So the panel's editorial claim is that **a score's weight is not its number**, and it is carried by one device: _type size is set by evidence, not by score_. Reviewer count maps to seven weight bands; the band picks the score's size (22–72px), its colour and its numeral weight; an evidence rail underneath draws one hairline tick per reviewer. Each band carries a caption so the device is never merely decorative — `"One reviewer. A single opinion, priced as a score."`

Live, right now:

| Agent           | Score | Reviewers | Renders              |
| --------------- | ----- | --------- | -------------------- |
| Captain Dackie  | 64.36 | 1,445     | largest, full weight |
| Clawnch         | 55.35 | 26        | mid                  |
| Agent 8453:6649 | 59.95 | 2         | small, muted         |

`59.95` and `64.36` are four points apart and would look interchangeable in a table. Here they do not.

That is the whole design investment. Everything else stays quiet, per `ui.md`.

**No new typeface**: the app had already committed to Inter + JetBrains Mono, a score is data so mono with tabular figures is the right face anyway, and a panel that did not match `/hire` would be worse than a restrained one. The palette stays monochrome + cyan with exactly one addition — `--color-alarm` at 6.61:1 — used by two things only: the `mismatch` badge and its row's left rule. "Real TRUST on mainnet" needed to be equally unmissable and got an inverted monochrome bar rather than a second hue, so the two alarms can never blur into each other. ADR 0018 records what was rejected: reusing cyan, a display serif, and scaling by the score.

## Real money, and the seven guards

The staking control is **live against Intuition mainnet chain 1155** (ADR 0017 — explicit per-session authorisation, which `CLAUDE.md` requires). Support deposits into the claim's own vault; oppose deposits into the counter-triple via `getCounterIdFromTripleId`, which exists automatically for every triple.

| #   | Guard                                | Where                                                                            |
| --- | ------------------------------------ | -------------------------------------------------------------------------------- |
| 1   | Chain guard                          | `assertMainnetWallet`, called **twice** by `submitStake`                         |
| 2   | No spending default                  | amount field starts empty, no preset submits                                     |
| 3   | Ceiling                              | `VITE_MAX_STAKE_TRUST`, default 1 TRUST; minimum read from on-chain `minDeposit` |
| 4   | Confirmation before the wallet opens | `ConfirmStep`                                                                    |
| 5   | Never auto-stake                     | no effect in the path; callbacks, not a mutation                                 |
| 6   | Real cost                            | `previewDeposit` on every quote                                                  |
| 7   | `minShares` never zero               | `deriveMinShares`, 1% tolerance, throws rather than return 0                     |

Guard 1 deserves a note: the chain is checked against the client's configured chain **and** the wallet's own `eth_chainId`. A client pinned to 1155 reports 1155 whatever the wallet is actually on, so the second check is the one that matters.

Two guards beyond the ADR: `receiver-mismatch`, and an `eth_call` simulation before every signature.

Guard 4 names the vault's current position count including `"none — you would be the first"`. These markets carry one or two positions; a user should know when they are about to be the entire market.

**No transaction was executed while building this.** Verification was unit tests over a mocked wallet client, read-only mainnet calls, and `simulateContract` under a balance override. The first real stake is yours, deliberately.

## What the panel refuses to do

- Fallback metadata is labelled. `Agent 8453:6649` is the indexer's stand-in, and 54% of the cohort is in that state.
- Signature verdicts render exactly as the connector reports them. The UI never upgrades `unverified` to `verified`.
- A stale document says how far past its own deadline it is. **This is not hypothetical: all three Deep3 documents currently declare `validUntil 2026-09-12` and today is later than that.** The provider covering 99.99% of the cohort is serving assessments past its own freshness window, and nothing else in this ecosystem surfaces that.
- Markets always show position count, never a bare market cap.
- A provider whose resolver does not answer renders as a row stating what failed, not a crash.

## Verification

`tsc -b` 0 · `lint` 0 · `test` 124 tests across 12 files (was 51) · `build` 0. Read-only mainnet checks confirmed `defaultCurveId` 1, `minDeposit` 0.01 TRUST, the counter-triple, and `previewDeposit`.

## Gaps, stated plainly

- **Nothing was visually verified.** There is no browser in the build environment. Rendering and the 400px criterion rest on code review plus measured contrast ratios. **Open `/agent/8453/6649` and `/agent/8453/2340` before showing anyone.**
- `prettier --check` is not green: 23 pre-existing `app/` files fail, none of them touched here. ADR 0020 records the package-local config; clearing the 23 is a separate chore.
- Hook tests target `agentProfileQueryOptions` rather than `renderHook`, since ADR 0011 rules out a DOM.
- The task spec claimed AsterPay's Captain Dackie resolver 404s. It answers 200 today. The 404 path is unit-tested, not observed live.

## Two things the author flagged rather than quietly fixing

The task file contradicted itself — its checklist said the stake control ships _disabled_ while its body and ADR 0017 said _enabled_. The stale lines were struck in place rather than deleted, so the contradiction and its resolution both stay visible in history.

`.claude/rules/security.md` read "Mainnet deployment … is out of scope" — true for deployment, misleading about deposits the moment ADR 0017 authorised them. Left alone rather than edited mid-task, which was the right call; corrected separately on the strategy branch, where the rule now distinguishes deployment from deposits and adds that no agent may ever sign a mainnet transaction.

## Which tier of the evidence ladder does this serve?

Tier 2 → 3. It makes existing ratings checkable, and it builds the surface where staked conviction becomes possible — the first place in this ecosystem where anyone can put capital behind "this provider's opinion of this agent is worth believing".
