# Task 35 — The account page: delegations and settings

**Status:** **BUILT, NOT VERIFIED**, 2026-11-02, on `feat/35-account-page`. Completion note at the
end; `ui-reviewer` and `task-verifier` have not run.
**Required skills:** `mms-smart-accounts-kit` (read `references/delegations.md` first, on revocation).
**Rules:** `code.md`, `ui.md`, `metamask-delegation.md`, `security.md`, `portability.md`, `claims.md`,
`workflow.md`.
**Reviewers:** `ui-reviewer`, then `task-verifier`.

---

## 0. Amendment, 2026-10-30 — the user's decisions, which this task now carries

The user, on `/profile`, `/rig` and the wallet menu (session arp-63, 2026-10-30):

- **A wallet menu.** The wallet button opens a menu: copy the address, **Account** (opens
  `/account`), disconnect. _« un bouton account dans le menu wallet (copy wallet, disconnect et
  setting) pour permettre la gestion des délégations »_.
- **`/profile` goes.** What it shows (positions on atoms and on triples, net of withdrawals) moves
  into `/activity`, per this task's own split. Then `/profile` and the `/me` redirect are removed.
  _« profile j'ai l'impression que ça sert à rien »_.
- **`/rig` goes.** Its steps 1-2 are superseded by `/agent`. Steps 3-4 (signing a delegation with
  ARP's caveats) are the only UI that signs one, and they move into `/account`. Then `/rig` and its
  page (`apps/web/src/pages/AgentRegister.tsx`) are removed. _« /rig sert plus à rien ? »_.
- Delegations are listed through task 37a's discovery read (merged with task 40). On testnet,
  publication is sponsored (ADR `0092`).

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

1. ~~**Delegations from another browser.**~~ **Decided 2026-10-30**: they are published on Intuition
   testnet, as Hourglass does, paid by ARP's sponsor relay within daily limits. ADR `0092`, built in
   `docs/tasks/37-the-delegation-register.md`. Pasting a blob stays as the fallback for import.
2. ~~**Mainnet.**~~ **Decided 2026-10-30**: testnet only until it is validated with Intuition (ADR
   `0092`). ADR `0036` allows delegated staking on 1155 "once the path has been proven on
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

## 8. Completion note, 2026-11-02 (not yet verified)

On `feat/35-account-page`. ADR `0100`. §0 supersedes three sentences above: §1's "this task does not
touch `/profile` or `/activity`", §3.3's "`/rig` keeps its first-run flow", and §5's first bullet.

- **Wallet menu**: copy address, Account, Disconnect (`apps/web/src/components/WalletConnect.tsx`).
- **`/account`** (`apps/web/src/pages/AccountPage.tsx`): wallet and Smart Account with the chain
  toggle; one row per stored delegation with delegate, decoded caveats, signing time and on-chain
  state (`readDelegationState`, three values); Revoke behind a confirmation naming 13579; Export;
  the caveat form (`components/account/DelegationForm.tsx`); each delegate's balance.
- **Revocation** is a one-shot `ExactExecution` + `LimitedCalls(1)` delegation redeemed by the
  operator's wallet (`services/delegation-revoke.ts`), because `disableDelegation` must come from
  the Smart Account and no bundler is wired (ADR `0100`).
- **Storage** is a list per Smart Account (`services/delegation-store.ts`, `arp.delegations.v3`); a
  `v2` entry migrates once.
- **Removed**: `/profile`, `/me`, `/rig`, `pages/Profile.tsx`, `pages/AgentRegister.tsx`,
  `useTotalAgents`, `serializeDelegation`/`deserializeDelegation`, the "Invest" nav link. The
  positions are `components/activity/Positions.tsx` on `/activity`.

**Not done:**

- **Listing through 37a's discovery read.** `discoverDelegations` is not built (`docs/tasks/37` §7),
  and `apps/sponsor`'s `/publish` answers 503, so every row says "local only" and nothing is
  published. Only 37a's `isDisabled` half exists, as `readDelegationState`.
- **Funding the runtime** from this page: `fundAndApproveRuntime` needs the runtime's key (§5).
- `ui-reviewer`, `task-verifier`, a post-mortem, and a walk on 13579.
