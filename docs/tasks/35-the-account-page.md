# Task 35 — The account page: delegations and settings

**Status:** **PLAN**, 2026-10-30. Not started.
**Required skills:** `mms-smart-accounts-kit` (read `references/delegations.md` first, on revocation).
**Rules:** `code.md`, `ui.md`, `metamask-delegation.md`, `security.md`, `portability.md`, `claims.md`,
`workflow.md`.
**Reviewers:** `ui-reviewer`, then `task-verifier`.

---

## 1. Why

The user, 2026-10-30: _« je veux une page account pour gérer les délégations et tout ce qui est
settings, rien à voir avec activity qui, elle, regroupe toutes les positions, l'activité et
autre »_.

That splits the operator's surface in two, and the split is the decision:

| page                                           | holds                                                                                                                             | does not hold                             |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **`/account`** (this task)                     | what the operator **has authorised and configured**: delegations, the chain, the smart account, the agent runtime it delegates to | any figure of what happened               |
| **`/activity`** (another session, in progress) | what **happened**: positions, the agents' calls, deposits, receipts                                                               | any control that changes an authorisation |

**Consequence for `/profile` ("Your positions"):** it belongs on the activity side. Moving it is
`/activity`'s call, not this task's. This task does not touch `/profile` or `/activity`.

## 2. What exists today

Measured on `5c8417f`.

- **Delegations are signed in `/rig`** (`apps/web/src/pages/AgentRegister.tsx`), during agent setup,
  and nowhere else. The services are `services/delegation.ts` (build, sign, serialise),
  `lib/caveat-builder.ts` (`trustStakeCapCaveat`, `composeAndStakeCaveats`) and
  `services/smart-account.ts`.
- **They are stored in the browser only** (`hooks/use-stored-delegations.ts`, key
  `arp.delegations.v2.<smart account>`), one `compose` delegation per smart account. Another
  browser does not see them. The delegation is never published on chain (`metamask-delegation.md`,
  Storage).
- **Nothing revokes one.** The Delegation Framework does it with `DelegationManager.disableDelegation`
  (`.claude/skills/mms-smart-accounts-kit/references/delegations.md:787`). No code in the repo calls
  it.
- **The chain choice** is a toggle (`lib/chain-choice.ts`, `arp.chain.v1` in `localStorage`).

## 3. The page

One column, labels above inputs (`ui.md`, Layout). No explanatory sentence inside a card; a figure
that needs a caveat gets a `Hint`.

1. **Wallet and smart account.** The connected EOA, the smart account derived from it, whether it
   is deployed, and the chain. The chain toggle lives here.
2. **Delegations.** One row per delegation this browser holds, showing:
   - the delegate (the agent runtime's address);
   - the caveats, read back from the stored struct: the cap, the period and the enforcer;
   - when it was signed;
   - **its state on chain**: whether `disableDelegation` has been called for its hash.

   Two actions per row:
   - **Revoke.** The operator's own wallet signs `disableDelegation`. A human click, never automatic.
   - **Export.** Copies the signed blob for the headless runtime, which `/rig` already expects
     the operator to do.

3. **New delegation.** The caveat form from `/rig` (cap, period), extracted into a shared component
   so the two pages build delegations identically. `/rig` keeps its first-run flow and links here
   for anything after it.
4. **The agent runtime.** The delegate address the delegations name, and its balance. Funding it is
   `fundAndApproveRuntime`, which already exists (`services/delegation-redeem.ts:240`).

Layers as `code.md` requires: the revocation call is a service, a hook bridges it, and the page
calls the hook.

## 4. Decisions for the user, before the step that needs them

1. **Delegations from another browser.** They are invisible today, because storage is local. The
   options:
   - accept it, and say so on the page with a `Hint`;
   - import a pasted blob;
   - read them from the chain. A delegation is not on chain until it is redeemed, so this would
     only find the redeemed ones.

   Recommendation: the first two.

2. **Mainnet.** ADR `0036` allows delegated staking on 1155 "once the path has been proven on
   testnet end to end". It has not been. Recommendation: the page signs and revokes on **13579
   only**, and on 1155 it shows the toggle and nothing that signs, until that proof exists.
3. **What else counts as a setting.** Candidates that live on the operator's machine rather than in
   a browser: the node's config (registry, agent id, port, key file, task 33e), and whether the hook
   and the MCP server are installed (task 33c, `arp doctor`). A web page cannot read them. They stay
   in `arp`, unless the user wants them shown through the local feed `/activity` uses.

## 5. Do not do in this task

- Move or restyle `/profile` or `/activity`.
- Put a figure of past activity on this page: no positions, no history, no totals.
- Sign anything automatically. Every signature on this page is a click on a confirmation that names
  the chain (`portability.md`: the chain rides on the thing being signed).
- Store a key. The page holds signed delegations, which an attacker cannot redeem without the
  runtime's key (`use-stored-delegations.ts` header). It never holds the key itself.

## 6. Tests

- Service: `revokeDelegation` builds the `disableDelegation` call for a given delegation against a
  mocked wallet client. The delegation's on-chain state is read through a mocked transport.
- Page, behavioural (`@testing-library/react`): a stored delegation renders its delegate and cap.
  Revoke asks for confirmation and names the chain. On 1155 no signing control renders.

## 7. Evidence ladder

`docs/12` point 5 makes the signed delegation "the guard rail". An operator who cannot see or revoke
one has a guard rail they cannot inspect. This page makes the **staked** rung's bound visible and
revocable. It does not move a claim up a rung.
