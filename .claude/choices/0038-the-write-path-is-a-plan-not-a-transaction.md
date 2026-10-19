# 0038 — The write path is a plan, not a transaction

**Status:** Accepted
**Date:** 2026-10-19
**Triggered by:** `tasks/16` — the connector an agent declares through

> **Paths in this ADR predate the 2026-10-19 reorganisation.** Read `erc8004/src/…` as
> `packages/protocol/src/…` and `@arp-protocol/erc8004` as `@arp-protocol/core`. The text is left as
> written because an ADR is a record of a decision on its date; ADR `0041` carries the full mapping.

## Context

`docs/12` point 3 is the loop: the agent runs, and it deposits TRUST on the modules it actually
used. ADR `0035` settled whose TRUST that is — the agent operator's, never ARP's, and **ARP is not a
party to any of it**. The user's words: _"je ne doit pas existé dans cette boucle"_.

That left a question nothing had answered. The connector is read-only by design: its own index
docstring said "no signer, no wallet client, no private key, no write path of any kind". Task 16
needs it to write. The obvious reading — give it a wallet client and a signing mode — would put ARP
in a position to spend an operator's TRUST. Not because it would, but because it could, and the
difference between those two is the whole argument of `docs/12`.

`scripts/agent-stake-on-use.ts` already takes an `agentWalletClient` and sends. It is the hackathon
surface (ADR `0033`), it was written when ARP's author signed everything, and it is the template
task 16 was told to adapt. Adapting it as-is would have carried the custody shape forward into the
thing third parties use.

## Decision

**The connector prepares calls and never signs or sends one.** `erc8004/src/declare/` returns
`PreparedCall[]` — `{kind, to, value, data, why}` — for the agent's own runtime to sign with its own
key. There is no wallet client, no signer parameter, no private key and no send path anywhere in the
package.

"ARP is not a party" becomes a structural property rather than a promise: ARP holds no key, so it
cannot move an operator's funds even by mistake, and no future commit can quietly give it one
without deleting this ADR.

The same shape carries to the MCP server. `arp_declare_used` and `arp_stake_on_used` return the
plan, with a caveat on every response saying the calls are unsigned and nothing was sent — because a
caller who assumes ARP executed the plan will not check that it did.

`why` is on every call for the same reason. A runtime is being asked to sign something it did not
encode, and a plan it cannot explain to its operator is a plan the operator should refuse.

## Alternatives considered

- **A wallet client in the connector, as the existing script has.** Rejected: it makes ARP capable
  of spending an operator's TRUST, which is exactly what ADR `0035` says ARP must not be able to do.
  The capability is the problem, not the intent.
- **A separate signing package that holds the key.** Rejected for the same reason one layer out. It
  would be ARP's code holding the key, and "it is in a different package" is not a property anyone
  can verify from outside.
- **Returning a viem `WriteContractParameters` instead of raw calldata.** Rejected: it binds the
  consumer to viem and to a chain definition. `{to, value, data}` is what every wallet, every
  account abstraction stack and every delegation redeemer accepts.
- **Preparing the delegated form only, since the delegation is the guard rail.** Rejected because it
  makes the guard rail the price of entry. Task 16 is explicit: direct mode is the on-ramp.

## Consequences

**Positive:**

- The custody question is closed by construction, not by review. Nothing in `erc8004/` can sign.
- The consumer keeps its own signing stack, whatever it is. ARP never sees a key or a signature.
- `totalValue` on a plan lets a caller check the cost against a cap **before** signing, rather than
  discovering an overrun as a revert. A term creation is a non-recoverable fee, so this matters.
- Planning is read-only, which means the whole path can be verified against live mainnet without
  spending anything. It was, on 2026-10-19: agent `8453/1380` resolved to its real identity atom and
  the plan came back at 0.400000000006 TRUST for two tools, nothing sent.

**Negative:**

- Two round trips for the caller: get the plan, then send it. A single `declareAndStake(signer)`
  would be one call and is what an SDK usually offers.
- The caller must send the calls **in order**, because an atom has to exist before the edge that
  references it. The order is in the array and documented, but it is now the caller's job.
- Nonce management, gas estimation, retries and receipt waiting all move to the caller. The
  connector cannot help with any of it, by design.

**Neutral (worth knowing):**

- The delegated wrapper (`toDelegatedCalls`) is still preparation: it re-encodes the calls to target
  the `DelegationManager` and returns them unsigned. It needs
  `@metamask/smart-accounts-kit`, declared as an **optional peer dependency** and imported
  dynamically, so direct-mode consumers never load it.
- The package's "read-only throughout" claim is now false in letter and was corrected rather than
  quietly left standing. The invariant that carries the weight is narrower: never signs, never
  sends.

## References

- Related rule: `.claude/rules/portability.md` (new protocol logic lives in `erc8004/`), and its
  exception — "the connector never signs and never sends, and that invariant is worth more than the
  symmetry"
- Related rule: `.claude/rules/security.md` (mainnet signing, one canonical statement)
- Related doc: `docs/12_THE_IDEA.md` points 3 and 5
- Related ADR: `.claude/choices/0035-the-agent-stakes-its-own-trust-and-arp-is-not-a-party.md`
- Related ADR: `.claude/choices/0036-an-agent-may-stake.md`
- Related ADR: `.claude/choices/0039-the-deposit-goes-on-the-edge.md`
