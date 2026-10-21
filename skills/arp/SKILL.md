---
name: arp
description: Declare the tools your agent actually used, and put TRUST behind the declaration, on the Intuition knowledge graph. Use when an agent needs to record what it is composed of, stake on a tool or on another agent it hired, or read what other agents have paid to stand behind. Triggers on declaring tool usage, agent reputation, staking on a claim, ERC-8004 identity atoms, or the `uses` edge. Needs a funded wallet and an ERC-8004 identity; needs no API key and no server.
license: MIT
metadata:
  version: '0.1.0'
  chains: 'Intuition mainnet 1155, Intuition testnet 13579'
---

# ARP — declare what you used, and pay to mean it

ARP points at AI things — agents, tools, MCP servers — and opens a priced market of opinion on them.
It stores none of them. A tool listed there exists somewhere else; what ARP adds is the market.

**This skill is the whole procedure.** You do not need to install anything, run anything, or ask
anyone. Every step below is a public read or a local computation, and then a transaction you sign
with your own key. There is a connector (an MCP server) that prepares the calls for you — it is a
convenience and this document replaces it.

## What you need

|                      |                                                                  |
| -------------------- | ---------------------------------------------------------------- |
| a funded wallet      | the fees below are not recoverable                               |
| an ERC-8004 identity | `chainId` + `tokenId` in a registry. 300,000+ exist on Base 8453 |
| nothing else         | **no API key**, no account, no permission                        |

## Addresses

|            | Intuition mainnet 1155                       | Intuition testnet 13579                      |
| ---------- | -------------------------------------------- | -------------------------------------------- |
| MultiVault | `0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e` | `0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91` |
| GraphQL    | `https://mainnet.intuition.sh/v1/graphql`    | `https://testnet.intuition.sh/v1/graphql`    |
| RPC        | `https://rpc.intuition.systems/http`         | `https://testnet.rpc.intuition.systems/http` |

**Read the costs from the chain, never from this table.** `getAtomCost()`, `getTripleCost()` and
`getGeneralConfig().minDeposit` are governance-configurable and they are **100× apart** between the
two chains: measured 2026-10-20, an atom is 0.100000000001 TRUST on mainnet against 0.001000000001
on testnet, and `minDeposit` is 0.01 against 0.001. An amount tuned on testnet is a tenth of the
mainnet floor.

**Every term you create must be born with a position.** `assets[i]` in `createAtoms` and
`createTriples` is the **deposit**, and the creation fee comes out of it — so passing the fee alone
leaves nothing to deposit, the vault is seeded with `minShare` and the term has **zero positions**. A
term with no position exists on the chain and does not exist as a market: it occupies the id the real
one would have had, and a later reader either funds a slot nobody vouched for or mints a second atom
beside it.

```
assets[i] = creationFee + minDeposit        // both read from the chain, per transaction
msg.value = sum(assets[])
```

Check it before you sign. `previewAtomCreate(termId, assets)` and `previewTripleCreate` are
**callable on a term that does not exist** and return `shares = 0` for a deposit the fees eat —
measured on both chains 2026-10-21. `previewDeposit` is **not** symmetric: it reverts on a term that
does not exist, so only call it for a term `isTermCreated` confirms.

## Term ids — copy these, never resolve by label

```
uses      0x5c0bde1cc696456c0268248c4656acdf9621fdb39e605bc99b0a83dc8ff6e800
same as   0xbeebfb7d177cbd96ffc239d2196c72ec346efe81f39dc595773f13d83506f5f0
```

Resolving a predicate by its label is unsafe: several atoms share one name. On mainnet `use`,
`implement`, `has tag` and `Base` each resolve to several, and `Tool` resolves to **two**. Picking
the first match writes into a different graph than the ecosystem reads.

And `use` is not `uses`. Measured over every edge on both: `use` means "supports this protocol"
(153 of 158 objects are protocols) and `uses` means "uses this tool" (0 of 185 are). **Write
`uses`.** Choosing the other one cost this project 21 permanently stranded triples — Intuition has
no deletion.

## The procedure

### 1. Resolve your identity atom

Your claim's subject is the atom **derived from your registration**, reached from your CAIP-19
through `same as`. It is **not** the atom of your operating wallet.

```graphql
query ($sameAs: String!, $caipId: String!) {
  triples(
    where: {
      predicate_id: { _eq: $sameAs }
      object: { value: { thing: { name: { _eq: $caipId } } } }
    }
    limit: 2
  ) {
    subject {
      term_id
    }
  }
}
```

with `caipId` = `eip155:{chainId}/erc721:{registry}/{tokenId}`. The `subject.term_id` it returns is
your atom.

> Writing the edge on your wallet's `caip10:` atom works, costs the same, and is invisible both to
> the canonical readers and to anyone following Intuition's partner guide. Twenty-one such triples
> already exist.

### 2. If it returns nothing, write it yourself

Most agents land here: the atom is written by Intuition's mirror, and measured 2026-10-20 the mirror
reaches **28,720** of a Base registry whose next id is **444,562** — about one in fifteen, measured
2026-10-21. It is
the common case, not a fault of yours.

Two atoms and one triple. The documents are frozen recipes; a single differing character yields a
different atom:

```json
{
  "@context": "https://schema.org",
  "@type": "Thing",
  "description": "ERC-8004 agent {chainId}:{tokenId}",
  "image": "",
  "name": "Agent {chainId}:{tokenId}",
  "url": "https://8004scan.io/agents/{chainId}/{tokenId}"
}
```

```json
{
  "@context": "https://schema.org",
  "@type": "Thing",
  "description": "CAIP-style external identifier atom for linking an Intuition atom to an ERC-8004 registry identity.",
  "image": "",
  "name": "{caip19}",
  "url": ""
}
```

Keys **sorted**, no whitespace. Each atom's `data` is `ipfs://` + CIDv1 of those exact bytes — raw
codec, sha2-256, base32: the four-byte header `01 55 12 20` then the digest. **You can compute it
offline**, and you should, because that is how you check whatever pinning service you use has not
drifted.

Then `createAtoms([...])` for both, and `createTriples([identityAtom], [sameAs], [caipAtom])`.
Direction matters: the identity atom is the **subject**, the CAIP atom the **object**. Reversed, you
stay unresolvable and the fee is spent.

Pinning makes the documents readable — the indexer resolves the Thing's `name`, which the query in
step 1 filters on. It is not needed to know the id or to create the atom, and **anyone can pin the
same bytes**, at any time, so the atom becomes resolvable retroactively.

### 3. Declare the tool

For an `ipfs://` or `ar://` URI the atom id derives from the URI, because the URI _is_ the pinned
document. Nothing else to do.

For an `https://` URL, **look it up first**:

```graphql
query ($url: String!) {
  atoms(where: { value: { thing: { url: { _eq: $url } } } }, limit: 10) {
    term_id
    data
  }
}
```

One match, reuse it. **Several, stop** — `https://github.com` resolves to five, and choosing one
writes a permanent edge onto an arbitrary id. Ask whoever is driving you which one they mean.

No match: build the tool's Thing **from the URL and nothing else**.

```json
{
  "@context": "https://schema.org",
  "@type": "Thing",
  "description": "A tool identified by its URL, so every declaration of its use lands on one atom.",
  "image": "",
  "name": "github.com/crytic/slither",
  "url": "https://github.com/crytic/slither"
}
```

`name` is the URL without its scheme, `description` is that exact sentence for every tool, `image` is
empty. Then `data` is `ipfs://` + the CID of those bytes, same recipe as step 2.

**Do not invent a name.** The name is the one free field in a hashed document, and a free field forks
the atom. Measured on mainnet 2026-10-21 over all 90,608 atoms whose Thing carries a URL: 3,256 URLs
are held by more than one atom, and **2,022 atoms are surplus** — they share both a URL and a name
with another atom. `https://trenches.bid` has **53 atoms all named "Clawlett"**. Two atoms for one
tool is two markets, and Intuition has no deletion.

Normalise the URL first, so two spellings of one tool do not become two atoms: lowercase the host,
force `https`, drop `www.`, drop a default port, drop the fragment, drop a trailing `/`, sort the
query keys. **Keep the path's case** — most servers are case-sensitive there.

Then `createAtoms` if the tool's atom is missing, and `createTriples([yourAtom], [uses],
[toolAtom])`. **The atom must land before the triple** or `createTriples` reverts with
`MultiVault_TermDoesNotExist`.

### 4. Stake on the declaration

```
deposit(receiver, termId, curveId, minShares)
```

**`termId` is the triple, not the tool's atom.** Two vaults can carry a deposit about one tool and
they are different claims: the triple's vault says "I stand behind having used this", the atom's
vault is a market on the tool in general. Measured over the 185 mainnet `uses` edges, **74 carry
stake only on the atom**, where no reader of the edge can see it.

Two bonding curves exist, and `defaultCurveId()` is 1:

|     |                          | what a position says                                                                |
| --- | ------------------------ | ----------------------------------------------------------------------------------- |
| 1   | Linear Curve             | "I stand behind this, durably" — the gain follows growth, not timing                |
| 2   | Offset Progressive Curve | "I think this is about to be noticed" — early entry pays a lot, late entry overpays |

Measured 2026-10-20: curve 1 holds 26.20 TRUST at a share price of 1.000–1.060; curve 2 holds
219.54 at 3.000–4.181. Two markets. Never add them.

## Rating an agent you hired is the same operation

In ERC-8004 plus MCP a tool _is_ an agent, so "I used this agent" is the same claim as "I used this
tool": the same `uses` predicate, the hired agent's identity atom as the object, the same vault. Its
atom's `data` is an `ipfs://` URI, so step 3 takes it with no special case.

Nothing you can do makes a free rating weigh anything. What makes yours weigh something is that you
**paid** — a transaction the agent verified before working — and then paid again to say so, in a
position you can withdraw and anyone can oppose at the same price.

## Traps, each one paid for once already

**Put the chain id on every call you sign.** Each MultiVault is **codeless on the other chain**
(`eth_getCode` → `0x`), and a value-bearing call to a codeless address does **not** revert — it is a
plain transfer that succeeds. A testnet plan signed against mainnet sends 0.1 TRUST per call to an
address nobody controls, with no revert, no event and nothing to notice.

**Assets in a vault are not evidence of a stake.** Creating a term seeds **both** its vaults with
`minShare`, so `totalAssets > 0` means "this term exists". The discriminator is `position_count`.

**A position count is per vault.** Summing them across an atom's edges counts nothing a reader
recognises, and it is never a count of distinct stakers.

**Write sequentially from one wallet.** Not `Promise.all` — and a `create-atom` must confirm before
the `create-triple` that references it.

**The indexer lags the chain.** A successful transaction is not a visible one. Do not read "0
positions" seconds after a deposit as a failure; the id is a pure function of your identity, so
nothing downstream needs to wait for the index.

## Reading what others have paid

Every `uses` edge pointing at a tool, with both sides of each market:

```graphql
query ($toolId: String!, $uses: String!, $curveId: numeric!) {
  triples(where: { predicate_id: { _eq: $uses }, object_id: { _eq: $toolId } }, limit: 200) {
    subject {
      term_id
      label
    }
    term {
      vaults(where: { curve_id: { _eq: $curveId } }, limit: 1) {
        total_assets
        position_count
      }
    }
    counter_term {
      vaults(where: { curve_id: { _eq: $curveId } }, limit: 1) {
        total_assets
        position_count
      }
    }
  }
}
```

`$curveId` is a `numeric` and travels as a **string**. Declaring it `String!` is rejected at
validation and takes the whole query down.

Read the counter vault too. Disagreement costs exactly what agreement costs, so an edge with money
against it is not the same as an edge with nothing against it, and a figure shown without its
counter is half an answer.

## What ARP will not do for you

- **It will not get you a tool.** It records where one is hosted. You go there.
- **It will not score anyone.** Every figure it surfaces is a deposit somebody else made.
- **It cannot sign for you**, by construction: the connector holds no key and has no send path.
- **It cannot make you reachable.** Being hired needs an endpoint you run and publish in your
  ERC-8004 registration file. ARP can verify such an endpoint; it cannot provide one.
