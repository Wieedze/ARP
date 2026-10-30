# 0085 — An agent with no wallet generates its own key, and a funder covers the gas for now

**Status:** Accepted
**Date:** 2026-10-30
**Triggered by:** user request — asked 2026-10-28 (`FUTURE.md`, "An agent that arrives with no
wallet"), reframed and decided 2026-10-30: _« oui le choix deux avec un financeur pour le moment »_.

## Context

The loop assumes the agent's operator already holds a funded key on 13579 and an ERC-8004
registration. `FUTURE.md` recorded the open case — an agent that has neither — and framed the answer
as a **hosted signer** (Privy or equivalent) plus a relayer, so the operator signs nothing and funds
nothing on first contact.

The user rejected that framing on 2026-10-30 and asked the better question: _« pourquoi un agent
arrivera sans wallet ? s'il n'en a pas peut-être faut-il lui en créer un ? »_ Creating one is
already within reach — `@metamask/smart-accounts-kit` (`^1.6.0`) is a root dependency and a smart
account is derived deterministically, so "create one for it" is a call rather than a project.

But creating an account does not answer **who holds the signer**, and that is the question
`.claude/rules/security.md` is strictest about. Three variants were put to the user:

1. the operator's existing EOA, with the smart account derived from it — already built (task 03b),
   and not this case;
2. the agent generates its own key locally;
3. a third party holds it.

And the real blocker turned out not to be the key at all. It is the **gas**: a fresh account holds
zero, and one full walk of the loop on testnet 13579 on 2026-10-29 cost **0.0165 tTRUST** — one
observation on one chain on one date, read as a balance delta from 0.018081 to 0.001612, not a
distribution.

## Decision

**Variant 2, with a funder, provisionally.**

1. **An agent with no wallet generates its own key, locally, and ARP never holds it or reads it.**
   The pattern already exists and already runs: the node generates its receipt key on first use into
   `.arp/receipt-key` at mode 0600 (ADR `0080`). Nothing about that mechanism is specific to
   receipts.
2. **A funder covers the gas for a fresh account** — the user's word is _financeur_, and
   _« pour le moment »_ is part of the decision, not a hedge around it.
3. **The funder is testnet 13579 only.** On mainnet the same mechanism is ARP's own funds signed for
   automatically, which `.claude/rules/security.md` forbids in its one canonical sentence: _"No ARP
   agent, script or automated process may sign a mainnet transaction with ARP's own funds."_ The
   mainnet shape of this is a paymaster the **operator** funds, and it is a separate decision nobody
   has taken.

Nothing here is built. This records the shape so the next person does not re-derive it, and so the
mainnet half is not reached by inference from the testnet half.

## Alternatives considered

- **A hosted signer (Privy or equivalent)** — what `FUTURE.md` assumed. Rejected: it puts ARP, or a
  vendor ARP chose, in custody of a key that can spend. ADR `0045`'s unplug test fails the moment a
  declaration needs a key ARP's vendor holds, and `security.md`'s whole structure is built on who
  signs rather than on what is signed.
- **Derive the smart account from the operator's own EOA** — correct, and it is the built path. It
  answers a different question: that operator is not an agent arriving with no wallet.
- **A passkey signer** — supported by the kit, and the closest thing to "create one for it" with
  nobody holding anything transferable: the key sits in the device's secure enclave. Not rejected,
  deferred. It solves custody and leaves the gas question exactly where it is, so it changes nothing
  about this decision and can be adopted later without revisiting it.

## Consequences

**Positive:**

- `security.md` is untouched and needed no amendment, which is the test this decision was chosen
  against. ARP holds no key in any branch.
- The key half is not new code. `.arp/receipt-key`'s generation is already written, already tested
  and already running, so what is left is a funding step and not a custody design.
- The deferral in `FUTURE.md` can now name its blocker precisely. It was "it changes who holds the
  key"; it is now "the funder has no bound", which is a smaller and answerable problem.

**Negative:**

- **A funder is a spend path that did not exist, and an unbounded one is a faucet.** Nothing in this
  decision says how much, how often, or to whom. A funder reachable by a stranger drains, and the
  attestor key it would most likely be funded from is the one ADR `0025`'s successor problem already
  names as load-bearing (`FUTURE.md`, "The attestor is one wallet, and one key"). **The bound is
  owed before any of this is built**, and it is a separate decision from this one.
- **"Pour le moment" has no expiry written into it.** The condition that ends it is a mainnet path,
  and a mainnet path is forbidden to the funder by point 3 — so the provisional arrangement has no
  mechanism that retires it. Whoever builds this names the condition.
- An agent holding its own key on disk can lose it, and there is no recovery. That is true of
  `.arp/receipt-key` too, where the cost is one signer's history; here the cost is an agent's
  identity and its positions.

**Neutral (worth knowing):**

- The 0.0165 tTRUST figure bounds nothing on mainnet. Term costs are **100× apart** between 13579
  and 1155 (`.claude/rules/portability.md`), so a funder sized on testnet is two orders out.
- The smart-accounts kit is already a root dependency, so adopting it here adds no dependency to
  justify.

## References

- Related rule: `.claude/rules/security.md` (the canonical mainnet-signing sentence, which point 3
  defers to rather than restates), `.claude/rules/portability.md` (the 100× cost gap)
- Related ADR: `.claude/choices/0080-the-node-signs-for-what-it-served-and-for-nothing-else.md` (the local-key pattern this reuses),
  `.claude/choices/0037-an-agent-session-may-sign-on-testnet.md` (testnet 13579 signing, and that it covers an asked-for action rather
  than a standing licence), `.claude/choices/0045-the-invariant-is-the-request-path-not-the-runtime.md` (the unplug test the hosted signer fails),
  `.claude/choices/0036-an-agent-may-stake.md` (an operator's funds under a delegation they signed are the product)
- Asked for in: `FUTURE.md`, "An agent that arrives with no wallet" — updated by this ADR
