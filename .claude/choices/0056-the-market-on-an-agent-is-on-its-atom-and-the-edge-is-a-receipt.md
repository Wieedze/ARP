# 0056 — the market on an agent is on its atom; the edge is a receipt, not a market

**Status:** Accepted
**Date:** 2026-10-21
**Triggered by:** user decision. He rejected a market on provider assessments — _« l'assessment du
provider est au provider et notre marché est ouvert sur l'agent, parallèle à l'assessment »_ — then
rejected the obvious shape for it: _« l'arête n'a aucune utilité comme marché car personne ne va
miser contre X agent use X outil [...] alors ce serait juste des frais supplémentaires pour rien »_.
That second objection is correct and measurable, and it is what this ADR settles. He then settled
the framing in one line — _« soit on mise sur un agent soit on retire notre mise de l'agent, c'est un
market donc pas un signal, juste une bourse d'agents et d'outils »_ — which is decision 5 below and
the reason the exit shipped with this change rather than after it.

Amends ADR `0046` §2 on one point. `0046`'s **reasoning** stands intact.

## Context

ARP needs a market on an **agent**, not on a scoring company's opinion of one. Two candidate vaults
exist and ADR `0046` §2 ruled out one of them in a single sentence:

> **Not on an identity atom.** An identity carries no assertion, so a stake on it cannot be wrong and
> nobody can meaningfully take the other side. What it would measure is **attention**, not trust — a
> visibility market wearing a reputation label.

That left `(hirer, uses, agent)` as the only candidate. The user's objection is that this edge is not
a market either, because nobody ever takes the other side of a statement of fact — so charging for a
vault on it is a fee buying nothing.

**Measured before deciding** — mainnet 1155, 2026-10-21,
`scripts/measure/counter-side-usage.ts` (committed with this ADR):

| population                 | total   | carries a position | a **second** participant | somebody **disagreed** |
| -------------------------- | ------- | ------------------ | ------------------------ | ---------------------- |
| every triple on the chain  | 285,775 | 273,167 (95.59%)   | 6,414 (2.24%)            | **969 (0.34%)**        |
| the 185 `uses` edges       | 185     | 110                | 16                       | **1**                  |

The 95.59% column is not participation: every term is born with a position (ADR `0053`), so it counts
creators. The honest reading is the last two columns. **The counter-vault is, in practice, unused.**

Two more reads, same chain and date, that decide the rest:

| act                                   | amount                   | recoverable                    |
| ------------------------------------- | ------------------------ | ------------------------------ |
| `getTripleCost()` — create an edge    | 0.100000000002 TRUST     | **no — a fee, it is gone**     |
| `getAtomCost()` — create an atom      | 0.100000000001 TRUST     | **no — a fee**                 |
| `minDeposit` — the birth position     | 0.01 TRUST               | yes, redeemable                |
| `atomDepositFractionForTriple`        | 90/10,000 = **0.90%**    | of a triple deposit, toward its atoms |

And the two vaults do **not** feed each other in practice. The third-richest `uses` edge, read the
same day:

```
(0x0259…08b3) uses (GitHub)
    edge   22.437650994344287984 TRUST   2 positions
    atom    0.000000000001 TRUST         0 positions   ← the minShare seed, nothing else
```

## Decision

**The market on an agent sits on the agent's own atom. The `uses` edge is a receipt that costs money
to write, and ARP stops treating it as a market.** Five parts.

### 1. The edge is created, never staked on

A client writes `(its own identity atom, uses, agent X)`. That costs 0.1 TRUST in a non-recoverable
protocol fee, and **that fee is the whole of the skin in the game** — a client who lies pays 0.1
TRUST per lie, permanently. ARP offers no control to deposit on the edge, and no copy calling it
contestable. Where an edge does carry a position (16 of 185) the figure is displayed; it is not
solicited.

### 2. The subject is the client's own identity atom, never a shared one

A single shared `(I, uses, X)` would give one vault for every claim about X, which collapses twelve
clients into one payer and makes a stranger's purchase indistinguishable from a client's. The user
raised this falsification himself — _« si quelqu'un achète des stake en tant qu'humain ça fausse le
truc »_ — and it is also ADR `0032`: the subject must be the asserting party's identity atom.

### 3. Edges are counted, never summed

"Seven distinct clients declared using this agent; five paid to say so." Never a TRUST total across
edges — ADR `0023`, and the live instance of that error is `tool-usage.ts:235-238`.

### 4. The atom vault is permitted, and it is named for what it measures

ADR `0046` §2's reasoning is **accepted, not overturned**: a deposit on an identity atom cannot be
contradicted, so what accumulates there is attention and capital, not trust. What changes is only
that this is now **allowed and labelled**, instead of forbidden:

- it is described as **backing** — money placed on this agent — never as reputation, a score, or a
  rating;
- the UI states it has no other side;
- it is **never** added to, or shown as one figure with, the edge count from part 3.

**It is not a payment to the agent, and no copy may imply that it is.** A deposit here is a position
the depositor keeps and can redeem; the agent receives none of the principal. Only
`atomWalletDepositFee` = 50/10,000 = **0.50%** leaves toward the atom's wallet
(`computeAtomWalletAddr`), and on mainnet that wallet is **not deployed** — code length 0 at
`0x20A3ecb734CC64A7146d98638d73A51C52aD8922` for the Cursor atom — so who can claim it is **not
established by this ADR**. The agent is paid for its work through x402, which is a different rail
(`rules/metamask-delegation.md`).

### 5. It is a market, so it has an exit — and ARP calls it a market, never a signal

The user's own framing, and it is load-bearing rather than vocabulary: _« soit on mise sur un agent
soit on retire notre mise »_. Two consequences, both shipped here:

- **An exit exists.** `redeem` was not reachable anywhere in this app before this change — every
  surface could deposit and none could withdraw, which makes a deposit a donation and a market a
  collection box. `WithdrawControl` and `quoteRedeem`/`submitRedeem` close it, carrying ADR `0017`'s
  safeguards across with `minAssets` in place of `minShares`. Signatures verified against mainnet
  1155 with `cast call` rather than transcribed: `previewRedeem(atom, 2, 1e18)` returned
  `(3.220577336235195070, 1e18)` and `maxRedeem` agreed with `getShares` to the wei.
- **The figure is live, and falls.** With an exit on the page, ADR `0046` §3's ban on a historical
  cumulative stops being a precaution: "50 TRUST since the beginning" is false the moment somebody
  leaves. What is displayed is what the vault holds now.

And the word. ARP describes this as a market or a price, not as a signal, a score, a rating or
reputation. "Signal" invites the reader to treat the number as a verdict somebody issued; the number
is what it costs to take a position, which is a different kind of fact.

## What a reader gets, and it is two numbers that never merge

| | what it measures | contestable |
| --- | --- | --- |
| what the agent's atom holds | how much capital has chosen to sit on this agent | no, by construction |
| how many distinct clients declared using it | whether it is actually employed | the claim is, the count is a fact |

A lot of the first with two clients is an agent being noticed. Little of the first with twelve paying
clients is an agent being employed. Both readings are useful, they are not the same reading, and a
total erases both — `rules/claims.md` §2.

## Alternatives considered

- **A single shared `(I, uses, X)` triple, one market per agent** — rejected in part 2. It is the
  shape the user initially proposed and then falsified himself.
- **Keep the edge as a two-sided market and say nothing** — rejected on the measurement: 1 of 185
  `uses` edges has ever been contradicted, 969 of 285,775 chain-wide. Describing an unused mechanism
  as live is the failure `rules/claims.md` check 1 exists for.
- **Route the backing through the edge and rely on `atomDepositFractionForTriple` to reach the
  agent's atom** — rejected on the measurement: 0.90%, and the GitHub edge above shows 22.44 TRUST on
  an edge beside an atom holding its seed and nothing else. One deposit cannot do both jobs.
- **Call the atom deposit a reward** — rejected. It is the user's own first word for it and it is the
  one word the numbers contradict: 99.5% of the principal stays the depositor's and is redeemable.
  Shipping "reward" would be `rules/claims.md` §2's second clause — an adjective the data
  contradicts — written into the UI. He replaced it himself with the accurate one: a market.
- **Deposit-only, with the exit as a later task** — rejected once part 5 was stated. A market with
  one direction is not a market, and shipping the deposit alone would have put a number on screen
  that nobody could act against.
- **Leave `0046` §2 literal and build nothing** — rejected. It would leave ARP with no market on an
  agent at all, which is the gap this ADR exists to close.

## Consequences

**Positive:**

- One act per client instead of three. Declaring costs 0.1 TRUST once; backing is optional.
- Removes a surface ARP would have had to explain and nobody would have used.
- The two numbers a reader sees are both facts, and neither is ARP's opinion — `0046` §1 untouched.
- Both directions exist, so the number on screen is a price rather than a tally. A reader who
  disagrees with it can act, which is the only thing that makes it mean anything.
- The sybil cost is now a stated number rather than an intuition: twelve fabricated clients cost
  12 × 0.1 for the edges plus 12 × 0.1 for their identity atoms ≈ **2.4 TRUST**, and name twelve
  addresses on a public graph.

**Negative:**

- Backing is **withdrawable**, so it is live and not accumulated — consistent with `0046` §3, but it
  means an agent's headline figure can fall without the agent doing anything.
- 2.4 TRUST is cheap. Nothing here prevents a fabricated client set; it only prices it and makes the
  addresses visible. Co-occurrence detection across backers is in `FUTURE.md`, not built.
- ARP now has a figure on an identity atom, which is exactly what `0046` §2 warned reads as a
  reputation signal. The defence is naming and separation, and naming is a weaker guard than a
  prohibition. If the copy drifts, the warning in `0046` §2 comes true.
- The exit is a second write path on a mainnet surface, so it doubles the code that can move real
  value. It is covered by unit tests over a mocked wallet client and by `eth_call` simulation before
  every signature, and by nothing on mainnet — per `rules/security.md`, a passing suite is not a
  reason to spend real TRUST.
- A withdrawal is denominated in **shares**, which is not the unit the deposit took. The form shows
  the TRUST it would return, because inverting a bonding curve in the browser to offer a TRUST field
  would be presenting a computed guess as an amount.

**Neutral (worth knowing):**

- `atomWalletDepositFee` is a real 0.50% path to an atom wallet. Whether an ERC-8004 agent controls
  the wallet of its own identity atom is **unmeasured** and is the one open question this ADR leaves.
  If the answer is yes, a genuine reward rail exists and deserves its own ADR.
- The edge's counter-vault still exists on-chain — Intuition creates it regardless. ARP not using it
  does not remove it, and a third party may.
- **The scope of part 1 is ARP's own surfaces, not the protocol package.** `arp_stake_on_used` and
  `packages/protocol/src/declare/`'s stake planner still plan edge deposits, and that is deliberate:
  an agent putting more behind its own attributed claim is not making a mistake, and 16 of the 185
  edges do carry a second participant. What changed there is the **reason given** — the copy led on
  contestability and now leads on attribution. Removing the capability would be a separate decision.

## References

- Measurement: `scripts/measure/counter-side-usage.ts` (mainnet 1155, 2026-10-21)
- Amends: `0046` §2 (the prohibition on staking an identity atom — reasoning kept, prohibition
  replaced by a naming constraint)
- Related ADR: `0023` (positions are per vault, never summed), `0032` (the subject is the asserting
  party's atom), `0039` (an agent's deposit goes on the edge — **narrowed here**: the edge is created,
  not deposited on), `0042` (a vault's assets are not evidence of a stake), `0053` (every term is born
  with a position — why 95.59% is not participation)
- Related doc: `docs/12_THE_IDEA.md` points 3–5, `docs/14_THE_WITNESS_PROBLEM.md` (the ladder)
- Related rule: `.claude/rules/claims.md` (§2 — one number one context, and no adjective the data
  contradicts), `.claude/rules/metamask-delegation.md` (x402, the rail the agent is actually paid on)
