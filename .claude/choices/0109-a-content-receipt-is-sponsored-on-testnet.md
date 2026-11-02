# 0109 — A content receipt is sponsored on testnet 13579

**Status:** Accepted
**Date:** 2026-11-02
**Triggered by:** `docs/tasks/50-desktop-walks-the-loop.md`, decision D2, the user's answer
« Oui, sur testnet » (2026-11-02, `docs/tasks/50` §3b)

## Context

An outside user in Claude Desktop Chat declares the skills Claude used and pays nothing
(`docs/tasks/50` §1, and task 45's « pour les testeurs ce sera gratuit et je finance en trust »). In
Chat, the one proof such a user can produce is ARP's **content receipt**: the skill's files were
served through ARP's content server, which signed for the fetch (`apps/mcp/src/content.ts`).

The sponsoring service refused that receipt on every chain. ADR `0096` sponsors only a proof with a
price, and a fetch through ARP has none until x402 puts one on it (`docs/tasks/41`). ADR `0102` then
kept x402 for mainnet and wrote the consequence down: "A content receipt is still never sponsored on
testnet". So on testnet the only sponsored path was an agent-to-agent hire, which a Chat user does
not make.

## Decision

**On testnet 13579, the sponsoring service sponsors a deposit backed by a content receipt.** That is
`apps/sponsor/src/service.ts`, the `proven.cost === null` branch. Every check that held before still
holds:

- the receipt's signature verifies (`verifyContentReceipt`);
- its signer is in `SPONSOR_CONTENT_SIGNERS`, which lists ARP's content servers. A receipt signed by
  any other key is refused as `unknown-signer`;
- the receipt names the requesting agent as its caller (`receipt.to`). A receipt about somebody
  else's fetch is refused as `other-caller`;
- the edge is `(requester identity, uses, the receipt's tool atom)`, and no other;
- one receipt sponsors one deposit (ledger id `content:<chain>:<signer>:<nonce>`), within ADR
  `0092`'s per-agent daily count and global daily budget.

**What stays as it was.** On any other chain an unpriced proof is still refused with "no price yet",
and the gate is the chain id, not configuration. With `belowProofCost` on (the mainnet rule of ADR
`0094` §2), an unpriced receipt is refused on every chain, because nothing is below an unknown price.
Mainnet keeps ADR `0096` and ADR `0102`.

**The content server signs with its own key, never the agent's.** A receipt signed by the key that
also declares is `self-signed`, and that is self-attestation. The extension's local agent key (ADR
`0110`) is not, and must never be, in `SPONSOR_CONTENT_SIGNERS` (arp-7f, 2026-11-02).

## Alternatives considered

- **Keep refusing until task 41.** Then a Chat user pays for every declaration or makes none, which
  is the gap task 50 exists to close. Task 41 is mainnet (ADR `0102`), so the wait would last until
  the port.
- **Sponsor at a nominal price.** ADR `0096` already refused it: it invents a cost nobody paid.
- **A configuration flag instead of the chain gate.** It would let a mainnet deployment turn content
  sponsoring on with one environment variable. Through the chain gate, mainnet needs a code change
  and a new ADR.

## Consequences

**Positive:**

- A skill served through ARP can be declared and supported at no cost to the user, on testnet.
- ADR `0096`'s self-dealing objection ("an operator runs a content node and has it sign for its own
  agent") does not apply here: only ARP's content servers are accepted signers, and the budget caps
  the spend.

**Negative:**

- **A content receipt attests access, not use.** A sponsored deposit backed by one shows that the
  agent fetched the skill through ARP, and nothing about whether the skill changed what it did. The
  proof's `strength` stays `access`, and nothing labels it more than that.
- An agent can collect receipts by fetching skills it never uses. On testnet the bound is the daily
  count (2 per agent by default) and the budget.
- ADR `0102`'s consequence "A content receipt is still never sponsored on testnet" and ADR `0096`'s
  status line ("A content receipt is still refused until `docs/tasks/41`") are superseded for
  testnet by this ADR. Both are append-only and left as written.

**Neutral (worth knowing):**

- The service's info route says which rule is in force.
- This does not create the `uses` triple. `/deposit` still refuses a term that does not exist
  (task 40 §3), so a first declaration needs the triple created first. `docs/tasks/50` tracks who
  pays for that.
