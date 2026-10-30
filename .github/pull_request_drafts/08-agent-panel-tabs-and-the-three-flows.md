# feat: the connector an agent declares through

**Branch** `feat/agent-panel-tabs` → `main` · 67 commits · 15 ADRs · Tasks 12, 15, 18, 20 and 24
complete, 16 half 1 complete, 17 built.

Four separable things. Review in this order — they get progressively more consequential, and the
last two are the ones that change what the project is.

1. **UI** — tabs on the agent panel, explanatory copy stripped. Tasks 12 and 15.
2. **The external verifier** — reads what an agent publishes and checks whether it holds up. Needs
   nobody's consent. Task 17.
3. **A write path that was writing into a node nobody queries.** ADR `0030`.
4. **The connector an agent declares through** — the loop `docs/12` calls "the whole gap". Task 16
   half 1, ADRs `0038`–`0039`.

Plus a rename that touches 34 import sites and no logic: ADR `0041`.

---

## 1. UI — tabs, and less prose

One tab per trust provider on the agent panel, Agent first and default. The explanatory copy is
gone from both the panel and the directory: a staker count is a person mark and a number, not a
sentence about what a staker count means. ADRs `0028`, `0029`.

## 2. The external verifier (task 17)

Give it an agent's registration document and it says which of three things it learned. The split
that matters, and the reason the module exists:

| group           | meaning                                               |
| --------------- | ----------------------------------------------------- |
| `confirmed`     | we reached it, or we proved it is dead                |
| `not-checkable` | nothing to probe — templated, non-HTTP, empty         |
| `inconclusive`  | the request failed in a way that may be **our** fault |

**`not-checkable` is not a failure.** 82% of declared endpoints landed there in the 2026-10-16
sample (4% on 2026-10-27 — the share follows whoever minted most recently), so
rendering it beside a confirmed defect would mass-slander the cohort. `partitionByCheckability`
exists so no caller re-implements that split. `classifyEndpoint` returns a discriminated union and
never a boolean, for the same reason.

The prober is deliberate about its own uncertainty: a timeout is `confirmed/dead`, a TLS or DNS
failure is `inconclusive`, and a 429 or 503 is never a verdict. It serialises **per host**, not
globally — one operator held 38 of 108 endpoints — and honours `Retry-After`.

Measured on Base 8453, 2026-10-16, `scripts/measure/cohort-endpoints.ts`: 52% of the sampled cohort
declares a protocol endpoint and **1–7%** answer (Wilson interval, n=122). The interval is the
finding; a point estimate there would be dishonest.

## 3. The `use`/`uses` fix — ADR `0030`

ARP was writing `use`. Measured object histograms on mainnet 1155 say `use` means **"supports this
protocol"** (153 of 158 edges) and `uses` means **"uses this tool"** (0 of 185 edges are protocols).
The predicate was picked on _publication_ and should have been picked on _meaning_. ARP now writes
`uses` — the frozen constant, never a minted one.

Twenty-one triples are stranded on the predicate ARP minted and abandoned. Testnet only,
2.1e-11 tTRUST, **not migrable** — Intuition has no deletion. Recorded rather than quietly dropped.

## 4. Task 16 half 1 — declare and deposit

An agent that already exists resolves its ERC-8004 identity, declares the tools it used, and
deposits TRUST on those declarations. `packages/protocol/src/declare/`, two MCP tools, a runnable
example, 44 tests.

**What a third party needs: a funded wallet and an ERC-8004 identity. No API key.** A tool's atom
derives from its URI, and the identity atom already exists for the mirrored cohort, so nothing is
pinned.

### The design decision — ADR `0038`

**The connector prepares calls and never signs or sends one.** It returns
`{chainId, to, value, data, why}` for the agent's own runtime to sign with its own key. The package
holds no key, builds no wallet client, and has no send path — so it **cannot** spend an operator's
TRUST even by mistake. ADR `0035`'s "ARP is not a party" becomes a structural property instead of a
promise, and it is checkable: zero hits for
`createWalletClient|privateKeyToAccount|sendTransaction|writeContract|signTypedData|PRIVATE_KEY`
across the whole package.

Two signing modes. **Direct** — sign the calls as they come, the signer's own TRUST is spent.
**Delegated** — the operator signs one delegation up front with caveats bounding the spend, and the
runtime redeems against it. One redemption per call, never a batch: the framework's own reference
says batch mode "does not currently have compatible caveat enforcers", and ARP's
`TrustStakeCapEnforcer` guards `beforeHook` with `onlySingleCallTypeMode`. The guard rail is not the
price of entry.

### The deposit goes on the edge, not the tool's atom — ADR `0039`

Two vaults can carry a deposit about one tool, and they are different claims. The triple's vault
says "I stand behind the claim that this agent used this tool"; the atom's vault is a market on the
tool in general, open to anyone for any reason.

ARP had already picked both, in different files. `getToolUsage` prices the **triple**;
`scripts/agent-stake-on-use.ts` deposits on the **atom**. So ARP's own writer put TRUST where ARP's
own reader cannot see it. **Latent, not live** — that script's only callers are set-aside hackathon
surface — but it is the file task 16 was told to adapt.

Measured on mainnet 1155 before deciding, all curves, over the 185 `uses` edges that exist
(`scripts/measure/stake-vault-placement.ts`):

| vault             | edges with positions | assets                                 |
| ----------------- | -------------------- | -------------------------------------- |
| the edge (triple) | 110 of 185           | 245.776495 TRUST                       |
| the object's atom | 146 of 185           | 2,673,997 TRUST over 84 distinct atoms |

**74 of those 185 carry stake only on the atom**, invisible to any reader of the edge. The atom
figure is larger and answers a different question.

### Two defects a review caught, both permanent and neither reverting

**No `chainId` on the prepared call.** Each MultiVault is **codeless on the other chain**
(`eth_getCode` → `0x`), and a value-bearing call to a codeless address does not revert — it is a
plain transfer that succeeds. A testnet plan signed against mainnet would send 0.1 TRUST per call to
an address nobody controls, silently. The chain is now on every call, because a wallet is handed one
call at a time.

**A raw `https://` tool URL minted an off-canon atom.** Of the 84 tool atoms on mainnet `uses`
edges, 78 are `ipfs://` and 77 of those resolve a pinned Thing; the only two raw-URL atoms in the
set are `schema.org` vocabulary terms, not tools. A bare URL atom carries no metadata and splits the
tool's reputation across two permanent ids. Fixed with a graph read and **no pin key**: one match is
reused, none creates a bare atom and warns in the plan, and **several refuses** —
`https://github.com` resolves to five atoms, and choosing one would write a permanent edge onto an
arbitrary id.

## 5. The rename — ADR `0041`

`erc8004/` → `packages/protocol/` (`@arp-protocol/core`), and `sdk/` folded into
`packages/protocol/src/arp/` and deleted. The names lied: `erc8004` read as "an implementation of
the standard" and was the protocol layer entire, while two packages did one job with no boundary
written anywhere. `arp/` is that boundary — everything under it reads ARP's own deployment.

`app/` does **not** absorb the protocol layer, and the reason is measured:
`app/src/lib/deployments.ts:1` imports `data/deployments/13579.json` **at module load**, and ~12 sites
hardcode `chain: intuitionTestnet`. That binding is deliberate, but it means anything built in
`app/` needs porting site by site for mainnet, which is the goal.

34 files rewritten, no logic changed.

## What this does not do

- **Nothing has been signed or sent on any chain.** The whole write path is verified read-only
  against live mainnet: identity resolved, ids computed, costs read, plan priced. Crossing that line
  needs an operator who decides to spend.
- No contract is deployed to mainnet **by this branch**, and no registry is planned there. Two
  caveat enforcers have been on 1155 since 2026-09-16 (ADR `0025`); neither has ever fired.
- `hire` and `rate` are not here. They moved to `tasks/25` with the full spec.
- Phase 0 of the roadmap is **not** closed: identity resolution still does not route through
  `resolveAgent`, deferred with an owner (`tasks/19` step 1b).

## A correction this branch makes to its own record — ADR `0040`

Five places in the repo, **including a rule file**, asserted that the triple fee "sits outside
`TrustStakeCapEnforcer`, which bounds the deposit only", and `docs/15` listed it as one of two gaps
testnet can never close. It is false: the enforcer decodes `value` out of the execution and nothing
else (`TrustStakeCapEnforcer.sol:101`; its NatSpec says "Only `value` is consumed"; and a test caps a
call with empty calldata). It is a native-spend cap. The true, narrower limitation is that **the cap
bounds the amount, not the kind** — an operator's cap can be burned on non-recoverable fees instead
of invested in positions.

## Gates

| gate                      | result                                      |
| ------------------------- | ------------------------------------------- |
| `packages/protocol` `tsc` | 0                                           |
| `packages/protocol` tests | 292 passed / 4 skipped                      |
| `app` `tsc -b`            | 0                                           |
| `app` `eslint`            | 0                                           |
| `app` tests               | 205 passed / 2 skipped                      |
| testnet rig gate          | 4 claims checked · 0 mismatched · 0 drifted |

**What these gates do not cover**, and it is worth a reviewer's attention: `scripts/` is inside **no
typecheck and no lint** — there is no root `tsconfig.json` and no root eslint config. This branch
added two scripts there, so it widened that gap rather than narrowing it. `tasks/21` owns it, and
it is not zero-cost to close: two ad-hoc configs disagreed on the error count (6 against 24), so it
needs measuring with a committed one. The write path itself is inside every gate, because it lives
in the package and not in `scripts/`.

`prettier --check` fails repo-wide — run it rather than trusting a count here; it is long-standing
and recorded as a known defect. Every file this branch created or edited is clean.

## Where to start reading

- `docs/12_THE_IDEA.md` — the only canonical statement of the mechanism, and short
- `.claude/choices/0038-the-write-path-is-a-plan-not-a-transaction.md` — why the connector cannot
  sign
- `.claude/choices/0039-the-deposit-goes-on-the-edge.md` — which vault, and the measurement
- `packages/protocol/README.md` §"Declaring what your agent used" — the third-party surface
- `.claude/rules/claims.md` — what may be asserted here, and the measured failure that produced it

🤖 Generated with [Claude Code](https://claude.com/claude-code)
