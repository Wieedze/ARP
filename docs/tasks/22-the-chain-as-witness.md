# Task 22 — The chain as witness

> **Status: GATE RUN 2026-10-27 — steps 2 and 3 are NOT justified; step 4 is already producing
> data.** (Specified 2026-10-16, from a user proposal.) Extends
> `docs/14_THE_WITNESS_PROBLEM.md`'s **fact** row. Additive to tasks 17 and 19, not a replacement
> for either.
>
> The gate asks for the step-1 measurement with an honest fraction, _"including the outcome where
> the fraction is too small to justify steps 2–4."_ That is the outcome, and it splits cleanly.
>
> **The fraction is zero, and two independent measurements say so.**
>
> 1. **Step 1's key does not exist.** The step specifies `same as` → the agent's CAIP-10 operating
>    account (ADR `0026`). Re-run 2026-10-27, `scripts/measure/caip10-join.ts`: 20 caip10-labelled
>    atoms on testnet, **0 edges of any predicate point at one**. The sender side cannot be
>    resolved today, which is `docs/tasks/19` step 1b's blocker and not separately fixable here.
> 2. **There is nothing in the calldata to read even if it could.** New:
>    `scripts/measure/tool-addressability.ts` classifies every distinct object of a `uses` edge by
>    its atom URI, because a tool is witnessable from calldata only if it is a contract.
>
>    | chain         | `uses` edges | distinct tools | a contract |    a URL |   a name |
>    | ------------- | -----------: | -------------: | ---------: | -------: | -------: |
>    | mainnet 1155  |          185 |             84 | **0 — 0%** | 48 — 57% | 36 — 43% |
>    | testnet 13579 |          146 |             69 | **0 — 0%** | 39 — 57% | 30 — 43% |
>
>    Not a small fraction — **none**. ARP's own tool model is the reason: a tool atom is a `Thing`
>    identified by a URL (`toolAtomUri`), so `github.com/crytic/slither` is a tool and no sequence
>    of transactions can witness its use. The task's own limit section predicted this; the size of
>    the subset is now measured rather than assumed.
>
> **Step 4 is the exception, and it already has data.** `scripts/measure/enforcer-events.ts` indexes
> `StakeCapChecked` off `TrustStakeCapEnforcer`, reading both addresses from
> `data/deployments/<chainId>.json`:
>
> | chain |    logs | transactions | distinct delegations | senders                                                       |
> | ----- | ------: | -----------: | -------------------: | ------------------------------------------------------------- |
> | 13579 | **122** |          108 |                    9 | 3 — 93 tx from ARP's own rig agent `0x906f3A52…` (ADR `0047`) |
> | 1155  |       0 |            — |                    — | —                                                             |
>
> The hook is unreachable without a redemption, so each log is a fact about one. **But 93 of the 108
> transactions are ARP crossing its own guard rail**, which proves the machinery and not the market;
> 15 transactions from two accounts are not recorded anywhere in this repo. A count of 122 quoted
> without the sender column would read as adoption, which is `rules/claims.md` §1 — the consequence
> stated without measuring what bounds it.
>
> **Conclusion.** Steps 2 and 3 (deriving `(agent, uses, tool)` from decoded calls) have a
> denominator of zero and are not built. Step 4's source is live and is the only tier-4 evidence
> this project produces today; it belongs on the surface, which is a separate task and not this one.
> The idea was right about the evidence class and wrong about the reach, and the reach is now a
> committed number instead of an estimate.

## The idea, and the correction that improves it

The proposal was a hook that fires on an agent's calldata — call a skill, and you have proof it was
used.

**The evidence class is right and it is the strongest one available.** It is exactly `docs/14`'s
rule: a fact is what touched a third party, and here the third party is the chain itself. No
self-report, no counterparty to persuade, nothing to trust.

**The hook is the wrong mechanism.** A hook has to be installed, which is adoption — the thing flow
A exists to avoid. Transactions are already public, so reading them needs nobody's permission **and
works retroactively** on history that already exists. A hook would only add something a raw
transaction cannot carry: a semantic payload the tool chooses to emit. That is a later, opt-in
refinement, not the foundation.

## What is measured, and what is not

Measured 2026-10-16, 120 uniformly random Base token ids, `ownerOf` then `eth_getTransactionCount`:

|                                      | of 120         |
| ------------------------------------ | -------------- |
| resolved an owner                    | **120 — 100%** |
| owner has never transacted (nonce 0) | 23 — 19%       |
| owner has 1–9 transactions           | 31 — 26%       |
| owner has 10+ transactions           | 66 — **55%**   |
| owner holds a non-zero balance       | 82 — 68%       |

So **the accounts are real and active**, which is the precondition this idea needs. The surface is
not empty.

**What is not measured, and it is the load-bearing step: whether what they call is a tool.** Two
reasons not to read the table as more than it says:

- **`ownerOf` returns the token holder, not the agent.** One address in the sample has **37,928**
  transactions and holds three agents — a platform minting in bulk, not an agent doing work. 106
  distinct owners for 120 agents, so concentration is real.
- **A nonce counts every transaction**, including the one that minted the agent.

Settling it needs transaction history by sender and selector decoding, which needs an indexer — and
that is the infrastructure this task requires anyway. **Do that measurement first and record it
before building anything**, per `rules/claims.md`: this task's premise is a claim about reach, and
reach is the thing that has been overstated twice in this project already.

## The limit, stated before anyone builds on it

**Most tools are not contracts.** An MCP server, a REST API, an LLM call — none leave calldata. So
this covers a subset of the `uses` surface, and the subset's size is unknown until the measurement
above is done. On that subset it is unbeatable; off it, it says nothing.

Which means this never replaces flow A (the verifier), flow B (declaration) or flow C (hire). It is
a fourth source for the same edge, sitting in `docs/14`'s top row beside payments and delegation
receipts.

## Do

1. **Measure before building.** For a sample of agents, resolve the _operating_ account rather than
   the token holder — `same as` already links an agent atom to its CAIP-10 operating account (ADR
   `0026`), which is the right key. Then index outbound transactions and tally the called contracts
   and selectors. Commit the script. Report what fraction of calls plausibly represent tool use, and
   do not round it upward.
2. If the fraction justifies it, derive `(agent, uses, tool)` candidates from decoded calls, with the
   transaction hash as the evidence handle so any edge reproduces from the chain.
3. Write them at the **fact** tier, distinguishable from a self-report. A tier that renders like the
   one below it is the defect `docs/tasks/20` just fixed.
4. The agent's own delegation redemptions are the same class and already exist:
   `TrustStakeCapEnforcer` (`0x99921C234d4Ca518DC58ba63ff9bfD2Cc9435f34`, chain 1155) emits
   `StakeCapChecked(delegationHash, newCumulative, cap)` on every pass, and it is unreachable without
   an actual redeem. Index that first — it is one contract, one event, and ARP's own.

## Do not do in this task

- **Do not claim a call proves the tool worked.** It proves a call happened. `docs/14` already draws
  this line for the delegation receipt and the same applies here.
- Do not build a hook, an on-chain callback or anything a tool must install, until reading the chain
  has been tried and found insufficient. Adoption is the cost flow A exists to avoid.
- Do not sign a mainnet transaction. `rules/security.md` — reads, `eth_call` and indexer queries only.
- Do not infer an agent's identity from `ownerOf`. It is the token holder, and in this cohort it is
  often a platform.

## Gate

The measurement from step 1, committed and reproducible, with an honest fraction — **including the
outcome where the fraction is too small to justify steps 2–4.** That is a real result and closes the
task just as well as a positive one.

## Which tier of the evidence ladder does this serve?

**Tier 4 (proven)** on whatever subset it covers — the only source in this project that needs neither
the agent's cooperation nor a counterparty's attestation. Its value is bounded entirely by how much
tool use is on-chain, which is why the task begins with measuring that rather than assuming it.
