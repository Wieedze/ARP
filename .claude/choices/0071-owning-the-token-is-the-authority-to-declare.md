# 0071 — owning the ERC-8004 token is the authority to declare, and mainnet is not open yet

**Status:** Accepted
**Date:** 2026-10-28
**Triggered by:** `docs/tasks/30`, and the user's instruction — _« on doit finir les feature de
decouverte utilisation et toute la boucle »_, with the order settled in the same exchange: the app's
empty cells first, the catalogue seed after.

## Context

`docs/12` point 3 — _"the agent runs, it deposits TRUST on the modules it actually used"_ — is the
centre of the mechanism and had **no page**. It existed in `scripts/agent/agent-declare-used.ts` and in
`arp-mcp-server.ts`, so it was reachable by an agent and not by the human holding the agent's key.
`.claude/STATE.md` has named this as "still not built, and it is the centre of the mechanism" since
2026-10-27, and `tool-register.ts`'s own table names it from the other side: a person registers the
tool's atom on `/register`, and an agent writes `(agent, uses, tool)` "through the MCP or the skill".

`FUTURE.md` recorded the question that had to be answered before anything could be built:

> The write half needs the subject: a `uses` edge carries the **agent's** identity atom (ADR
> `0032`), and a human pasting a URL is not an agent. **Decide whose claim the screen writes** before
> building it.

Two further constraints were already decided and had to be respected rather than rediscovered. ADR
`0056` §1: _"ARP offers no control to deposit on the edge, and no copy calling it contestable"_ —
because nobody takes the other side of `X used Y` (1 of 185 mainnet `uses` edges has ever been
contradicted), so a solicited deposit there is a fee for nothing. And ADR `0053`: every term is born
with `cost + minDeposit`, so the declaration already carries a position.

## Decision

Four parts.

### 1. The ERC-8004 `owner` is the authority to declare for that agent

The registry names the token's `owner`, so a connected wallet matching it **is** the proof. One
`eth_call`, free, no new mechanism — it is the same proof `/agent/import` already uses
(`verifyAgentOwnership`). It fails closed: naming an agent you do not own gives `not-the-owner`, with
the real owner in the message so an operator can see they connected the wrong wallet.

The subject written is the **registration-derived atom** from `resolveDeclarationSubject`, never the
connected wallet's `caip10:` atom. That is ADR `0032` and it is not a preference: the wallet-atom
version works, costs the same, and is invisible to `getCapabilities` — 21 such triples are stranded
on testnet and Intuition has no deletion.

### 2. The agent is named as `chain/token`, and a bare id is refused

`parseAgentRef` rejects `1380`. The canonical registry is at the same address on several chains (ADR
`0027`), so one id names a different agent on each, and a defaulted chain would silently declare for
a stranger.

### 3. One write, not two — there is no stake control on the edge

This implements ADR `0056` §1 on the app surface. The position the write carries (ADR `0053`) is the
whole of the stake, and `prepareStakeOnUsed` stays reachable only from the package and the MCP node,
where an agent adding to its own attributed claim is not making a mistake.

This is also a **correction of the task as it was framed**. The work was described, by me, as "the
two empty cells in the app — declare and stake". There is one cell. The second was closed by the
user's own decision three weeks earlier, in his own words: _« l'arête n'a aucune utilité comme marché
car personne ne va miser contre X agent use X outil [...] alors ce serait juste des frais
supplémentaires pour rien »_.

### 4. Mainnet is refused, and the refusal is visible before the form

`planUseDeclaration` throws `mainnet-not-authorised` on `chain.isMainnet` **before its first read**,
and the component renders the reason in place of the form rather than after a click.

`.claude/rules/security.md` authorises a human in the panel to sign on mainnet under **ADR `0017`**,
and that ADR scopes itself to _deposits into existing `has trust provider` triple vaults_. A `uses`
edge is a different predicate and a **creation** rather than a deposit, so it falls outside. The rule
is explicit that this makes it "not yet authorised, not forbidden", and that widening it needs its
own ADR — which is the user's decision, not a module's.

It matters because `lib/chain-choice.ts` **defaults to mainnet**, where this write costs 0.11 TRUST
of which 0.1 is a non-recoverable fee. Shipping it open by default would have spent real money under
an authorisation nobody wrote.

## Alternatives considered

- **Derive the agent from the connected wallet** rather than asking for it — no index exists.
  ERC-8004 identities are ERC-721, there is no "tokens owned by address" view, and
  `identity-registry.ts`'s `totalAgents()` already reverts on the canonical registry (a known
  defect). It would need `Transfer`-log scanning or a third-party indexer, for a question one
  `eth_call` answers once the operator names the token.
- **Let anyone declare, with the human's own `caip10:` atom as subject** — this is ADR `0032`'s
  permanent mistake, already made 21 times on testnet, and ADR `0056` §2 rejects it again for a
  second reason: a stranger's purchase becomes indistinguishable from a client's.
- **A dedicated `/declare` screen** — it would have to ask for the object as a URL, and a URL typed
  beside an atom already on screen is how a second atom gets minted for one tool. `https://github.com`
  has five on mainnet. On the atom's own page the object is an id the chain holds, by construction.
- **Ship mainnet open and record the authorisation as pending** — the default chain is mainnet, so
  "pending" would have been spent before it was read.
- **Gate the control to testnet silently** — a feature that renders nothing on the default chain
  reads as broken, and a reader cannot discover the toggle from an absence.

## Consequences

**Positive:**

- `docs/12` point 3 has a page. The loop is walkable by a human end to end on 13579: register a tool
  on `/register`, declare a use on `/atom/:atomId`, read the standing on the same page.
- The authority is a chain read, so ARP remains not a party (ADR `0035`): the plan comes from
  `@arp-protocol/core`, which holds no key, and the operator's wallet signs it.
- The app's write-side guards are now uniform — ceiling, chain-on-the-plan, `eth_call` before
  signature, nothing on mount — across `trust-stake`, `tool-register` and `declare-use`.

**Negative:**

- **An operator must know their agent's `chain/token`.** There is no picker, and there cannot be a
  cheap one for the reason in the alternatives. A profile page would fix it, and `FUTURE.md` already
  holds that ask with its own prerequisite.
- **The common outcome is a refusal, not a write.** Intuition's mirror reaches roughly 1 agent in 15
  (ADR `0047`), so `no-identity-atom` is the ordinary case for an agent that was not minted through
  ARP. The message says where to write the atom; it is still a two-step journey.
- **Mainnet shows a closed door on the default chain.** Until part 4 is widened, most readers see
  the refusal rather than the feature.

**Neutral (worth knowing):**

- `WagmiProvider` joined `src/test/render.tsx`'s wrapper, whose docstring said "the three providers
  every page in this app assumes". No page with a wallet control had a DOM test before this one, so
  `useAccount` had never been rendered in a test, and the first page to reach for it failed with
  `useConfig must be used within WagmiProvider` from a test file that does not mention wallets.
- The guard `no-position` is a **re-typing**, not a second check. `prepareDeclareUsed` raises
  `ZeroPositionError` first, so a downstream `shares === 0n` test would be unreachable —
  `rules/claims.md` §1 applied to a guard. The same is true of `object-not-on-chain`, which re-types
  `EmptyPlanError`, and that one is genuinely reachable: the page decides to show the control from
  the **indexer** while the planner asks the **chain**, and an indexer one block ahead puts them out
  of step.
- `app/src/services/atom-stake.ts`'s `depositOnAtom` is **dead and wrong** and was deliberately not
  built on. No component calls it, it deposits on the tool's **atom** while `getToolUsage` prices the
  **triple** (the defect ADR `0039` records for `scripts/agent-stake-on-use.ts`), and it reads
  `deployments.intuition.multiVault` at module scope, which is testnet-only. Recorded in
  `.claude/STATE.md`'s defect table rather than removed here, because deleting it is a separate
  change.

## Amended 2026-10-28, after two review rounds

Two decisions the reviews forced, recorded because both reverse something stated above.

### 5. Both writes are collapsed disclosures at the head of the column

The Consequences below predicted _"most readers see the refusal rather than the feature"_ and treated
that as acceptable. It was not: with the control at the head of the column the refusal became the
loudest element on every atom page on the **default** chain, 218px above the evidence. And expanded
at the head it pushed the first evidence row to y~501, four rows above the fold where `ui.md` asks
for fifteen. At the foot it had been at y=17602 on a 250-edge atom.

Native `<details>`, collapsed, is what reconciles those: reachable at any atom size, 15px/500 so it
does not compete with the page's content, and the evidence starts at y~412. The mainnet branch is one
steel sentence with no heading. Measured on both chains at 1440×1000.

Rejected: gating the control to testnet (part 4 already rejects it), and capping the edge list —
which is the general fix for the unbounded column and belongs in its own task.

### 6. `linkClass` carries no `decoration-*`, and the inert value was the better one

A round-1 finding was that `decoration-[color:var(--color-rule-strong)]` was inert against the
unlayered `a { text-decoration: none }` shorthand. Adding the bang made it apply and made the app
**less legible**: 2.05:1 against currentColor's 8.57:1, under SC 1.4.11's 3:1, in the module whose
own argument is that the underline is the affordance. `docs/design/brand/v1/reference/*.html` has no
underlines at all, so the token had never been specified for this.

The utility is removed. **A utility measured inert is not yet a defect** — what it would do once it
applied had not been checked, and the measurement that mattered was the contrast one, not the
computed-style one.
