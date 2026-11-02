# 0102 — x402 is for mainnet; on testnet consulting ARP is free

**Status:** Accepted
**Date:** 2026-11-02
**Triggered by:** user decision, 2026-11-02: _« le x402 ce sera pour mainnet, pour le testnet pour
le moment c'est gratuit »_

## Context

ADR `0094` §4 puts the index, the MCP tools and the content route behind x402 in USDC, settled on
Base Sepolia while on testnet, and `docs/tasks/41` plans it. Task 45e already asked for four reads
to stay free on testnet 13579 through an exemption. Nothing of task 41 is built.

## Decision

Task 41 waits for the mainnet port. On testnet 13579 consulting ARP is free: the index, the MCP
tools and `GET /content/:atomId`. There is no free tier to build, because there is no paid tier.

This is about ARP's own routes. An operator's node keeps the native payment it already verifies for
a hire (`apps/node/src/task.ts`, `verifyPayment`); 41b's x402 beside it waits with the rest.

ADR `0094` §4 stands for mainnet, unchanged.

## Alternatives considered

- **Build x402 on Base Sepolia now, exempting 45e's four reads.** That is the plan `docs/tasks/41`
  wrote. Not chosen: the user wants the testnet demo free, and a paywall on testnet measures nothing
  real, since test USDC has no value.

## Consequences

**Positive:**

- Testers reach every route with no USDC and no Base Sepolia wallet. Task 45e is met by default.
- One chain less on testnet: nothing settles on Base Sepolia.

**Negative:**

- **A content receipt is still never sponsored on testnet.** ADR `0096` refuses it until a fetch
  has a price, and the price was task 41. So on testnet the only sponsored path is agent-to-agent
  hire. A skill fetched through ARP can be declared, but the agent pays for that declaration itself.
- The paid-call count that ADR `0094` names as the usefulness measure does not exist before
  mainnet. Until then, usefulness can only be read from declarations and deposits.
- The x402 integration is first exercised on mainnet unless it gets its own rehearsal before that.
  The port needs a test plan, and an x402 on Base Sepolia exercised only in CI would do.

**Neutral (worth knowing):**

- `packages/protocol/src/registration-file.ts:134` keeps writing `x402Support: false`, which is
  now true by decision.

## References

- Related ADR: `.claude/choices/0094-arp-is-the-directory-and-the-verifier-never-the-relay.md` §4
- Related ADR: `.claude/choices/0096-the-sponsoring-service-sponsors-only-a-priced-proof.md`
- Related task: `docs/tasks/41-x402-in-usdc.md`, `docs/tasks/45-discovery-without-a-command.md` 45e
