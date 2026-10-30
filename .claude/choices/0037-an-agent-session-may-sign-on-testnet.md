# 0037 — An agent session may sign on testnet 13579 with the operator's key

**Status:** Accepted
**Date:** 2026-10-19
**Triggered by:** `task-verifier` on task 24. The three rig mints were signed by the agent session
using `PRIVATE_KEY` from `.env`, on the user's explicit authorisation — _"ok tu peux faire tous ca ?"_
— and **nothing written down covered it.** The gap was filled by inference from two ADRs that do not
quite reach.

## Context

`rules/security.md` is unambiguous and scopes its prohibition to one chain:

> No ARP agent, script or automated process may sign a **mainnet** transaction with ARP's own funds.

So testnet signing is not forbidden. But it is not _permitted_ anywhere either, and the nearest
candidate does not cover it. ADR `0036` reads:

> An agent, **under a delegation its operator signed**, may create the `(agent, uses, tool)` triple
> … and deposit TRUST on that triple, on Intuition testnet 13579 without further ceremony.

Minting ERC-8004 agents with the operator's **raw private key** is neither of those two acts and was
under no delegation. ADR `0036`'s own non-authorisation list points the other way — "ARP's own
scripts spending ARP's own TRUST automatically" — so leaning on it was a stretch.

What actually authorised the mints was the user asking for them. **That is what counts**, and it is
also why this needs writing down: `workflow.md` requires an ADR for an architectural choice not
pre-specified, this is the first time an agent in this repo signed a chain transaction with the
operator's key, and the precedent will be cited.

Two further facts the verifier established and that bear on the shape of this:

- `scripts/seed/rig-registration-files.ts` asserts in its own header that it "signs nothing and sends
  nothing… the operator runs them with their own key". True of the script, and **not what happened**.
- `data/deployments/13579.json` said the agents were "minted by the deployer", which a later reader takes
  as a human at a keyboard.

## Decision

**An agent session may sign a transaction on Intuition testnet 13579 with the operator's key, when
the user asks for that specific action in the conversation.** Three conditions, all of which held:

1. **The key is never read into the agent's context.** It is sourced into the shell's environment and
   passed to the tool. Its value is not printed, logged or echoed.
2. **The key's address is verified against the expected account before use**, so a wrong or rotated
   key fails loudly instead of signing from somewhere unexpected.
3. **The effect is recorded where a future reader will look** — the transaction hashes, the chain, and
   the fact that an agent session rather than a human signed.

**What this does not extend to**, stated so the precedent cannot be stretched the way ADR `0036` was:

- **Mainnet, on any chain, for any reason.** `rules/security.md` is unchanged and governs.
- **Standing authorisation.** It covers the action the user asked for, in that conversation. The next
  signing needs its own ask; approval of one mint is not approval of a loop.
- **Reading a credential the user did not point at**, or from another project. The user opened `.env`
  in this repo as part of the request.
- **Spending where the amount is not bounded and known.** The three mints cost 0.0000355 tTRUST
  against a 0.0136 balance, computed from `gas-price × estimate` before any send.

## Consequences

**Positive**

- The rig exists and its gate passes, which unblocks Phase 1. Doing it by hand would have been three
  paste-and-run steps with the same effect and the same risk.
- The three conditions are a reusable shape rather than a one-off judgement, and condition 2 caught
  nothing this time only because the key was right.

**Negative**

- **`security.md`'s silence was doing work it should not have been doing.** A rule that permits by
  omission is a rule the next session has to re-derive, which is how ADR `0036` came to be misread
  in the same session. The rule now says what it means about testnet.
- A precedent for agent-signed transactions exists. It is bounded by chain and by per-action consent,
  but the bound is text, and text is only as good as the reading — which is the failure this ADR was
  written to answer.
- The script's "signs nothing" header is now a statement about the script rather than about the task,
  and the two were conflated once already.

**Neutral**

- ADR `0017`'s seven safeguards are about the panel's human-signed mainnet deposits and do not
  transfer. ADR `0036` is unchanged and still the authority on agent-initiated staking.
- The mints are permanent. `data/deployments/13579.json` records the ids, the transactions, the document
  hashes, and that agents 1 and 2 are deliberately left empty.
