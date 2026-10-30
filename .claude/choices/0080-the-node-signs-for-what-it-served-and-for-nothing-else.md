# 0080 — The node signs for what it served, and for nothing else

**Status:** Accepted
**Date:** 2026-10-29
**Triggered by:** `docs/tasks/31` §6, which says this decision needs an ADR because it changes what ARP
**is**. The user's correction that made it necessary, 2026-10-29: _« si tu passes par ARP pour avoir
l'accès à une info, alors l'info est calculée quelque part et alors tu peux avoir la preuve de
l'accès à cette info »_

## Context

`docs/14` has said since it was written that a use cannot be witnessed. The reasoning was sound and
the conclusion was too absolute, and the user said so.

An agent's declaration — "I used this tool" — is the agent's word about the agent. ADR `0046` keeps
ARP from composing that into a score, `docs/09` §3's ladder puts it on the **staked** rung because
somebody paid to say it, and nothing in the system could move it further. The rungs above needed a
second party, and ARP had no way to be one, because ARP was only ever read:

|            |                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| ADR `0038` | the connector prepares calls and **never signs or sends**. No key anywhere in the package                                     |
| ADR `0045` | the node runs on the operator's machine. ARP has **no visibility into what an agent executes**, and that half is load-bearing |
| ADR `0035` | ARP is not a party to the loop. _« je ne dois pas exister dans cette boucle »_                                                |

**If ARP serves the content, ARP is a party to that exchange** — not to the agent's execution, which
stays unobservable, but to the fetch. And a party can sign:

```
the node's receipt    "I served this file to this key at T"    signed by the node
the runtime's log     "I invoked this skill at T"              written by the hook, not by the model
```

Two records, two parties, interests that do not coincide. That is a two-party fact about the
**access**, and nothing in this repo could produce one before.

It needs no ZK, and that is worth stating because the instinct is strong and wrong. A proof would
have to attest a computation, and the computation here is a language model reading instructions.
There is no statement to prove. Two signatures do the job and cost nothing.

There is a second reason, and it is the half that is about identification rather than about
evidence. `packages/protocol/src/session.ts` refuses to resolve a skill's **name**, because a name
does not identify a tool: measured 2026-10-29, 104 of 499 distinct skill names are carried by more
than one repository with byte-identical files, and `product-photography` exists in six. A runtime
hands a name and not an origin. What ends the ambiguity is a **reference**, and the reference has to
come from whoever served the bytes.

**The node holds no key today.** `scripts/arp-mcp-server.ts` has none; the only keys in the
repository are in `scripts/demo-*.ts` and `scripts/agent-send-plan.ts`, and they are the agent's.
This ADR introduces the first one on ARP's side, which is why it exists.

## Decision

**The node may hold a key, and that key signs content receipts and nothing else.**

Six constraints, and they are the decision rather than commentary on it:

1. **A receipt attests access, never use.** Whether the bytes changed what the agent did stays
   unobservable. `docs/14` gains the correction that a use is unwitnessable **in general** and that
   two-party corroboration is available where ARP is in the path — not that the problem is solved.

2. **A receipt can only add, never subtract.** A declaration already stands on its own. A reader who
   distrusts the signer ignores the receipt and is back to exactly the declaration they had before.
   There is no bottleneck to become, because nothing routes through the key: the index stays open,
   the chain stays readable, and no receipt can revoke an edge.

3. **The signing key cannot move value.** It is not a wallet, it never holds TRUST, and it is not
   the key any plan is signed with. ADR `0038` stands **unamended**: the plan path still has no key,
   and `packages/protocol/src/receipt.ts` takes a signer as an argument rather than constructing one,
   so the module itself cannot sign without being handed the ability.

4. **A receipt names its signer, and nothing assumes one node.** A reader decides which signers it
   accepts, the same way ARP's index already names the attestor it reads through. Verification
   recovers the signer and reports a mismatch rather than a verdict on the claim.

5. **The index is not gated behind the receipt.** `arp_find_tools` answers anyone. An
   unauthenticated fetch is served with `to: null`, and the receipt that comes with it corroborates
   nobody — which `verifyContentReceipt` reports as `namesNobody` rather than hiding. The receipt is
   what has a price; the content is not.

6. **ARP hosts nothing.** The node fetches from the origin the atom names and passes the bytes
   through. A cache of bytes is a mirror, and a mirror is a different product with different
   obligations.

### The receipt is EIP-712, not the EIP-191 the task sketched

`docs/tasks/31` §5.2 proposed EIP-191 over a canonical encoding. The reason for changing it is specific
and is the kind of thing that is invisible until it is exploited:

**An atom id is a pure function of its normalised URL** (ADR `0054`). So the same tool has the
**same atom id on testnet 13579 and on mainnet 1155**. A receipt with no chain inside the signed
payload verifies identically against both, and a mainnet receipt is the one that implies real value
moved. The EIP-712 domain carries `chainId`, so it cannot. There is a test for that replay.

It also avoids hand-rolling canonical JSON — `canonicalize.ts` is correct, and key order, unicode
and number formatting remain a standing footgun — and it is the mechanism `signature.ts` already
verifies for third-party documents and `agent-import.ts` already signs with. One pattern in the
repository rather than two.

There is deliberately **no `verifyingContract`**, for the reason `agent-import.ts` gives at its own
domain: no contract checks this signature, and naming one would imply an on-chain check that does
not exist. `.claude/rules/security.md` asks for nonce + chainId + verifying contract; the first two
are present and the third is absent with cause. The honest note on the nonce is that replaying a
receipt buys nothing — it attests access, and `resolveInvocations` neither weights repeats nor sums
them (ADR `0046`) — so it is there to make two fetches in the same second two records rather than
one signature twice.

### The digest is sha256 and the path is in the payload

**sha256, not keccak256**, because a stranger checking a receipt runs `sha256sum` on their own
machine. With keccak they would have to trust a library of ours, and `docs/14`'s test for a signal
is that a third party can check it without asking us.
`scripts/measure/skill-content-duplicates.ts` made the same argument for git's blob sha.

**The path, because the atom does not carry one.** Measured 2026-10-29 by
`scripts/measure/skill-layouts.ts` over all 31 catalogued repositories and all 662 catalogued
skills: 19 distinct layouts, 8 repositories using more than one, **46 skills existing at several
byte-identical paths** inside one repository and 2 at paths whose contents differ. An atom names a
repository and a skill; only this field names the file, and without the file a verifier cannot find
the bytes the digest is over.

## Alternatives considered

- **A zero-knowledge proof of use.** There is no statement to prove. The computation is a model
  reading instructions, and a proof system needs a predicate over a trace nobody has.
- **A TEE attesting the harness.** It would raise the rung further — it attests that the logged call
  really happened in an unmodified runtime. It is heavy, it binds the operator to specific hardware,
  and nothing about this decision blocks it later.
- **The hook signs its own log.** A keypair in the hook makes the agent's half signed as well as
  recorded. It is **smaller than this, additive to it, and not an alternative**: it strengthens the
  agent's record and says nothing about the access. Worth doing; not instead.
- **Do nothing.** The declaration stays the agent's word, and `session.ts` keeps refusing every
  ambiguous name — 104 of 499 distinct names — because no reference ever arrives. That is the cost
  of this option and it is why it was rejected.
- **Make the path compulsory.** Gate the index, or refuse to read a declaration that has no receipt.
  Rejected flatly: it would make ARP exactly the dependency ADR `0045` was written to remove, and
  it would convert a difference in what a claim is **worth** into a gate on who may **make** one.

## Consequences

**Positive:**

- A declaration from an agent that came through the node is a two-party fact about the access.
  Nobody else can produce it, because nobody else is at the discovery, the fetch and the call —
  **and only where the signer is not the agent's own node**, which the resolution below settles by
  making the two distinguishable from the receipt rather than by forbidding one of them.
- `session.ts`'s ambiguity problem closes as a side effect: the response carries the atom it is, the
  hook logs that as its `ref`, and six candidates become one.
- Verification is public and cheap. `verifyContentReceipt` recovers the signer;
  `receiptMatchesContent` needs no signature at all — fetch the origin at `path`, hash it, compare.
- The measurement the resolver needed produced a **per-skill liveness signal** nobody had: 139 of
  662 catalogued skills have no file at HEAD, and 95 of those sit in a repository with nothing
  uncatalogued the name could have been renamed to. One listing request re-derives it, which is
  sharper than `archived` — per skill rather than per repository, and not the owner's own word.

**Negative:**

- **ARP now holds a key**, so there is something to lose that there was not before. Constraint 3 is
  what bounds the loss: it cannot move value, and a compromised receipt key forges corroboration it
  cannot forge money with. A reader who stops accepting that signer is back to the declaration.
- **The node can be bypassed.** It runs on the agent's machine. Bypassing is a deliberate act and it
  costs the corroboration, which is the whole of the incentive: _the mechanism does not need to be
  unavoidable, it needs to be worth not avoiding._
- **A receipt stops matching when the repository changes under the path.** The digest pins content,
  not a commit, so an honest receipt can fail `receiptMatchesContent` later. A failure there is not
  evidence of forgery and `receipt.ts` says so rather than hiding it. Pinning to a commit is
  available and is not the default, because the question an agent asks is "give me this skill" and
  not "give me this skill as it was".
- **141 of 662 skills cannot be served at all** — 139 absent, 2 ambiguous with differing content. The
  endpoint refuses rather than guessing, so those agents get no corroboration and the index still
  answers about them.
- **Self-dealing still pays.** Fetch your own skill, declare you used it, stake on it: every step is
  real and nothing is faked. What detects it is reading **who** declares — distinct declarers rather
  than declarations, and whether declarer and tool share an address. Both belong on the reading
  side, and ARP publishes the figures rather than applying a correction (ADR `0046`).

**Neutral (worth knowing):**

- ADR `0045`'s **invariant** is about the request path — an agent reaching another agent — and that
  is untouched: ARP still cannot make an agent reachable. What this adds is an **optional** content
  path. An agent that cannot reach the node still declares; it declares without corroboration.

  **But this ADR amends `0045` and the first version of this paragraph said it did not.** ADR
  `0045`:56 states _"The node holds no key"_ as a decision, and this gives it one. The sentence
  above was written as though only the invariant were in question, which is the `claims.md` §5
  failure — a decision stated in two places and corrected in one — committed inside the ADR that
  changes it. `0045`'s reasoning for that sentence is in the **open question** below, because it is
  an argument against this decision and not merely a wording to patch.

- ADR `0046` is untouched. A receipt is one more figure beside the others, never a weight. It does
  not rank, it does not gate and it composes with nothing.
- The key's location, rotation and what an installer is trusting are **not settled here**. The node
  is `scripts/arp-mcp-server.ts` today and the user has asked for a written account of its files and
  its trust surface before anyone is asked to install it. That account is owed and this ADR does not
  substitute for it.
- Nothing is on mainnet. Chain 13579 throughout, and `security.md`'s mainnet-signing statement is
  unaffected — a receipt key is not a key that signs a transaction.

## Amended hours later: the receipt cannot say which — the reader decides

`intuition-integrator`, same day, on the code this ADR authorised. The resolution below is kept as
written and its headline sentence is wrong:

> **"the receipt says which"** — it does not, and `corroborationOf`'s first version proved it by
> labelling every locally-served receipt `second-party`.

The node an operator installs **generates its own key**, so its address differs from that
operator's agent key while the same hand holds both. Three keys, one operator, and the label said
two parties — the strongest verdict for the weakest case. `self-signed` was unreachable except by
deliberately pointing `ARP_RECEIPT_KEY` at the declaring key, which nobody will do.

The mistake was comparing **keys** where this ADR argues about **hands**, and no better comparison
closes it: an operator-run node's key is unlinkable to their agent's key.

**What does distinguish them is the reader, and this ADR had already said so.** Constraint 4: _a
reader decides which signers it accepts, the same way ARP's index already names the attestor it
reads through._ So that decision is a parameter rather than a principle:

| verdict          | when                                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `second-party`   | the signer differs from the declarer **and the reader accepts that signer**                                                                    |
| `unknown-signer` | the signer differs and the reader does not know it. May be a second party, may be the operator's own node, and nothing in the receipt can tell |
| `self-signed`    | the signer **is** the declaring address. One key, the only visible same-hand case                                                              |
| `other-caller`   | a genuine receipt about somebody else's fetch                                                                                                  |
| `names-nobody`   | the fetch was unauthenticated                                                                                                                  |

`ARP_ACCEPTED_SIGNERS` is where a node's reader names them, and **empty is the honest default**.

Two more from the same review, both of the same family — a verdict that could not be wrong:

- `arp_declare_session` computed the comparison against `receipt.to` when `declarer` was omitted,
  so `served === declarer` held by construction and the verdict was a constant. It now says what is
  missing instead of answering.
- The node defaulted to **mainnet 1155** while importing `data/catalogue/skills-13579.json` at module
  scope, so a default-run node resolved testnet atom ids and stamped 1155 into every receipt's
  domain — for atoms that are not on 1155, where a create pair costs **0.22 TRUST against 0.004**.
  The catalogue is now read per chain at call time, and a mainnet node holds zero skills and says
  so. `rules/portability.md` rules 1 and 3.

What the review **confirmed**, measured over all 662 rows on 13579: every recorded atom id equals
`calculateAtomId(stringToHex(toolAtomUri(url)))` on the MultiVault, zero mismatches, zero
collisions, and `calculateAtomId` is **not** plain `keccak256` of the same bytes (**0 of 662**
agreed with a local keccak) — so the decision not to derive ids at startup was right. Re-derivable:
`scripts/measure/catalogue-atom-ids.ts`, `data/measurements/catalogue-atom-ids-2026-10-29.json`.

> That figure read **0 of 601** until the verification round. The claim is about `calculateAtomId`
> as a **function**, so its denominator is every row the derivation runs on — all 662 — and scoping
> it to the recorded subset borrowed the denominator from the sentence beside it and understated
> the evidence. `claims.md` §2, and the same shape as that rule's own "89 of 89 lost the
> denominator the script prints". Two sites carried it and the grep found both.

---

### The resolution as written, kept because its reasoning stands

**Both nodes sign, and the receipt says which** — the second half amended above.

## Resolved 2026-10-29: both nodes sign

**The user's decision, asked as a choice of three and answered « ok le trois ».** Both nodes exist
and they do different jobs:

|                                | holds a key                | what its receipt is worth                         |
| ------------------------------ | -------------------------- | ------------------------------------------------- |
| the node the operator installs | **yes**, generated locally | the operator's own word, pinned to a content hash |
| a node run by somebody else    | yes                        | a two-party fact about the access                 |

So ADR `0045`'s unplug test still passes on this path: the local node serves, signs and keeps
working with nothing of ours reachable. And the receipt a stranger weighs is the one from a signer
that is not the agent.

**A self-signed receipt is labelled, not refused.** The user's reasoning, and it is the right one:

> _« un agent peut faire un faux tampon (même si ça ne sert à rien en fait) — le but de l'agent
> c'est de déclarer du vrai pour l'utilité future »_

A forged local receipt costs the agent the price of the claim and earns it a reputation on a tool it
never used, which is worth nothing the day somebody picks an agent by that reputation. So the
mechanism does not have to prevent it. It has to **name the signer**, which constraint 4 already
requires, and that constraint now has a concrete consequence rather than only a principle:

> **A reader compares the receipt's `node` to the address that made the declaration.** Same hand,
> and the receipt corroborates nobody — stated, never silently discounted. ARP composes no score
> (ADR `0046`), so this is a figure a reader sees, exactly like the distinct-declarer count and the
> declarer-creator overlap in `docs/tasks/31` §8.

**That comparison is necessary and not sufficient, which the amendment above sets out.** Equal
addresses prove one hand; unequal addresses prove nothing, because an operator's node key and their
agent key are different keys.

A self-signed receipt is still not worthless to its own operator: it pins the bytes and the path, so
the operator can re-derive what their agent actually held. It is an audit trail that happens to be
verifiable by anyone who re-fetches.

## What the resolution leaves open

**Not the signer. The host.** Where a non-local node runs, who pays for it, and what it charges are
a product decision with its own ADR. What is settled here is that the two kinds of node are
distinguishable from the receipt alone, which is the property any answer to that needs.

---

### The argument that got here, kept because it is the reasoning and not the conclusion

**Whose node signs?** It decides that a node may hold a receipt key. It does not decide who runs
that node, and the answer changes what a receipt is worth to a stranger.

ADR `0045` decided ARP ships a node **the operator runs**, so that unplugging ARP's hosted services
leaves a declaration, a stake and an agent-to-agent call still completing. It then argued, about a
different receipt, that the node could hold no key — _"it cannot forge a receipt, because forging
one requires the agent to sign a digest for work it did not do and the agent is the thing that does
the work."_

Turn that around and it is an argument against this ADR:

> **If the agent's operator runs the node, the node is not a second party to that agent.** One
> party holds both keys. The receipt is self-signed, and "two records, two parties" collapses to
> one.

The constraint that bears on it is already in the decision — a receipt **names its signer**, and a
reader decides which signers it accepts. So the mechanism is not broken; what is unsettled is where
its value is:

| who runs the serving node                       | what a receipt is worth to a stranger      |
| ----------------------------------------------- | ------------------------------------------ |
| a party the reader distinguishes from the agent | a two-party fact about the access          |
| the agent's own operator                        | the operator's own word, in a second place |

Both rows are coherent and they imply different products. The first concentrates the value in a
node somebody else runs — which is an argument for a hosted one, and therefore against `0045`'s
unplug test for this path. The second is a self-audit trail, cheap and honest and much weaker than
`docs/tasks/31` §2 claims when it says _"nobody else can produce that fact"_.

**That sentence in `docs/tasks/31` is true only of the first row**, and the task does not say so. It is
the strongest claim in the plan and it rests on an unstated assumption about who runs the process.

This is the user's decision and it is not taken here. Nothing in the built code depends on it:
`receipt.ts` takes a signer as an argument, so the same module serves either answer, and the route
that needs a key is deliberately not built yet.

## References

- Triggered by: `docs/tasks/31-arp-serves-the-content-and-signs-the-access.md` §6
- Code: `packages/protocol/src/receipt.ts`, `packages/protocol/src/content-path.ts`,
  `packages/protocol/src/session.ts`, `scripts/arp-session-hook.ts`
- Measurement: `data/measurements/skill-layouts-2026-10-29T2200.json`,
  `scripts/measure/skill-layouts.ts`
- Related rule: `.claude/rules/security.md`, `.claude/rules/claims.md`
- Related doc: `docs/14_THE_WITNESS_PROBLEM.md` (corrected by this),
  `docs/12_THE_IDEA.md` points 3 and 5
- Related ADR: `0038` (the connector plans, never signs — unamended), `0045` (the request path is
  the invariant), `0046` (ARP composes no score), `0054` (a tool's fields are a function of its
  URL), `0035` (ARP is not a party)
