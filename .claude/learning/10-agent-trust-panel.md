# 10 — The agent trust panel, with a live mainnet stake control

**Task:** `tasks/08-agent-trust-panel.md`
**Completed:** 2026-09-16
**Commit:** `b8a63ee` (branch `feat/agent-trust-panel`, 9 commits from `9c60ef6`)
**Verifier verdict:** PASS (second pass; first pass failed on dead surface)

## What shipped

- `app/src/services/erc8004-connector.ts` — the app's single `Erc8004Client`, pinned to the Intuition **mainnet** indexer. Never `deployments.chain.graphqlUrl`.
- `app/src/services/agent-trust.ts` — `AgentProfile` → `TrustPanelView`. Owns the two-edge join (`has trust provider` × `has trust assessment`) and the evidence-weight bands.
- `app/src/services/trust-stake.ts` — the whole staking surface: session reads, `previewDeposit` quoting, `deriveMinShares`, `assertMainnetWallet`, `simulateStake`, `submitStake`. The seven ADR-0017 safeguards are numbered in its header and each maps to a named function.
- `app/src/services/trust-format.ts` — freshness phrasing, TRUST amounts, distinct-staker copy, fetch-error sentences. Pure, no clock of its own.
- `app/src/hooks/{use-agent-profile,use-stake-session,use-claim-vaults,use-stake-actions}.ts` — lifecycle only. `use-stake-actions` returns callbacks, deliberately not a mutation.
- `app/src/pages/AgentTrustPanel.tsx` — `/agent/:chainId/:tokenId`.
- `app/src/pages/AgentDirectory.tsx` — `/agents`: lookup form + a starting set labelled as a starting set.
- `app/src/components/agent/` — 8 components + `evidence-scale.ts`.
- `app/src/lib/intuition-mainnet.ts` — chain 1155 constants, in their own module so a mainnet read can never be served from a testnet constant.
- `app/.prettierrc.json` — records the style `app/` was already written in (ADR 0020).
- 5 test files, 73 new tests (51 → 124 app-wide).
- `b8a63ee`, found on a last read-through after the verifier's punch list: the error branch said
  "Nothing was staked" for *every* failure, including one arriving after `writeContract` had already
  returned a hash, and offered a "Back" that returned to the primed confirmation step. The phase now
  carries the hash, says the deposit was broadcast and may still land, links it, and routes back to
  the empty form. None of the seven safeguards covered this; it was a double-spend path in the
  failure branch.

## Surprises

- **The task file contradicts itself.** Its body (§"The staking control — live, with real TRUST") says the control ships enabled; its acceptance checklist and out-of-scope list, written earlier the same day, say disabled. ADR 0017 resolves it and says so explicitly ("Supersedes: the 'ship it disabled' provision"). The stale lines were left in the task file — amending a spec mid-task is the scope move `workflow.md` warns about — so **the next reader of `tasks/08` will hit the same contradiction.**
- **`MarketSide.totalAssets` from the connector is the wrong number for a vault display.** It is the *term* total, folding in the triple's underlying atom vaults, and runs ~1,000× the vault balance (0.988 vs 0.0009875 TRUST on Clawnch's AsterPay claim). The panel reads `getVault` from the MultiVault instead, with `marketCap` as the indexer fallback. Caught by checking the indexer against the chain, not by reading types.
- **A `has trust provider` edge's object atom carries the provider's *homepage*, not its document.** The connector dutifully fetches `https://deep3.ai` and gets HTTP 500. That is a true read and not a document failure, and surfacing it as one would have libelled the provider. The provider edge's fetch result is never shown as the document's failure.
- **The two edges have nothing to join on but the document or the label.** The assessment atom carries no pointer back to the provider atom. When the document is unreachable — exactly when the row matters most — only the label prefix is left, so the join reports which method it used and the UI says "a naming convention, not a proof".
- **Prettier had never been green here.** 180 files fail repo-wide; the root config (2-space, single-quote) has never described `app/` (4-space, double-quote). The task's "`prettier --check` clean" criterion was unachievable as written.
- AsterPay's Captain Dackie resolver, which the task says 404s, resolves 200 today. The 404 path is covered by unit test, not by live data.

## Decisions made

- **One semantic alarm colour, scoped to `mismatch`; type size carries evidence, not score; join on document then label prefix.** ADR: `.claude/choices/0018-trust-panel-design-and-join.md`.
- **A package-local Prettier config for `app/`** rather than reformatting 43 pre-existing files inside a feature branch. ADR: `.claude/choices/0020-package-local-prettier-config-for-app.md`.
- **`receiver-mismatch` and pre-signature `eth_call` simulation** — two guards beyond ADR 0017's seven. Not ADR-worthy; they are `security.md` input-validation applied at a value boundary.
- **Hook tests target the exported `agentProfileQueryOptions` contract**, not `renderHook`. ADR 0011 rules out a DOM environment; this is the available shape and it covers all four scenarios the task names.

## Rules touched

- `.claude/rules/code.md` — sufficient, and it did the work. Both first-pass failures were "No dead weight" violations (an unused component prop, two unconsumed view-model fields). The rule is worth keeping mechanical.
- `.claude/rules/ui.md` — sufficient. Its explicit "focus rings visible, not `focus:outline-none` without a replacement" is what forced the unlayered `:focus-visible` block in `index.css`; note that Tailwind v4 utilities live in `@layer utilities`, so unlayered rules in `index.css` win regardless of specificity. Worth remembering before anyone "fixes" that block.
- `.claude/rules/security.md` — the contract half did not apply (no Solidity). Its deployment-posture section now has a live exception (ADR 0017) that the rule text does not mention; the rule still says "Mainnet deployment … is out of scope", which is true for *deployment* and now misleading about *deposits*. Not wrong enough to change mid-task, but a future reader should read ADR 0017 alongside it.
- `.claude/rules/workflow.md` — sufficient. The fail→fix→re-verify loop closed in one round.

## Suggestions for future tasks

- **When a task and an ADR disagree, say so in the completion report before the verifier has to find it.** This one did, and it turned a potential scope-violation finding into a two-minute confirmation.
- **Check indexer aggregates against the chain before displaying them.** The `totalAssets` trap cost nothing here only because it was caught; it would have shipped a 1,000× overstatement of every market on the page.
- **Grep your own new exports and props for consumers before calling a UI task done.** `grep -rn "<symbol>" src/ | grep -v __tests__` on every new field and prop takes a minute and was the only thing that failed the first verification.
- **A panel that stakes real value needs its safeguards traceable, not just present.** Numbering them in the service header and mapping each to a named function made verification a lookup instead of an audit. Do that again on any value-handling surface.
- **No browser was available in this environment, so nothing was visually verified.** Layout, contrast and 400px behaviour were checked by reading code and built CSS. `/agent/8453/6649` and `/agent/8453/2340` rendering correctly are the two acceptance criteria still resting on inference; the operator should open both once before this is shown to anyone.
- The first real stake transaction is still unexecuted, by design (ADR 0017). It is the operator's, deliberately, with their own wallet.

## Residuals the verifier accepted rather than closed

- After a broadcast-then-lost error, "Back" routes to `{step: "form"}` but does not clear `amount` and `side`. Re-signing still costs four deliberate actions (Back → Review → Sign → wallet confirm) behind an explicit "do not sign it again without checking", so the one-click path is gone; the form is merely not wiped. Clear it if this branch is ever touched again.
- If the wallet broadcasts but the `writeContract` response is lost, `broadcast` stays `null` and the panel says "Nothing was staked", which could be false. You cannot report a hash you never received; this residual is not closable from the client.
- No visual verification was possible (no browser in the build environment). See the suggestion above.
