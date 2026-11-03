# 0116 — Local state lives under ~/.arp, one key-file policy, /mint-gas is signed, local services refuse the browser

**Status:** Accepted
**Date:** 2026-11-03
**Triggered by:** `docs/tasks/60-audit-cleanup.md`, stream C (the read-only audit of 2026-11-02,
server apps). The user authorised every item.

## Context

The audit found the server apps (`apps/sponsor`, `apps/node`, `apps/mcp`, `apps/api`) each solving
the same local problems separately, and differently:

- **State resolved against the working directory.** The sponsor ledger, the node ledger and the MCP
  receipt key defaulted to `<cwd>/.arp/`. Start the sponsor or the node from another directory and it
  read an empty ledger, so every proof and every payment it had recorded was accepted again. Start
  the MCP server elsewhere and it generated a new receipt key, a different signer from the one a
  sponsor accepts.
- **Four key loaders, four policies.** The sponsor refused a non-0600 file; the node checked 0600
  and fell back to `AGENT_PRIVATE_KEY`; the sponsored-mode agent key `chmod`ded a readable file
  instead of refusing it; the receipt key was read with no check.
- **Loopback listeners that a web page could drive.** The sponsor ignored the content type and
  checked neither `Host` nor `Origin`, so a `text/plain` POST from any page in the operator's
  browser reached `/mint-gas`, `/gas` and `/identity`, which sign with the treasury key. The MCP HTTP
  transport had the same three gaps and no authentication.
- **`/mint-gas` was unauthenticated**: a bare address, so anyone could spend the day's cap of new
  agents on addresses nobody holds.

## Decision

1. **Local state lives under `ARP_HOME`, else `~/.arp`** — never the working directory. Each
   program's own variable (`SPONSOR_LEDGER`, `AGENT_NODE_LEDGER`, `ARP_NODE_KEY_FILE`,
   `ARP_RECEIPT_KEY`) still wins. A program that finds the old file in `<cwd>/.arp/` and none under
   the home **refuses to start and prints the `mv` to run**; nothing is moved silently, because which
   copy is the real one is the operator's decision.
2. **One key-file policy**, `readKeyFile` / `loadOrCreateKeyFile` in `@arp-protocol/core/node`:
   refused when group or other can read it (`chmod 600` and restart), created 0600 in a 0700
   directory, mode not checked on Windows. All four keys use it. `AGENT_PRIVATE_KEY` and
   `ARP_RECEIPT_KEY` remain the two keys that may come from the environment, because `docs/22`
   documents both as supported.
3. **`/mint-gas` takes a `MintGasRequest` signed by the address that receives the gas**
   (`packages/protocol/src/sponsor/mint-gas.ts`): EIP-712, `chainId` in the domain, no
   `verifyingContract` because no contract checks it, `expiresAt` at most an hour ahead, and a nonce
   the service spends once in its ledger. It is the eighth signature site in `security.md`.
4. **The sponsor and the MCP HTTP transport refuse cross-origin requests**
   (`refuseForeignRequest`): `Host` must name the listener (its loopback forms; for the MCP server
   also `ARP_HOST` when that is one address, and `ARP_ALLOWED_HOSTS`), a browser `Origin` must be
   allowed (none is, for the sponsor), and a `POST` must be `application/json`. The MCP sponsored
   mode (`ARP_TOOLS=desktop|sponsored`), which holds an agent key, refuses to start over HTTP.

The same stream bounded every network wait it found unbounded (sponsor and agent-key receipt waits
at 120 s, with an unconfirmed send kept pending in the ledger with its hash; the node handler's
timeout now aborts it and keeps the payment claimed until it settles; the MCP registration-file
fetch and the sponsored loop; the API's upstream reads), gave the sponsor ledger an in-memory index
and an exclusive lock file, and moved the duplicated helpers into `@arp-protocol/core/node`. Those
follow from the audit's items and are recorded in the commits, not decided here.

## Alternatives considered

- **Move the old state file automatically.** Rejected: a ledger or a key has exactly one real copy,
  and a program that guesses which one can merge two operators' histories or replace a key a
  sponsor accepts. Refusing costs one `mv`.
- **Keep `<cwd>/.arp/` and document "always start from the same directory".** Rejected: the MCP
  server is started by whichever client launches it (Claude Desktop on Windows starts it in
  `system32`), so the working directory is not the operator's to choose.
- **chmod a readable key instead of refusing it.** Rejected: by the time it is found readable it may
  have been copied, and a quiet fix hides that from the operator.
- **Authenticate `/mint-gas` with the existing `SponsorRequest`.** Its struct names an agent id, a
  term and a proof; an address about to register has none of the three, so a separate three-field
  struct is the honest shape.
- **A shared secret or token for the local listeners.** More to configure for a threat (a web page)
  that the three header checks already close; a process on the machine could read a token anyway.

## Consequences

**Positive:**

- A restart from any directory reads the same ledger and the same key.
- One rule an operator learns once: every ARP key file is 0600 or the program stops.
- A page in the operator's browser can no longer spend the treasury through the sponsor or drive
  the MCP server.

**Negative:**

- **Every existing install with state in `<cwd>/.arp/` stops at its next start** until the operator
  moves the file: the receipt key (`<cwd>/.arp/receipt-key` → `~/.arp/receipt-key`), the sponsor
  ledger (`sponsor-ledger.jsonl`) and the node ledger (`node-payments.jsonl`). This is deliberate and
  the message says what to run, but it is a break.
- A `/mint-gas` client must sign; an older client's bare address is refused with 400.
- The MCP server opened with `ARP_HOST=0.0.0.0` now needs `ARP_ALLOWED_HOSTS` for a LAN client's
  `Host`.

**Neutral (worth knowing):**

- `belowProofCost` and `withdrawalThresholdBps` were left in place: the first is hard-wired off in
  `main.ts` but is ADR `0094` §2's mainnet rule, defined in the protocol's `SponsorLimits` and
  tested; the second is reachable through `SPONSOR_WITHDRAWAL_THRESHOLD_BPS`. `/publish` stays
  built and off (ADR `0092`).
- The node's `cf-connecting-ip` is now read only behind `cloudflared` and the right-most
  `x-forwarded-for` hop only behind ngrok; any other tunnel rate-limits on the socket address.

## References

- Related rule: `.claude/rules/security.md` (signature sites), `.claude/rules/code.md`
- Related doc: `docs/22_RUNNING_THE_NODE.md` (files, env vars, the write-and-connect grep)
- Related ADR: `0080` (receipt key), `0092`, `0094`, `0110` (sponsoring service), `0082` (what apps share)
- Task: `docs/tasks/60-audit-cleanup.md`, stream C
