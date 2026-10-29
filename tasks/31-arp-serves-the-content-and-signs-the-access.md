# Task 31 — ARP serves the content and signs the access

**Status:** **PLAN ONLY — nothing in this file is built.** Pieces 1 and 2 of §4 are built and
committed (`bcbfbe4`); piece 3 is the whole of this task.
**Required skills:** `intuition` (atoms and triples), `ethskills` (signatures).
**Rules:** `code.md`, `security.md`, `portability.md`, `claims.md`, `workflow.md`.
**Reviewers:** `intuition-integrator`, then `task-verifier`.
**ADR:** needs one. It changes what ARP **is**, which no existing ADR covers.

---

## 1. Why

`docs/14` says a use cannot be witnessed, and that has been the project's position since it was
written. The user's correction, 2026-10-29, is that this was too absolute:

> _« si tu passes par ARP pour avoir l'accès à une info, alors l'info est calculée quelque part et
> alors tu peux avoir la preuve de l'accès à cette info. Ça, couplé avec un call hook, est alors une
> preuve suffisante d'utilisation ? via ARP en tout cas »_

He is right, and the reason is structural rather than cryptographic. **If ARP serves the content,
ARP is a party to the exchange.** The claim stops being the agent's word about the agent:

```
ARP's record       "I served this skill to this key at T"       signed by ARP
the runtime's log  "I invoked this skill at T"                  signed by the agent
```

Two records, two parties, interests that do not coincide, agreeing on a moment and an identity.
That is a **two-party fact**, which `docs/14` states ARP cannot produce today. It can, for the
population that comes through it.

**It needs no ZK**, and that is worth saying because the obvious instinct is wrong. A proof would
have to attest a computation, and the computation here is an LLM reading instructions — there is no
statement to prove. Two signatures do the job and cost nothing.

## 2. The value, and it is not display

The user's objection, and it is the right one: _« il nous faut une valeur ajoutée aussi, ça ne peut
pas être que du fork, du bootstrap et du display »_.

With the node installed beside the agent, **ARP is present at four moments**:

```
discovery      the agent asks, ARP answers        ARP saw the question
access         the agent fetches, ARP serves      ARP served the bytes
invocation     the hook records the call          ARP saw the call
declaration    the edge goes on chain             and it carries all three
```

That is no longer "somebody claims to have used something". It is **this agent found this tool
through ARP, fetched it through ARP, and invoked it** — three moments, all through code ARP wrote,
all timestamped, and one record that ties them.

**Nobody else can produce that fact**, because nobody else is at all three places. An index that is
only read produces nothing; this produces a record that did not exist before the agent came
through.

The honest reservation: the node runs on the agent's own machine, so it can be bypassed. But
bypassing is a deliberate act, and an agent that bypasses loses the corroboration — its declaration
falls back to being worth exactly what it was worth before, its own word. The mechanism does not
need to be unavoidable. It needs to be worth not avoiding.

## 3. What it proves, exactly

**Access, not use.** The agent has the bytes. Whether they changed what it did stays unobservable,
and no mechanism in this document changes that.

What makes it enough in practice is the user's own argument, which is sound: access costs
something, and declaring a use you did not make still earns nothing. A false declaration is an
error that an identified agent pays for, against a reputation it cannot cheaply re-mint. The only
case where lying pays is **self-dealing** — an agent declaring use of a tool it controls, so the
stake returns to itself — and that is treated in §8.

The ladder, with this task's rung marked:

```
the model says so                 what a declaration was before bcbfbe4
the harness logs it               bcbfbe4. Not composed by the model
→ ARP countersigns the access     THIS TASK. Two parties
the harness signs its own log     a keypair in the hook. Small, and additive to this
a TEE attests the harness         heavy, and not for a POC
ZK                                no statement to prove
```

## 4. Where the work already is

| | | |
| --- | --- | --- |
| 1 | the hook logs what was invoked | **built** — `scripts/arp-session-hook.ts` |
| 2 | resolution refuses rather than guesses | **built** — `packages/protocol/src/session.ts`, 12 tests |
| 3 | ARP serves the content and signs the access | **this task** |

Piece 2 has an open gap that piece 3 closes as a side effect: a skill's **name** resolves to six
repositories for `product-photography`, so a log line carrying only a name is unusable. What ends
it is a reference — an atom id or the URL it derives from. A runtime gives a name and not an
origin, so **the reference has to come from whoever served the content**.

That is not a bonus. It is half the reason to do this at all.

## 5. The shape

Three parts, in this order.

### 5.1 A fetch endpoint on the node

```
GET /content/:atomId        →  the skill's SKILL.md, verbatim
```

It resolves the atom to its repository URL (a pure function, ADR `0054`, reversed through the
catalogue), fetches from `raw.githubusercontent.com`, and returns the bytes with a receipt.

**ARP does not host anything.** It fetches on the caller's behalf from the origin the atom names.
That keeps the authorship question where it belongs and means this cannot drift into a mirror.

Open: the path inside a repository varies (`skills/<name>/SKILL.md` against `<name>/SKILL.md`,
and `guides/.../SKILL.md` in the `superpowers` family). The tree API answers it in one request per
repository and the answer is cacheable. **Measure the distinct layouts before writing the
resolver** — `scripts/measure/skill-content-duplicates.ts` already reads those trees and could
report them.

### 5.2 The receipt

Returned beside the content, and signed by the node's key:

```jsonc
{
  "atom":    "0x02cc3ce7…",          // the tool, exactly
  "url":     "github.com/magentosh/superpowers?skill=product-photography",
  "sha256":  "…",                     // of the bytes served, so the content is pinned too
  "to":      "0x…",                   // the caller's address, as it authenticated
  "at":      "2026-10-29T18:00:00Z",
  "node":    "0x…",                   // who is signing
  "sig":     "0x…"                    // EIP-191 over the above, canonically encoded
}
```

`security.md`'s signature-replay bullet applies and is not optional: the payload includes the
chain id, the node's address, and a nonce or the timestamp, or the same receipt can be replayed
against a second node.

**The hook logs `atom` as its `ref`**, which is the field `session.ts` already reads and which
turns six candidates into one.

### 5.3 How the caller identifies itself

The receipt names `to`, so the caller has to prove an address. The cheapest honest form is a
challenge the node signs nothing for: the caller signs a nonce, the node verifies, serves, and
names that address in the receipt. No account, no key from us.

Open: whether an unauthenticated fetch is served at all. Serving it with `to: null` keeps the
index open and makes the receipt worthless, which is probably right — the receipt is the product,
not the content.

## 6. What this changes about ARP

ARP becomes a path and not only an index: it holds a key, and that key signs receipts.

**A receipt can only add, never subtract**, and that is the property that makes the key
uninteresting to worry about. A declaration already stands on its own — somebody identified paid to
make it. The receipt says a second party saw the fetch. If a reader distrusts the signer, they
ignore the receipt and are back to exactly the declaration they had before. There is no bottleneck
to become, because nothing routes through the key: `arp_find_tools` stays open, the chain stays
readable, and no receipt can revoke an edge.

Two design requirements follow, and they are requirements rather than warnings:

- **A receipt names its signer.** A reader decides which signers it accepts, the same way ARP's
  index already names the attestor it reads through. Nothing assumes one node.
- **The signing key signs receipts and nothing else.** It must not be a key that can move value
  (ADR `0038`: the node plans and never sends).

**A skill copied straight from GitHub stays invisible, and that is correct.** This cannot be
compulsory and should not try to be. An agent that comes through ARP gets a corroborated
declaration; one that copies from GitHub has only its own word. That is a difference in what a
claim is worth, not a gate on who may make one.

## 7. Deliverables

1. `packages/protocol/src/receipt.ts` — the payload shape, its canonical encoding, `sign` and
   `verify`. Pure, no transport, tested without a network. **The verification is the deliverable**,
   not the signing: a receipt nobody else can check is a log entry.
2. A `/content/:atomId` route on the node, with the repository-layout resolver and its cache.
3. The hook writes `ref` from the receipt.
4. `arp_declare_session` on the node: takes a log, returns resolutions and the prepared calls for
   the resolved ones. **Plans, never signs** (ADR `0038`).
5. A measurement of the repository layouts, committed, before 5.2's resolver exists.
6. The ADR in §6.
7. `docs/14` gains the correction: a use is unwitnessable **in general**, and two-party
   corroboration is available where ARP is in the path. The current text is too absolute and the
   user said so.

## 8. The one case where lying still pays

Everything above makes a false declaration expensive and pointless, **except when you own the tool
you are praising**.

Fetch your own skill through ARP, declare you used it, stake on it. Every step is real: the receipt
is genuine, the call happened, the money moved. It is self-promotion wearing the shape of a
recommendation, and the receipt cannot detect it because nothing was faked.

What detects it is looking at **who** is declaring. One address declaring about a tool the same
address created is not an opinion. Ten different addresses is. Neither check is in this task, and
both belong on the reading side:

- **count distinct declarers, not declarations.** One agent calling forty times is one opinion.
  `session.ts` already reports `calls` without weighting it, for this reason.
- **look at whether the declarer and the tool share an address.** The registry has the tool's
  creator; the declaration has the agent's key.

Both belong to whatever reads the graph. ARP composes no score (ADR `0046`), so these are figures a
reader sees rather than a correction ARP applies on their behalf.

## 9. Do not do in this task

- **Do not host content.** Fetch from the origin, pass it through, keep nothing. A cache of bytes
  is a mirror and a mirror is a different product with different obligations.
- **Do not make the node sign anything but receipts.** It plans and does not send (ADR `0038`), and
  a key that signs a receipt must not be a key that can move value.
- **Do not gate the index behind the receipt.** `arp_find_tools` stays open to anyone. The receipt
  is for the declaration, not for the search.
- **Do not touch mainnet.** Chain 13579 throughout.
- **Do not weight the call count.** It is reported. ADR `0046`.

## Evidence ladder

`docs/09` §3 — asserted, rated, staked, proven. A declaration today is **staked**: somebody paid to
say it. This moves it toward **proven** for the population that comes through ARP, without reaching
it: what becomes provable is the access, not the use. Saying it moves ARP to "proven" would be the
kind of sentence `claims.md` exists to stop.
