# 0113 — Who may speak for an agent's identity: trusted writers, the market, then ambiguity

**Status:** Deferred (mainnet port). The user's decision, 2026-11-02: « intéressant mais inutile en
démo », to be written down for the mainnet port. Nothing here is built. Until the port, the sponsor
resolves an identity as `resolveIdentityAtomStrict` does today, and the latent defect below stays in
`.claude/STATE.md`'s known defects.
**Date:** 2026-11-02
**Triggered by:** `intuition-integrator`'s review of task 50 (Medium finding), and the user's
question that followed it: a malicious or mistaken `same as` cannot be deleted, so no rule may let
one block an agent for good. « il faut trouver une solution modulable ».

## Context

An agent's identity atom is found through `(identity atom, same as, <CAIP-19>)` (ADR `0032`,
`packages/protocol/src/declare/resolve-subject.ts:62`). Two facts make that edge unreliable on its
own.

1. **The recipe names an agent without its registry.** `canonicalAgentThing` builds
   `Agent <chainId>:<tokenId>` (`packages/protocol/src/declare/agent-atom.ts:43-50`). Intuition's guide
   assumes one registry per chain: "The ERC-8004 Identity Registry is the same address on every EVM
   chain … Only {chainId} and {tokenId} vary" (`docs/07_INTUITION_ERC8004_PARTNER_GUIDE.md:315`). On
   testnet 13579 there are two registries: ARP's `0xC165…0d5A` and the canonical
   `0x8004A169…a432`. So agent N of each falls on one atom. Measured on the testnet graph,
   2026-11-02:
   - "Agent 13579:6" was created by `0x906f…f91f` and carries `same as` edges to both registries'
     agent 6.
   - "Agent 13579:7" was created by `0x9C98…e868` and carries both as well.
2. **`same as` is permissionless and permanent.** Anyone can write `(X, same as, Y)` for any X, and
   nobody can delete it. Today `resolveIdentityAtomStrict` answers `ambiguous` when two atoms claim
   one agent, but not when one atom claims two agents.

What that does to the sponsor: the `uses` edges and positions of two agents land on one subject. A
hire between them is refused as "agent using itself" (`apps/sponsor/src/service.ts`). The simple
fix, refusing any atom that points at more than one agent, has the flaw the user named: one stranger's
edge would block an honest agent for good.

What the creator of an atom is **not**: on Intuition, the creator is whoever paid for the creation,
not an authority. What makes someone an agent's owner is its ERC-8004 token. A rule of "the sponsor
created it" would exclude:
- every agent whose atom its owner wrote. Agent 8, the Claude Code test agent, was created by its own
  key `0xB86F…`;
- every agent minted through the web app;
- on mainnet, every agent Intuition's mirror wrote.

## Decision

Resolve an agent's identity in three layers. Each layer is a parameter of the resolver, not a constant.

1. **Trusted writers.** A `same as` edge counts for agent `(registry, id)` only when its creator is
   one of:
   - the agent's ERC-8004 owner (`ownerOf`), or its `agentWallet`;
   - a writer the deployment trusts. On testnet that is ARP's sponsoring service, which creates the
     identities of Desktop agents (ADR `0110`). On mainnet it would be the account that writes
     Intuition's mirror, identified and measured before the port.

   Every other `same as` is ignored for that agent. A stranger, malicious or mistaken, can no longer
   block anyone.
2. **The market corrects.** A counted edge whose counter-triple holds more than its triple is
   ignored. The threshold is a parameter. On Intuition, depositing against a claim is how a claim is
   withdrawn. The agent, its operator, or anyone can disown a false link, and no deletion is needed.
3. **Ambiguity last.** Only when two counted, unopposed edges name two different agents does the
   resolver answer `ambiguous`, and the sponsor refuses. `/identity` refuses to write a `same as`
   onto an atom that already has a counted edge to another agent. That is the true collision: two
   legitimate owners of agent N, one in each registry of 13579.

**Prevention at the source, testnet only.** A new agent on ARP's own registry gets an identity atom
whose name carries the registry, so it cannot collide with the canonical registry's agent N. Agents
that exist keep their atom: one changed character is a different, permanent atom
(`identity-plan.ts:113-119`). On mainnet the canonical registry is the only one Intuition reads, so
this is not needed there.

## Alternatives considered

- **Refuse any atom with more than one `same as`.** One stranger's edge blocks an honest agent for
  good. It was refused for that reason (the user, 2026-11-02).
- **Trust only atoms the sponsor created.** That treats a payer as an authority. It excludes every
  agent its owner or Intuition's mirror wrote, and it does not survive the port, where ARP controls
  nothing (`rules/portability.md` rule 4).
- **Change the recipe for everyone.** That makes a duplicate atom for every agent that exists, which is
  the failure `identity-plan.ts` warns against.

## Consequences

**Positive:**

- A false or mistaken `same as` costs its author the fee and blocks nobody.
- One rule serves every kind of agent: Desktop, Claude Code, web-minted, mirrored, hired.
- The parameters (trusted writers, the market threshold) change per deployment without a code change.

**Negative:**

- **Resolution reads more of the chain:** the creators of the edges, `ownerOf` and `agentWallet`, and
  the vault of each edge and of its counter-triple. It costs more per lookup than today's single
  query, and needs a cache for the sponsor's hot path.
- **A trusted writer can still be wrong.** An owner who links their atom to a second agent of their
  own makes it ambiguous, which is the true collision layer 3 refuses.
- Layer 2 makes an identity depend on a market. Somebody with enough TRUST can oppose an honest edge.
  The threshold and the trusted writers in layer 1 bound that, but do not remove it.

**Neutral (worth knowing):**

- Until the port, the latent defect stays recorded in `.claude/STATE.md`. The sponsor's agents 9
  and 10 each have one `same as`, written by the sponsor (testnet graph, 2026-11-02).
- `FUTURE.md` points here.
