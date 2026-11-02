# 0110 — The Desktop extension holds a local agent key, for identity and off-chain signatures

**Status:** Accepted
**Date:** 2026-11-02
**Triggered by:** `docs/tasks/50-desktop-walks-the-loop.md`, decision D1, the user's answer
(2026-11-02, `docs/tasks/50` §3b) and the rule above it: « je veux que cette application soit pour
des utilisateurs non web3 », « je veux abstraire tout ça »

## Context

ADR `0038` makes ARP's write path a plan: the protocol package returns `PreparedCall[]` and holds "no
wallet client, no signer parameter, no private key and no send path". The MCP server follows it,
and its tools return unsigned calls.

That fits Claude Code, where the agent's own runtime holds a key and signs. It does not fit an
outside user in Claude Desktop Chat. Nothing there signs, and the user is not to see a wallet, a
key, TRUST or a signature. An ERC-8004 identity still needs a transaction from the key it is
minted to: the registry mints to `msg.sender` (`contracts/src/erc8004/IdentityRegistry.sol`,
`register` → `_mintAgent(msg.sender, …)`). And a sponsored deposit needs a request signed by the
agent (`packages/protocol/src/sponsor/request.ts`).

## Decision

**The Claude Desktop extension creates and holds one local agent key, silently.** It is the
agent's operating identity, and it signs only what follows:

| it signs                                                 | value | where          |
| -------------------------------------------------------- | ----- | -------------- |
| `register()` on ARP's testnet `IdentityRegistry`          | 0     | 13579 only     |
| the MultiVault approval that lets the sponsor deposit for it | 0  | 13579 only     |
| the off-chain request a content receipt is issued to       | —     | typed data     |
| the off-chain sponsor request (`signSponsorRequest`)       | —     | typed data     |

The gas for both transactions is sent by the sponsoring service. Every TRUST-bearing write is the
sponsor's (`receiver` = the agent, ADR `0094`).

The rules on the key:

- It is generated on first run in the user's home directory (`~/.arp/`), not the working directory,
  in a file of mode 0600. It is never printed, logged or returned in a tool result.
- The extension refuses to sign a transaction with a value above zero, or on any chain but 13579.
- **It is never a content-receipt signer.** The content server signs with its own key. A receipt
  the agent's key signed is `self-signed`, and ADR `0109` accepts only ARP's content servers.
- **The protocol package is unchanged.** ADR `0038` stands for `packages/protocol`: it holds no
  signer. The key lives in the extension's build of the MCP server, which arp-7f builds
  (`docs/tasks/50` §4).

## Alternatives considered

- **The user signs in their own wallet** (a `/sign` page, or a delegation). That puts web3 in sight,
  which the user ruled out for this audience. `/sign` stays an option for an operator who wants it
  (`docs/tasks/50` §3b).
- **ARP mints for the agent.** The registry mints to `msg.sender`, so the identity would be ARP's.
  ARP's to move, and on mainnet ARP owns no registry: portability rule 4 ("never rely on controlling
  the registry") rules that out.
- **No identity in Chat.** Then a Chat agent could read and could not declare, which leaves task 50's
  gap open.

## Consequences

**Positive:**

- An outside user walks the loop in Chat with nothing installed and nothing to sign.
- ARP still holds no key of the agent's. The key is on the user's machine, and ARP cannot move what
  it holds.

**Negative:**

- **A lost key loses the identity and the positions held in its name.** On testnet they have no
  value. On mainnet they do, so the port needs an invisible recovery first (`docs/tasks/50` §3b).
- On Windows, mode 0600 is not enforced by the file system's ACLs. The key file there is readable by
  whatever runs as the user.
- The MCP server's line "signs no transaction" (`CLAUDE.md`'s directory map) is true of the server
  and false of the extension build. Both have to say which.
- Two sponsor routes this needs, both decided by the user the same day and built the same day in
  `apps/sponsor/src/service.ts` (`/mint-gas`, `/identity`, and the creation in `/deposit`):
  - **Gas for the mint, once per address, under a global daily cap.** `/gas` today pays only an
    agent that is already registered. For the mint it pays an address that is not, once ever, and a
    cap on new agents per day bounds what anyone asking can drain. Testnet 13579 only.
  - **The sponsor creates the identity atom and the first `uses` triple, then deposits the agent's
    position on it.** « peu importe le créateur, c'est le stake qui compte » (the user). The
    creation's first position is the sponsor's, as `/publish` already does (ADR `0053`). The
    position that counts is the deposit with `receiver` = the agent. This amends task 40 §3, where
    the service created no `uses` triple.
  - Both widen ADR `0094` §3 ("the only value sent anywhere else is the approval gas"): the mint gas
    is a second plain transfer, to an unregistered address.

- **The two new routes take no signature, so anyone can use up a day's new-agent slots.** Spend
  stays within the caps: the damage is that honest agents get a 429 until 00:00 UTC. `/mint-gas`
  refuses an address that already holds an agent. A signature on `/identity` would not help, because
  an attacker signs for agents of their own. A creation is counted per agent
  (`checkCreateLimits`), so a deposit that keeps failing does not keep creating triples. That bound
  was added on review (2026-11-02). Before it, one agent that never approved could spend the whole
  budget on creations.

**Neutral (worth knowing):**

- Mainnet needs a new ADR, together with the money-entry decision (`docs/tasks/50` §3b).
