# Task 31 — ARP serves the content and signs the access

**Status:** **COMPLETE.** All seven deliverables done and `task-verifier` PASS on the fourth pass,
2026-10-29. Commits `0bc29d8`..`280fd4c`. Post-mortem:
`.claude/learning/20-arp-serves-the-content-and-signs-the-access.md`.

**Three FAILs first, nine blockers across them, and not one was a crash** — every one was a claim
that could not be wrong, a label reporting the strongest verdict for the weakest case, or a sentence
corrected in five places out of six. Two were committed _inside_ the fix for the same class. The
post-mortem's finding is the contrast that explains it: every figure re-derived from a committed
measurement was exact on the first try in both verification rounds, and every hand-maintained figure
was wrong in both.

Two live security defects came out of **writing the install-facing document**, not out of writing
code: the node bound every interface while one tool fetched a caller's URL, and `file:///etc/passwd`
walked through the guard because `privateProbeTarget` delegates the scheme check to its caller and
one caller did not do it. A third — redirect-following — came out of the verifier measuring it.

All seven deliverables are in §7, each marked with what landed. The open question the plan did not know it had (whose node signs) was put to the user and
answered: both, and the receipt says which. ADR `0080`.

The plan's own overclaim is corrected in §2 rather than deleted: _"nobody else can produce that
fact"_ holds only where the signer is not the agent's own node.

What is **not** here and is owed: a written account of the node's files and its trust surface for
whoever installs it. The trust surface itself is written at the top of `scripts/arp-content.ts`,
where the code is; what is missing is the operator-facing version.
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

**Nobody else can produce that fact**, because nobody else is at all three places — **and that is
true only while the node is run by somebody the reader distinguishes from the agent.** If the
agent's own operator runs it, one party holds both keys and the receipt is the operator's word in a
second place.

Settled 2026-10-29, ADR `0080`: **both kinds of node sign, and the receipt names which.** The local
node keeps working with nothing of ours reachable, so `0045`'s unplug test holds; a receipt from a
signer that is not the agent is the one a stranger weighs. A self-signed receipt is **labelled, not
refused** — a forged one costs the agent the price of the claim and earns a reputation on a tool it
never used, which is worth nothing the day somebody picks an agent by it. The reader's check is one
comparison: the receipt's `node` against the address that declared.

An index that is
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

|     |                                             |                                                          |
| --- | ------------------------------------------- | -------------------------------------------------------- |
| 1   | the hook logs what was invoked              | **built** — `scripts/arp-session-hook.ts`                |
| 2   | resolution refuses rather than guesses      | **built** — `packages/protocol/src/session.ts`, 12 tests |
| 3   | ARP serves the content and signs the access | **this task**                                            |

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

#### The path, measured rather than assumed

This was the task's open question and deliverable 5 closed it:
`scripts/measure/skill-layouts.ts`, run 2026-10-29 over all 31 catalogued repositories and all 662
catalogued skills. **The figures below are from `measurements/skill-layouts-2026-10-29T2200.json`**
— the corrected run. `measurements/skill-layouts-2026-10-29.json` is the first run and its numbers
are wrong; see the note at the end of this section.

**The resolver cannot be a pure function of `(repo, skill)`.** There are **19 distinct layouts**,
`skills/<skill>/SKILL.md` covers 215 of the located skills and `<skill>/SKILL.md` another 55, and
**8 of the 31 repositories use more than one**. So it reads the tree — one request per repository,
cacheable, which was always the fallback.

What the 662 resolve to, and what the endpoint owes each case:

|     |                                       | the endpoint                                     |
| --- | ------------------------------------- | ------------------------------------------------ |
| 475 | one path, exact directory match       | serve                                            |
| 46  | several paths, **identical blob sha** | serve one, name the others in the receipt        |
| 2   | several paths, **different content**  | **refuse** — which one the agent read is unknown |
| 139 | no path at HEAD                       | **refuse**, 404 with the reason                  |

So **521 of 662 are servable** and 141 are not. The 46 are a skill published once per runtime
directory inside one repository — `.agents/skills/<skill>/` beside `.claude/skills/<skill>/`, and
`pbakaus/impeccable` ships twenty of them — and since the bytes are the same file, choosing between
them asserts nothing.

**The 139 are the finding, not the defect.** Of them, 95 sit in a repository with **no uncatalogued
directory**, so there is nothing there the name could have been renamed to: the file the catalogue
points at is not in the repository. `mattpocock/skills` is the clearest case — 55 catalogued skills,
38 directories at HEAD, all 38 catalogued, 17 names with nothing behind them.

> **The first run of this measurement was wrong and the committed file is kept.** `0bc29d8` matched
> a catalogued name against **any** directory in a path, so `plugins/caveman/skills/cavecrew/SKILL.md`
> counted as a candidate for the skill `caveman`. It reported 49 ambiguities of which 42 shared
> content, and 138 absent. The corrected run matches the **immediate parent only** and is
> `measurements/skill-layouts-2026-10-29T2200.json`; the first is left beside it as the record of a
> run that happened (ADR `0064`). **No resolved path changed** — the loose matcher never once landed
> on a single wrong candidate in this population, which is luck and not a defence, because a single
> wrong candidate resolves silently and is exactly what this measurement exists to prevent.

That is a **per-skill liveness signal**, and it is the strongest kind this project has: one tree
request re-derives it, with no credential and no trust in us, which is `docs/14`'s own test. It is
also sharper than `archived`, which is per-repository and the owner's own word. Whether it goes on
chain is a separate decision and is not taken here — `docs/20` holds the line on which signals do.

### 5.2 The receipt

Returned beside the content, and signed by the node's key:

```jsonc
{
  "atom": "0x02cc3ce7…", // the tool, exactly
  "url": "github.com/magentosh/superpowers?skill=product-photography",
  "sha256": "…", // of the bytes served, so the content is pinned too
  "to": "0x…", // the caller's address, as it authenticated
  "at": "2026-10-29T18:00:00Z",
  "node": "0x…", // who is signing
  "sig": "0x…", // EIP-191 over the above, canonically encoded
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
make it. The receipt says somebody else saw the fetch — **a second party only where the reader
recognises the signer**, since an operator's own node generates a key unlinkable to their agent's
(ADR `0080`'s amendment). If a reader distrusts the signer, they
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

1. ~~`packages/protocol/src/receipt.ts` — the payload shape, its **canonical encoding**, `sign`
   and `verify`.~~ **Done 2026-10-29**, 40 tests, and the spec's "canonical encoding" was
   **deliberately not built**: EIP-712 replaces it, because an atom id is a pure function of its
   URL (ADR `0054`) so the same tool has the same id on 13579 and 1155, and only a signed domain
   separates them. Hand-rolled canonical JSON would also have been a standing footgun. The
   verification was the deliverable and it has two halves — `verifyContentReceipt` for the
   signature and `receiptMatchesContent` for the bytes, the second needing no key of ours at all.
2. ~~A `/content/:atomId` route on the node, with the repository-layout resolver and its cache.~~
   **Done 2026-10-29** — `packages/protocol/src/content-path.ts` (21 tests),
   `content-serve.ts` (21 tests, every piece of IO injected), `scripts/arp-content.ts` (the
   transport, the key, the cache), and one route in `scripts/arp-mcp-server.ts`. Walked end to end
   by `scripts/verify-content-route.ts`: the digest the receipt carries is what `sha256sum` prints
   on the downloaded file.
3. ~~The hook writes `ref` from the receipt.~~ **Done 2026-10-29** —
   `scripts/arp-fetch-skill.ts` records the fetch, `refForInvocation` reads it back, and the hook
   fills `ref`. On `product-photography`, which six repositories carry: **resolved** with the ref,
   **ambiguous with 6 candidates** without it.
4. ~~`arp_declare_session` on the node.~~ **Done 2026-10-29** — takes a log, reports every
   invocation with its resolution, plans only for the exactly-named ones, and says for each
   whether a receipt corroborates the access and who signed it. Plans, never signs.
5. ~~A measurement of the repository layouts, committed, before 5.2's resolver exists.~~
   **Done 2026-10-29** — `scripts/measure/skill-layouts.ts`,
   `measurements/skill-layouts-2026-10-29.json`. The answer is in §5.1 and it changed the design:
   the resolver reads the tree, and 141 of 662 skills are not servable at all. Corrected the same
   day — see the note in §5.1 and `measurements/skill-layouts-2026-10-29T2200.json`.
6. ~~The ADR in §6.~~ **Done 2026-10-29** — ADR `0080`. It carries the six constraints, the
   EIP-712-over-EIP-191 reason (an atom id is the same on both chains), and the five alternatives
   including the two that were rejected flatly: gating the index, and making the path compulsory.
7. ~~`docs/14` gains the correction.~~ **Done 2026-10-29** — an amendment section, a row in the
   ladder, two more rows than planned, and **two** drift signals (not three — it had three before
   this task and has five now). The correction turned out to be narrower and better than
   planned: the original argument is about a **place**, not an impossibility. Its force is "a
   connector inside the agent's process is under the agent's control", which says nothing about a
   party on the other end of a fetch. **The document's opening sentence stays as written**, because
   it is right about every agent ARP is not in the path of.

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
