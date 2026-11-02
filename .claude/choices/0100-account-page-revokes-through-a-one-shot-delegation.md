# 0100 — `/account` revokes through a one-shot delegation, keeps a list, and holds no key

**Status:** Proposed
**Date:** 2026-11-02
**Triggered by:** `docs/tasks/35-the-account-page.md`, §0 (the user's amendment of 2026-10-30) and
§3.

## Context

`/account` lists the delegations the operator's Smart Account signed, signs new ones with ARP's
caveats (moved from `/rig` steps 3-4) and revokes them. Four facts constrain how:

1. `DelegationManager.disableDelegation` reverts unless `msg.sender` is the delegation's delegator
   (`contracts/lib/delegation-framework/src/DelegationManager.sol:90`, `onlyDeleGator`, defined at
   `:53`). The delegator is the Smart Account, not the operator's wallet.
2. The Smart Account's own `disableDelegation` is `onlyEntryPointOrSelf`
   (`contracts/lib/delegation-framework/src/DeleGatorCore.sol:364`), and this app wires no bundler
   (ADR `0009` deferred it; `grep -rni bundler apps/web/src` finds only comments saying so), so no
   userOp can make it call.
3. The old store (`arp.delegations.v2.<sa>`) held **one** delegation per Smart Account and `set`
   overwrote it. Signing a second dropped the first from the only place that remembered it, while
   the first stayed redeemable on chain.
4. `fundAndApproveRuntime` (`apps/web/src/services/delegation-redeem.ts:238`) takes the runtime's
   private key, and the task forbids this page to hold a key (§5).

## Decision

- **Revoke = a one-shot delegation, redeemed by the operator.** The Smart Account signs a delegation
  to the connected wallet whose caveats are `ExactExecution` (target the `DelegationManager`, value
  0, the exact `disableDelegation(target)` calldata) and `LimitedCalls(1)`. The wallet redeems it;
  the `DelegationManager` calls `executeFromExecutor` on the Smart Account, which calls
  `disableDelegation` as itself. Two prompts: one signature, one transaction on 13579.
  `redeemDelegations` carries no reentrancy guard, so the nested call is allowed
  (`DelegationManager.sol:126`). Built in `apps/web/src/services/delegation-revoke.ts`.
- **The store is a list** (`arp.delegations.v3.<sa>`, `apps/web/src/services/delegation-store.ts`). A
  `v2` entry is carried into the list once and its key removed.
- **The page shows the runtime's balance and does not fund it.** Funding through
  `fundAndApproveRuntime` needs the runtime's key in the tab; the page holds none.
- **Signing and revoking are 13579 only**, and refused before any prompt when the wallet is
  elsewhere: the `DelegationManager` has one address on many chains, so a wrong-chain send would not
  fail loudly.
- **A row's on-chain state has three values** (`readDelegationState` in `packages/protocol`): a
  failed read is `unknown`, never `enabled`, and offers no revoke.

## Alternatives considered

- **A bundler and a userOp calling the Smart Account's `disableDelegation`.** The direct route, and
  the one the kit documents. Not available: no bundler is wired (ADR `0009`), and wiring one is its own task.
- **Delegate the revocation to the runtime.** The runtime holds a delegation already, but a
  revocation authority held by the party being revoked is upside down.
- **An open-ended delegation to the operator's wallet.** One signature for every later revoke, but
  a standing power over the Smart Account that `ExactExecution` + `LimitedCalls(1)` avoids.
- **Paste the runtime key to fund and approve here.** What `/rig` step 5 did. Refused by §5.

## Consequences

**Positive:**
- Revocation works with the wallet and the deployed framework alone, and the authority it creates
  is spent by the one act it allows.
- No signed delegation is silently forgotten by this browser.

**Negative:**
- Two prompts per revoke instead of one.
- Funding and the runtime's MultiVault approval leave the web app; they need the runtime's own key,
  which is `arp`'s and the scripts' business.
- Rows are **local only**. Task 37a's discovery read (`discoverDelegations`) is not built, and
  `apps/sponsor`'s `/publish` answers 503 until the pinning service and the two predicate ids are
  decided (`docs/tasks/37` §7), so another browser still sees nothing.

**Neutral (worth knowing):**
- The one-shot delegation is not stored: it is spent on use, and a second redemption reverts on
  `LimitedCalls` and on `AlreadyDisabled`.

## References

- Related rule: `.claude/rules/metamask-delegation.md`, `.claude/rules/security.md`,
  `.claude/rules/portability.md`
- Related doc: `docs/tasks/35-the-account-page.md`, `docs/tasks/37-the-delegation-register.md`
- Related ADR: `0009`, `0036`, `0092`, `0094`
