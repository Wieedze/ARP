# 0045 — the invariant is the request path, not the runtime

**Status:** Accepted
**Date:** 2026-10-20
**Triggered by:** user request — "ca ce nest plus vrai: Not in anyone's runtime", then "oui ca me
parrait bien cette histoire de noeud"

## Context

`docs/12` stated the guarantee three times, and the three sentences did not say the same thing:

| site         | wording                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------- |
| `docs/12:18` | "Nothing above requires … anyone's runtime"                                                 |
| `docs/12:31` | "Not in anyone's runtime. The only thing an operator adopts is a delegation they sign once" |
| `docs/12:40` | drift signal — "require the infrastructure to **route its runtime through us**"             |

Two distinct claims were carried by one phrase:

- **(a)** ARP ships no code an operator runs.
- **(b)** ARP has no visibility into what an agent executes.

**(b) holds and is load-bearing.** It is `docs/14`'s whole argument, and `.claude/STATE.md:161`
states the sharp version: _you cannot observe a runtime, and a connector inside the agent's process
is under the agent's control._ Nothing here weakens it.

**(a) was already false, and the repo defended it instead of fixing it.**
`scripts/arp-mcp-server.ts:20` argued "the agent _chooses_ to call it" — true of signing, false of
planning. Atom resolution, the refuse-on-ambiguous rule and the cost reads all live server-side, so
an agent whose plan ARP hosts cannot build that plan when ARP's host is down. The guarantee was
being read as "ARP is not a dependency" while a dependency existed.

The missing half of the mechanism needs more, not less. For an agent to **receive** a request, another
agent must be able to reach it. MCP is client→server: ARP's server cannot make an agent reachable.
The agent must run its own endpoint and publish it in its ERC-8004 registration file. That is why, in
the cohort measured by `scripts/verify-cohort.ts` and `scripts/measure-cohort-endpoints.ts` on Base
8453, 2026-10-16: 82% of declared endpoints are not probeable at all, and **1–7%** answer (Wilson,
n=122). ARP can verify such an endpoint. It cannot provide one.

## Decision

**ARP ships a node the operator runs. The invariant is that ARP is never in the path of a request.**

The test is mechanical, which is the point — "not in anyone's runtime" was not checkable and this is:

> Unplug ARP's hosted services. Does a declaration, a stake, and an agent-to-agent call still
> complete?

Today that test **fails on planning**. The node makes it pass: the same protocol logic, delivered
instead of hosted. `@arp-protocol/core` already holds every line of it and already holds no key
(ADR `0038`), so the node is a transport change, not new authority.

Claim (b) is unchanged, and has been restated separately at each site where one sentence carried
both.

**The node holds no key.** `packages/protocol` holds none by construction (ADR `0038`) and the
inbound side inherits that: the node listens, shapes the request, hands the work to the agent and
prepares the receipt digest — **the agent signs the receipt exactly as it signs the calldata.** A
compromised node can refuse work or lie about content it generates itself; it cannot spend, and it
cannot forge a receipt, because forging one requires the agent to sign a digest for work it did not
do and the agent is the thing that does the work. This replaces a worse answer given first in the
same conversation (a delegate key bounded by caveats, blast radius one cap per period). The user
proposed the separation; it is strictly better and it keeps one invariant instead of two.

**Not decided here:** whether ARP indexes install targets so the node _installs_ a tool and writes
the `uses` edge from the install rather than from an assertion. That is a second decision with its
own risk (it steps toward being a distribution surface, which `docs/12:28` refuses) and it needs its
own ADR. Note that an install hash is **not** what makes a declaration hard to fake — see the next
section.

## What a demanded shape buys, and what it does not

The requester — another agent, never ARP — can demand a receipt shape: signed by the key the ERC-8004
registry names as `owner`, bound to the hash of the request, committing to the tools claimed for that
job. That buys **attribution and non-repudiation**. It does not buy the truth of the content, and no
stricter shape ever will: nothing outside the process sees a tool being invoked, which is
`docs/14` entire and `STATE.md:161` in one line — _a connector inside the agent's process is under
the agent's control._

What does bite is the second rung of `docs/14:159`'s ladder, which this project wrote down and has
never implemented: **two parties declaring the same edge.** Two separate pairs, and they are not
equally strong:

| edge                  | the two parties        | interests genuinely opposed?                                           |
| --------------------- | ---------------------- | ---------------------------------------------------------------------- |
| `(agent, uses, tool)` | the agent and the tool | **yes** — a tool has no reason to credit an agent that never called it |
| the hire              | requester and provider | **no** — both gain from the provider looking good                      |

The ladder's engine is the opposition, so the hire pair is the weaker one and must not be rendered as
if it were the tool pair. Two things rescue it anyway: the **payment is already rung 1**, a fact, so
the attestation only adds "and it was delivered" — the part a payment cannot prove; and Intuition's
**counter-triple is free** (`docs/14:168`), so an invented delivery is contestable at no cost by the
party with the most motive to contest.

The cheapest piece is a pure read and depends on nobody's adoption: **a one-sided claim becomes
visible as one-sided.** A says "I hired B", B never confirms, the pair does not match. One graph query
and an honest rendering.

**Prerequisite, not a detail:** no hire predicate exists in
`packages/protocol/src/sources/intuition/terms.ts`. ADR `0030` is the precedent for getting that
wrong — `use` was chosen on publication instead of meaning and 21 triples are stranded permanently on
a predicate ARP minted and abandoned. The hire direction needs its predicate resolved against live
mainnet with the multiple-match check before any code is written.

## Alternatives considered

- **Keep the strict reading — host nothing, ship nothing.** Preserves the sentence at the cost of the
  mechanism: it leaves the planning dependency that already exists _and_ makes the receive half
  impossible, because nothing would ever listen on the operator's side.
- **ARP hosts a relay** — other agents call ARP at `…/agent/<id>` and ARP forwards over a connection
  the agent opened outbound. It genuinely solves NAT, and it puts ARP in the path of every request:
  we would see every payload, become a liveness dependency for the whole network, and be able to drop
  any message. That is `docs/12:40` verbatim. Rejected, and it is now named as its own drift signal
  so it cannot return wearing a product name.
- **Plugins for existing agent frameworks** — N integrations to maintain, each one a surface we do
  not control, and the repo already declines to name frameworks. Rejected.

## What the count may and may not become

Settled in the same conversation, because the obvious next step after "two parties attested" is to
turn the attestations into a number, and that is a drift signal (`docs/12:41` — _"weight sentiment by
staker track record" → interesting, and not this_).

The line is finer than that signal's wording suggests, so it is drawn here:

- **permitted** — show **who** attested, what they have at stake, and what standing they hold
  themselves. Do not collapse the list into a count.
- **drift** — compose a single weighted figure and call it the agent's score. `docs/01` rejects being
  one more score, and `docs/14:156` already forbids rendering unequal evidence at equal weight.

ARP exposes the graph; the buyer weights it, or a third party builds a scorer on ARP's data. Three
rules follow:

1. **The marker of success is repetition, not correctness.** Whether the work was _right_ needs
   ground truth and is `docs/01`'s calibration layer — `docs/12`'s first drift signal. What is a fact
   is that a buyer paid again. Repeat hire is rung 1 of `docs/14:159` and cannot be faked without
   paying each time.
2. **Show the pair, never the product.** "10 hires by 1 buyer" and "10 hires by 10 buyers" are
   different facts. This project has already made the summed version of this mistake once, with a
   staker count that was true per vault and false of a sum across edges — ADR `0023:90-92` predicted
   it in writing.
3. **Never a badge.** "Verified buyer" granted by ARP would make ARP an authority, which is the
   registry drift signal. What is checkable without anyone's permission: the attestor's ERC-8004
   identity resolves, somebody staked on **them**, they hold TRUST at risk on other edges. Facts
   underneath, sortable — not a mark we confer.

**The Sybil bound, stated plainly:** a raw repeat count is cheap to manufacture. An operator mints a
second identity, hires themselves ten times, and the payment returns to them minus fees. What is not
cheap is an attestation from a buyer **who has something of their own to lose**. The attestation is
worth what its signer is worth, which is why rule 3 keeps the signer's standing readable instead of
summarising it.

## Consequences

**Positive:**

- Removes a real dependency rather than arguing it away. The disappearance test is checkable by
  anyone, which "not in anyone's runtime" never was.
- Makes the receive half buildable at all. Without something listening on the operator's side there
  is no inbound request and therefore no rating.
- Being _more_ in the runtime makes ARP _less_ of a dependency — code on the operator's machine is
  not in the path; a host they must reach is.

**Negative:**

- ARP now ships software that runs on other people's machines: versioning, compatibility with the
  chain's reads, and a support surface that did not exist.
- Two transports to keep honest instead of one, for as long as the hosted server stays up.
- **The adoption risk is the real one and it is measured, not hypothetical.** 1–7% of the cohort runs
  anything reachable (Wilson, n=122, Base 8453, 2026-10-16). The declare/stake half needs no install;
  the receive half is suspended on an adoption nobody here controls.
- **The relay will be asked for.** The moment an operator cannot host, the obvious fix is "we will
  host it for you" — named as its own drift signal in `docs/12` so it cannot return under a product
  name.

**Neutral (worth knowing):**

- The node is operator-controlled, which is exactly **why** its reports are assertions and not proof.
  That is not a defect of this decision, it is `STATE.md:161` holding. An install hash would raise
  the cost of a deliberate lie without removing it, and would not touch the accidental case at all.
- Everything ARP writes today sits on **rung 4** of `docs/14:159` — an agent declaring alone, with a
  stake behind it. The node is what makes rung 2 reachable, which is the first time the ladder's
  second row has had a path to being anything but a table.
- `scripts/agent-server.ts` already is an inbound surface — `/run`, `/healthz`, a payment gate and a
  signed receipt — but specialised to the auditor demo. The node generalises it rather than starting
  from nothing.

## References

- Related doc: `docs/12_THE_IDEA.md` (the three corrected sites), `docs/13_THE_THREE_FLOWS.md`,
  `docs/14_THE_WITNESS_PROBLEM.md` (claim (b), unchanged)
- Related ADR: `0035` (ARP is not a party — its quotation of the old wording is struck in place),
  `0038` (the write path is a plan, so the node inherits no key)
- Related rule: `.claude/rules/claims.md` check 5 — six sites restated this invariant; the grep came
  before the edit
