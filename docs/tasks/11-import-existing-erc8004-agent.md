# Task 11 — Import an existing ERC-8004 agent

> **Status: COMPLETE** (specified 2026-09-16, completed 2026-09-16).
>
> Closes the gap named in `docs/12_THE_IDEA.md`: the mechanism works for agents ARP mints, and the
> 28,648 that already exist are the population.
>
> Commits `f72d4d0`..`a39a914` on `feat/import-erc8004-agent`. `ui-reviewer` pass (second round),
> `task-verifier` pass. Post-mortem: `.claude/learning/12-import-existing-erc8004-agent.md`.
> The design question below was settled as `same as` against the operating account's CAIP-10 —
> ADR `.claude/choices/0026-import-links-the-agent-to-its-operating-account.md`.
>
> **One open seam, recorded rather than closed.** The link lands on Intuition mainnet and names the
> operator's Smart Account, because that is the delegator a delegated stake executes as. Today
> nothing on 1155 stakes as a Smart Account — `trust-stake.ts` deposits from the connected EOA, and
> the delegation path targets testnet 13579. The edge is correct about the flow `docs/12` describes
> and premature about the one that runs. That is the remaining open row in `docs/12`'s state table
> ("the guard rail on the chain where the agents are"), and this task's Out of scope forbids
> building it here.

## Objective

An operator who already owns an ERC-8004 agent can bring it into ARP — declare its modules, sign a
bounded delegation, and have its runtime stake on the tools it uses — **without minting anything**.

Minting stays. This is the second door to the same place, per `docs/12` §1.

## Why the proof is simple

The ERC-8004 registry names the `owner` of each token. The connector already reads it
(`erc8004RegistrySource` returns `owner` on `AgentIdentity`). So control is proven by a signature from
that address — no bridge, no cross-chain message, no second identity.

Nothing is written to the Base registry. ARP does not own it and has no business writing there.

## The flow

1. Operator connects a wallet.
2. Operator gives an identity: chain + token id. (A convenience lookup of "agents owned by this
   address" is welcome if the registry supports enumeration cheaply; if it does not, do not fake it.)
3. ARP reads the registry on that chain and compares `owner` to the connected address.
   - Not the owner → say so plainly, and say who the owner is. Do not proceed.
4. Operator signs a statement of intent — EIP-712, naming the agent's CAIP-19, the ARP context, a
   nonce and the chain id. This is consent and the record of it, not the proof of ownership; ownership
   was proven at step 3.
5. ARP resolves the agent's **canonical Intuition atom** through the connector's preflight. It already
   exists for the mirrored cohort. Per ADR 0015 that atom is the subject of everything ERC-8004-facing
   — do not mint a replacement.
6. From here the existing flow takes over unchanged: Smart Account, the delegation, module
   declaration, staking.

## The one design question, and it is yours to settle

A tool stake is sent by the operator's **Smart Account**, not by the agent. So on-graph, the stake is
attributable to an address, and nothing yet says that address operates that agent. Without a link,
tool reputation still works — distinct stakers — but **agent reputation does not**, and agent
reputation is half of `docs/12`'s mechanism.

So the import must publish a link between the canonical agent atom and the operating account.

Use an existing canonical predicate. `same as` against the CAIP-10 of the operating account is the
pattern ADR 0014 and ADR 0015 already established for exactly this, and its term id is a constant in
the connector. **Do not invent a predicate and do not mint a new one** — `docs/07` is explicit that a
differently-pinned duplicate is a different node and fragments the surface.

If, reading the code, you conclude a different canonical predicate fits better, say which and why
before writing it. Do not resolve this silently.

## Constraints

- **No minting on the import path.** Not on Base, not on Intuition, not into ARP's testnet registry.
- **No write to any ERC-8004 registry.**
- The canonical atom comes from the connector's preflight, never from a fresh `pinThing`.
- Reads for chains 8453 / 56 / 1 go through `erc8004RegistrySource`; it already supports all three.
- Graph writes land on Intuition **mainnet 1155**, where the agents and the MultiVault are. The stake
  cap enforcer is live there (`0x99921C234d4Ca518DC58ba63ff9bfD2Cc9435f34`); **`DomainScopeEnforcer`
  on 1155 is inert** and there is no `ModuleRegistry` on mainnet — ADR 0025. Do not build against
  either.
- Pinning needs `INTUITION_PIN_API_KEY` and is **server-side only** — ADR 0016, and `PinAuth` is
  branded so a browser caller will not compile. If the import needs a pin, it runs in a script or a
  runtime, not in the page.
- `.claude/rules/ui.md` binds for anything user-facing.

## Verification

- `bun run test`, `bun run lint`, `bunx tsc -b` in `app/`
- A real read against the live Base registry for a known agent, asserting the true `owner`
- A wrong-owner path that refuses, tested
- **Do not send a mainnet transaction.** Verify writes with a mocked wallet client and `eth_call`
  simulation. The first real one is the operator's.
- There is no browser here. Do not claim visual verification.

## Acceptance criteria

- [ ] An operator owning a real ERC-8004 agent can import it; a non-owner cannot
- [ ] No mint occurs on the import path — assert it
- [ ] The canonical atom is resolved, never re-derived or re-pinned
- [ ] The agent-to-operator link is published with a canonical predicate, and the choice is documented
- [ ] Minting still works, untouched
- [ ] `ui-reviewer` pass, then `task-verifier` pass

## Out of scope

- Capability search, the directory, anything in the trust panel.
- Writing to any ERC-8004 registry.
- `ModuleRegistry` on mainnet — ADR 0025 settled it.
- Any domain-scoped guard rail on mainnet; it does not exist there by decision.
