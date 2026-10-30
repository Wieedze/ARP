# 21 — Running the loop with a real agent

How to make an agent go from a need to a receipt, and how somebody who does not trust us checks
that it happened.

First run: **2026-10-29, Intuition testnet 13579**. Every id and hash below is from it.

The point of this document is not that the loop ran here. It is that the four commands below are
the whole of it, and anybody can run them against their own wallet and get a record we cannot
edit.

---

## 1. What the loop is

`docs/12`, in five steps. ARP is responsible for two of them.

| | | ARP's part |
| --- | --- | --- |
| 1 | the agent has an identity | an ERC-8004 token, and an atom the graph can use as a subject |
| 2 | **it has a need and finds a tool** | **`arp_find_tools`, over a domain tree** |
| 3 | it uses the tool | none. Not our business and not observable from outside |
| 4 | **it declares what it used** | **`(agent, uses, tool)`, written by the agent's own key** |
| 5 | it puts TRUST behind the declaration | a deposit on that edge's vault |

Step 3 is the gap nothing closes. ARP never claims the use happened — `docs/14` is the argument
for why nobody can. What it records is that somebody **paid to say** it happened, which is a
different and checkable thing.

## 2. What you need

```
a wallet with tTRUST       about 0.01 for one full walk, from the faucet
an ERC-8004 token          on 13579, so the agent has an identity to speak as
AGENT_PRIVATE_KEY in .env  read by the sender, never printed, never in an agent's context
the node running           bun run apps/mcp/src/server.ts, on :3002
```

Nothing else. No account with us, no key from us, no allowlist.

## 3. The four commands

```bash
# the node answers questions. It signs nothing and stores nothing.
ARP_TARGET=testnet bun run apps/mcp/src/server.ts

# dry first. Prints every figure and spends nothing.
ARP_TARGET=testnet bun run scripts/demo-loop.ts --need image --agent 13579/6 --stake 0.002

# then for real.
ARP_TARGET=testnet bun run scripts/demo-loop.ts --need image --agent 13579/6 --stake 0.002 --execute
```

`--need` is a domain in the tree. List them yourself rather than taking ours:

```bash
bun run scripts/verify-domain-tree.ts
```

## 4. What each step proves, and what it does not

### Step 1 — the question

```
arp_find_tools { domain: "image" }
```

Asked over HTTP, so the same call from anywhere returns the same rows. The answer names the
**attestor** it was read through, because `has tag` is permissionless to write and a filing is only
an index when read through one chosen set of positions. That address is a property of the node, not
a request parameter — an agent cannot widen its own scope by asking.

### Step 2 — the answer

Eight tools came back for `image` on the first run. **None of them was given to the agent.** That
is the step the rest of the walk depends on and the one a hand-written demo always skips: anyone
can stake on a tool they were told to stake on.

### Step 3 — the choice, recomputed

The chosen tool's URI is derived from its normalised URL (ADR `0054`), locally, with no network:

```
github.com/magentosh/superpowers?skill=product-photography
→ ipfs://bafkreihi7pqxcly2pty72ymzlbrrwejwfvpcpq5vinzi2vgzysx2nuec6e
→ atom 0x02cc3ce7a6f521fec0a3a6ae6c9160ec6ecc160feebeed0cfb7d1f9fe9453a79
```

So the id is not something we told the agent. It is a pure function of a string anybody has.

### Step 4 — identity, declaration, stake

Three writes, signed by the agent's own key. From the first run:

```
0x6adea4ec83952163767790c5102c3aa6c685e9f0ecd41b7eb007dfa44e6cb420   the CAIP-19 atom
0x8b0b19104510f8fb788468cfb8f29571382cc6a44a2df09d50a182e4c8b40d2d   identity --same as--> it
0x44e07e37b44a750fd2bf739664132f85715c3f99c140b7dc82c15339dcde33b1   (agent, uses, tool)
0x81cd8f07a98fc52ee073bacb2324b3f422c5e1a8f6e05a25b317ecd852d90648   the deposit
```

Total: **0.008 tTRUST**, plus gas. The identity is paid once per agent; a second declaration costs
0.004.

**Declaring and staking are two transactions on purpose.** A declaration with nothing behind it is
a sentence; the deposit is what makes it weigh something, and keeping them separate means the
difference is visible rather than assumed.

## 5. How a stranger checks it

Nothing below asks us for anything. Substitute your own ids.

**The edge exists, and what stands behind it:**

```graphql
query {
  triples(where: {term_id: {_eq: "0x2fed489b586933bc46acc0c8efcba9093a7c28a5e2fd73db3c3469b26d873d8c"}}) {
    subject { label }
    predicate { label }
    object { label }
    term { vaults { position_count total_assets positions { account_id shares } } }
  }
}
```

against `https://testnet.intuition.sh/v1/graphql`. On the first run it answers:

```
Agent 13579:6  —uses→  github.com/magentosh/superpowers?skill=product-photography
1 position · 0.002970000001 tTRUST
```

**The triple id itself is derivable** — `calculateTripleId(subject, predicate, object)` on the
MultiVault, with the three atom ids, no credential. So you do not have to trust that we gave you
the right id either.

**The same thing in the app:** `/atom/<tool atom id>` shows the edge in the gravity field and in
the claim list; `/tools` shows the tool under "Most claims".

## 6. What this run does not prove

Said plainly, because the list is short and it is the honest part:

- **Not that the tool was used.** Nothing on a chain can see that. What is proven is that an
  identified agent paid to say so, and that it cannot take the saying back without the record
  showing a withdrawal.
- **Not that the tool is good.** A declaration is one agent's conviction with a price on it. ARP
  composes no score from it (ADR `0046`); the page gates on liveness and sorts on an axis the
  reader picks.
- **Not that the agent is not us.** On the first run the signer is ARP's own testnet key. That is
  the honest limit of a first walk, and the thing a second party running these same four commands
  fixes — which is the whole reason this document exists.
- **Not mainnet.** Chain 13579, test tokens. No ARP registry is on mainnet and none is planned
  (ADR `0025`).

## 7. The first run, in full

```
need       image
agent      13579/6
node       http://localhost:3002/

1. arp_find_tools { domain: "image" }      8 tools, read through 0x906f3A52…
2. chose #1                                magentosh/superpowers?skill=product-photography
3. recomputed the URI locally              ipfs://bafkreihi7pqxcly2…
4. identity + declaration + stake          4 transactions, 0.008 tTRUST
5. read back as a stranger                 Agent 13579:6 declares 2 tools
                                           the edge carries 1 position, 0.00297 tTRUST
```

Reproduce it with `scripts/demo-loop.ts`, or disbelieve it with the GraphQL query in §5.
