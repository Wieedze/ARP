# 0062 — One door for your agent, and the mint goes to Base

**Status:** Accepted
**Date:** 2026-10-27
**Triggered by:** user request — the actions inventory he asked for, then _« oui pour tout »_ to all three questions it raised

## Context

The user asked for every possible action to be laid out, because he suspected complexity that
bought nothing: _« j'ai l'impression qu'il y a des choses complexes pour pas grand chose, on doit
simplifier et unifier les fonctions pour un but clair »_. The inventory found thirteen actions, and
two measured facts explained the feeling:

**`/agent` and `/agent/import` linked only to each other.** Neither was in the nav; no other page
reached either. 1,828 lines of UI with no door, which is why the user had never seen them and asked
whether they were not in fact the same page.

**The action at the centre of the mechanism had no page at all.** "Declare you used this tool" —
`docs/12` point 3 — existed only in `scripts/agent-declare-used.ts` and the MCP server.

And the page with the most machinery was writing into the wrong registry. `/agent` minted into
**ARP's own copy** of the ERC-8004 reference implementation on Intuition testnet 13579. That is what
`rules/portability.md` rule 4 is about in so many words: _"never rely on controlling the registry.
On mainnet it owns nothing. Any step that works because ARP can write to the registry is not a
step, it is a rehearsal prop."_ An identity minted there is invisible to every other ERC-8004
reader and to Intuition's mirror, which covers Base.

Measured before deciding, by `scripts/measure/canonical-registry.ts` on 2026-10-27:

| chain      | code      | name / symbol         | `register()` from a zero-balance address |
| ---------- | --------- | --------------------- | ---------------------------------------- |
| Base 8453  | 130 bytes | AgentIdentity / AGENT | **simulates OK**, next id 1,137,885      |
| BSC 56     | 130 bytes | AgentIdentity / AGENT | **simulates OK**, next id 393,928        |
| Ethereum 1 | —         | —                     | RPC unreachable; no finding either way   |

So minting a real identity is one permissionless transaction. What the probe proves is narrow and
worth stating: an `eth_call` from an address holding nothing shows `register()` is **not
permission-gated and takes no value**. It does not show a broadcast will land — that needs gas on
Base, the operator's own ETH, on a chain this app had never addressed.

## Decision

**Three decisions, all taken by the user.**

1. **No market on a third party's opinion.** The stake control comes off the rating row. The claim
   it priced is `(agent, has trust provider, provider)` — "is this provider worth listening to about
   this agent" — and ADR `0056` had already answered it: the market is on the agent's atom. The
   display stays, because who vouches for an agent is real information read for free. Shipped in
   `b179b4b`.

2. **One page, one question.** `/agent` holds the question _"does your agent already have an
   ERC-8004 id?"_ and renders either branch inline, with the choice in the URL (`?have=yes`). It is
   in the nav as **"Your agent"**, beside **"Add a tool"** — `/register` was labelled "Register",
   and two nav items reading "Register" would be the ambiguity the user's question was about.
   `/agent/import` redirects.

3. **The mint targets the canonical registry on Base**, not ARP's testnet copy.
   `services/identity-mint.ts`, `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, chain 8453.

4. **It mints `register(agentURI)`, never `register()`.** Added after the user asked whether
   signing straight into the registry is the intended use. It is — but the no-argument form mints
   an identity whose `tokenURI` is **empty**, and a second probe showed what that costs: agents
   `6649` and `500000` on Base return an empty `tokenURI`, and they are exactly the rows this app
   already renders as the indexer's stand-in, `Agent 8453:6649`.

   The whole chain degrades from one missing argument: no `tokenURI` → `registrationFile` null →
   `prepareIdentityAtom` falls back to the frozen recipe's defaults → the Intuition atom carries a
   stand-in name → every reader sees a nameless agent. So the first version of this flow would have
   minted into the half of the cohort nothing can say anything about.

   The document's shape was read **off the chain**, not off a spec — agent `1`'s own file, 2,269
   bytes of it:

   ```json
   {
     "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
     "name": "ClawNews",
     "description": "…",
     "image": "…",
     "services": [{ "name": "web", "endpoint": "https://clawnews.io" }],
     "registrations": [{ "agentId": 1, "agentRegistry": "eip155:56:0x8004A169…" }],
     "active": true,
     "x402Support": false,
     "supportedTrust": ["reputation"]
   }
   ```

   `packages/protocol/src/registration-file.ts` builds it. **On chain as a
   `data:application/json;base64,…` URI by default** — what agents `1` and `2340` carry. Agent
   `1100000` instead points at `https://centralcity.ai/a/L8Blf4`; both forms are in use, and the
   default follows ARP's own argument that a claim should be checkable without trusting a server.
   The byte count is shown before signing, because it is the gas.

   `name` is the only required field, because it is the only one whose absence causes the failure
   above. `agentId: null` in the self-entry is the convention, not a gap — a fresh mint cannot know
   its own id, and agent `1`'s file does the same for its Base entry. `setAgentURI` lets the owner
   replace the document later, and the probe confirmed it reverts `Not authorized` for anybody
   else.

**Base only, and that is a decision rather than a limitation.** Intuition's mirror covers Base, so
an identity minted on BSC is real and still unreadable by everything this app does next. `/agents`
already says as much in its lookup form: BSC and Ethereum hold registry entries with no trust edges
in the graph.

**The five-step testnet rig moved to `/rig`**, named for what it is, out of the nav. It mints into
ARP's registry copy, designates a runtime wallet, deploys a Smart Account, signs two delegations and
funds the runtime — a rehearsal of `docs/12` point 5 whose output is consumed by `scripts/`, not a
path a visitor takes. Deleting it would throw away the only end-to-end exercise of the delegation
machinery; leaving it at `/agent` claimed it was the way in.

**The chain toggle does not reach the mint, and must not.** The toggle picks which Intuition chain
the _market_ is on. The identity is on Base either way. Two different questions that are both
spelled "which chain", and conflating them is how an identity would get minted on the chain somebody
happened to be reading.

## Alternatives considered

- **Two routes with a chooser page in front.** One more click and the reader still learns that two
  flows exist. Rendering both branches on one page means they never have to.
- **Drive the branch off the chain toggle**, which is what the user first suggested. The axis is
  wrong: whether your agent already has an id has nothing to do with which Intuition chain you are
  reading. Saying so was more useful than implementing it.
- **Keep minting on testnet for now.** Offered as the alternative and declined. It is the safer
  change and it preserves the thing that makes the flow worthless — an identity nothing else can
  see.
- **Offer BSC as well.** Rejected above: real and unreadable.
- **Delete the rig.** It is the only exercise of the delegation path. `/rig` keeps it honest instead.
- **Read the new token id from the simulation's return value.** `register()` returns it and
  `simulateContract` hands it back, so it was free. It is the id the mint _would_ get if it landed
  next, and anybody may mint in between — so it is shown as a prediction and the fact is decoded
  from the `Registered` event in the receipt.

## Consequences

**Positive:**

- The app has a door for its own onboarding. Two pages that reached nobody are one page in the nav.
- A minted identity is a **real** ERC-8004 identity: visible to other readers, and eligible for
  Intuition's mirror. The flow stops being a rehearsal at its first step.
- `tokenIdFromReceipt` is scoped to the registry's logs **and** to the owner's own events, so a
  batching wallet carrying several mints cannot hand back somebody else's id.
- The failure mode that matters is named rather than papered over: if the mint lands and no
  `Registered` event can be decoded, the guard says the identity exists and refuses to offer another
  mint. A retry there would create a second permanent NFT.
- A missing fee estimate surfaces as "fees unavailable" rather than a cost of zero — the
  `claims.md` failure this screen is most exposed to.

**Negative:**

- **A third chain in the app.** `wagmi.ts` now carries Base beside the two Intuition chains, and a
  reader can be asked to switch to any of three networks depending on what they are doing. That is
  the protocol's actual shape (`docs/15` gap 1: identity on Base, staking on 1155), but it is one
  more thing to hold.
- **A published document, written once.** The registration file goes on chain and the owner is the
  only one who can replace it (`setAgentURI`). A typo in a name is a transaction to fix, not an
  edit. The form shows the exact bytes before signing for that reason.
- **Real ETH on mainnet Base.** Not covered by ADR `0017`, which is about TRUST deposits into
  existing vaults. It is the operator's own gas, human-signed, one click, and
  `security.md`'s canonical sentence is untouched — no agent or script signs it. But it is a new
  mainnet write surface and should be read as one.
- `YourAgent` renders `AgentImport` as a component rather than a route. It is 895 lines of
  self-contained state and rendering it inline was the cheap way to merge the pages without
  extracting it. If that page is ever rebuilt, this is the coupling to untangle first.
- The `/rig` page still says `/agent` in places the rename did not reach; its header now points at
  `/agent?have=yes`, but it is historical surface and has not been audited line by line.

**Neutral (worth knowing):**

- The next id on Base was **1,137,885** on 2026-10-27. This repo's notes carried 309,925, measured
  2026-10-20. Neither number belongs in any sentence that is not dated.
- `MINT_CHAIN as Chain` in `use-identity-mint.ts` is a cast with a comment: viem's chain objects are
  `const`-typed, so `createPublicClient({chain: base})` infers a client specialised to that literal
  and TS reports it as unrelated to the bare `PublicClient` the service takes.
- The **third** thing the inventory found is still not built: declaring a use has no page. That is
  the next piece, and `/atom/:atomId` is where it belongs.

## References

- Related rule: `.claude/rules/portability.md` rule 4 — never rely on controlling the registry
- Related rule: `.claude/rules/security.md` — the mainnet-signing sentence, unchanged
- Related ADR: `.claude/choices/0056-the-market-on-an-agent-is-on-its-atom-and-the-edge-is-a-receipt.md`
- Related ADR: `.claude/choices/0061-the-toggle-governs-writes.md`
- Related ADR: `.claude/choices/0017-arp-stakes-real-trust-on-mainnet.md`
- Measurement: `scripts/measure/canonical-registry.ts`
- Related doc: `docs/15_ROADMAP.md` gap 1 — identity on Base, staking on Intuition
