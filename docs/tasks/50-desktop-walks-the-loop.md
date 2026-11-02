# Task 50 — Claude Desktop walks the loop, and an outside user pays nothing

**Status:** **PLAN**, 2026-11-02. Nothing built. D1, D2 and D3 are decided (§3b). The ADRs they
call for are next, then the build once task 49 is merged.
**Depends on:** task 49 (`feat/49-lean-search`): the Desktop startup fixes are in `b850a45`.
**Owners:** session arp-7f (the extension, `apps/cli` and `apps/mcp`), session arp-30 (the web app,
and this file).
**Rules:** `security.md`, `code.md`, `claims.md`, `portability.md`, `workflow.md`.
**Reviewers:** `intuition-integrator`, `ui-reviewer`, `contract-reviewer` if a contract is touched,
then `task-verifier`.

---

## 1. Why

The user tested ARP in Claude Desktop with a `.mcpb` extension (arp-7f, 2026-11-02). Search works.
The rest of the loop does not:

| Step | In Claude Code | In Desktop Chat today |
| --- | --- | --- |
| Find tools | `arp_find_tools` | works (`ARP_TOOLS=read` build) |
| Record what was invoked | the PostToolUse hook writes `.arp/session.jsonl` | **nothing**: Chat runs no hook, Windows has no Node, and the server's cwd is `C:\Windows\system32` |
| Declare | `arp_declare_session`, signed by the operator | **not exposed** in the build, and nothing in Desktop signs |
| An identity | `scripts/sandbox/setup.ts` mints on 13579 | `/register` mints on **Base** (`apps/web/src/services/identity-mint.ts:89`, `MINT_CHAIN = base`) |

The user's goal (2026-11-02): an outside user adds the extension in Desktop Chat and walks the
whole loop **with nothing installed and nothing paid**. That is task 45's decision too: « pour les
testeurs ce sera gratuit et je finance en trust ».

## 2. The path proposed

1. **The extension gives the agent an identity.** It generates a key on first run in the user's home
   directory (not the cwd). The sponsor sends the gas, and the key calls `register()`, because the
   registry mints only to `msg.sender` (`contracts/src/erc8004/IdentityRegistry.sol`, `register` →
   `_mintAgent(msg.sender, …)`). Then the identity atom is written, sponsored.
2. **Skills come through ARP.** A tool returns a skill's files fetched through the content server,
   with a signed receipt. The extension observes **which skill it served**, the way the hook names
   one in Claude Code, without taking the agent's word for it. A receipt attests access, never use.
3. **Claude declares what it used.** `arp_declare_used` in a full build. A skill served in step 2 has
   its receipt attached.
4. **The sponsor pays.** The declaration and its deposit are paid by the sponsoring service, within
   its limits, so the user signs nothing and pays nothing. The position is the agent's (`receiver`).

MCP tools other than skills stay **declared by the agent** in Chat. Observing them would mean
routing them through ARP (a local proxy). That is `docs/12`'s drift signal about requests going
through ARP, so it is not proposed here.

## 3. The decisions this needs (the user's)

| # | Decision | What it reopens |
| --- | --- | --- |
| D1 | **The extension holds a local agent key.** It is used for the identity mint and for the off-chain signature of a receipt request. Every TRUST-bearing write is paid by the sponsor. | ADR `0038`: "no wallet client, no signer parameter, no private key and no send path anywhere in the package". An ADR would draw the line, for example a key for the agent's own identity and off-chain signatures, and never for value. |
| D2 | **A content receipt is sponsored on testnet.** | ADR `0102`, consequences: "A content receipt is still never sponsored on testnet". ADR `0096` refuses it until a fetch has a price, and the price is task 41, deferred to mainnet. |
| D3 | **The sponsoring service runs.** It needs a key file, a deployment and a budget. | `.claude/STATE.md` task 40: built and verified, "**Not running**: no key file, no deployment, no transaction sent". ADR `0092` gives the per-delegator and global daily limits. |

## 3b. The user's answers (2026-11-02)

| # | Answer |
| --- | --- |
| **The rule above all three** | **Abstract all of it**: « je veux que cette application soit pour des utilisateurs non web3 », then « je veux abstraire tout ça ». An outside user sees no wallet, no key, no TRUST and no signature, on testnet and later on mainnet. This extends task 45's « rien de web3 n'est visible pour l'opérateur » |
| D1 | **Yes, abstracted.** The extension creates the agent's key silently. It signs the identity mint (with gas the sponsor sends once) and off-chain receipt requests, never a value-bearing write. The sponsor's deposits are positions held in the agent's name (`receiver`), which on testnet is tTRUST with no value |
| D2 | **Yes, on testnet 13579 only**, within the sponsor's daily limits. Mainnet keeps ADR `0102` |
| D3 | **Yes, locally first.** The treasury key comes from a file the agent never reads. It goes online later |

**Open for the mainnet port, not decided:** how money enters without web3 showing. Either prepaid
credits paid by card, with ARP's sponsor spending its own TRUST (simplest for the user; ARP holds
prepaid euros, and the positions sit on the local key), or an invisible wallet (a passkey smart
account funded by card, delegating a capped allowance to the agent key; ARP holds nothing, but
there are more pieces). A delegation the user signs themselves is ruled out for this audience,
since it is web3 in sight.

**The user leans to the first** (« me paraît pas mal », 2026-11-02): ARP sells credits by card and its
sponsor spends its own TRUST. Not decided until the port. Two things go with it:

- **A lost key loses the positions.** On mainnet they have value, so the agent key needs an
  invisible recovery, for example an encrypted backup tied to the user's email or passkey.
- **It supersedes ADR `0099`**, where the sponsor only matches the agent's own deposit. Under credits
  the sponsor pays all of it. That fits `docs/12` (« ARP buys the TRUST it spends »), but `0099` needs
  a superseding ADR at the port.

And two already settled the same day:

- The signing page (`/sign`) is **not** needed for this public, because nothing is signed by the
  user. It stays an option for an operator who wants to sign with their own wallet. If it is built,
  it must refuse any chain but 13579, any `to` that is not a known ARP or Intuition contract there,
  and any function off an allow-list. The link carries its plan in the URL fragment (arp-7f).
- The web app stays local for now (user, 2026-11-02).

## 4. Split, once the decisions are taken

| Part | Owner |
| --- | --- |
| Extension: a full build with `arp_declare_used`, the local key (D1), and the skill-through-ARP tool | arp-7f |
| Sponsor: what D2 and D3 need on the service's side | to agree |
| Web: `/register?what=agent` mints on the chain the toggle says, 13579 on testnet. It is still the operator's own path, and it is separate from the extension's | arp-30 |
| This file, the ADRs D1–D3 call for, and STATE | arp-30 |

## 4b. Do not do in this task

- Route non-skill MCP calls through ARP.
- Sponsor anything on mainnet. Every sponsored write here is on 13579, as ADR `0092` says.
- Build a step before its decision is taken.

## 5. Evidence ladder

It puts outside agents on the **staked** rung, paid by the sponsor. A skill served through ARP
attests access, not use, so its declarations are not "proven" by that alone. Whether a sponsored
content receipt counts toward proven is part of D2.

## 6. Progress

**2026-11-02, arp-30.**

- **D3 is running.** The sponsor runs locally on `127.0.0.1:3200`, testnet 13579, treasury
  `0xE596096F4176b682E300d73963e7B04B383C1AA1`. Its balance was 0.00828 tTRUST by `eth_getBalance`
  the same day. No transaction has been sent yet.
- **D2 is built.** ADR `0109`, in `apps/sponsor/src/service.ts`. 45 tests pass, and the typecheck is
  clean over `apps/sponsor/src` and `test`.
- **D1 is written down.** ADR `0110` covers what the key signs and what it never signs. arp-7f builds
  it.
- The route shapes were sent to arp-7f.

Two sponsor routes the path needed. The user decided both on 2026-11-02 (ADR `0110`), and both are **built** the same day: `POST /mint-gas`, `POST /identity`, and `/deposit` creating a missing `uses` triple. 55 sponsor tests pass, and 825 protocol tests:

1. **Gas for the mint.** `/gas` pays only an agent that is already registered. An unregistered
   address has no bound yet: any address can ask.
2. **Creating the agent's identity atom and its first `uses` triple.** `/deposit` refuses a term
   that does not exist, and the service creates no `uses` triple (task 40 §3). Creating one opens
   its first position in the sponsor's name, the way `/publish` already does.

The user's answers: (1) **once per address, under a global daily cap**; (2) **the sponsor creates
them and then deposits the agent's position on them**, « peu importe le créateur, c'est le stake qui
compte … l'agent garde encore une fois les positions ».

**2026-11-02, arp-41 (the extension side, `feat/50-extension`).**

- **Built.** `ARP_TOOLS=desktop` serves the three reads plus `arp_get_skill` and `arp_declare_used`
  (`apps/mcp/src/desktop/`). The key is created on the first call to either tool, in
  `~/.arp/agent-key`, mode 0600. It refuses any call with value, on a chain other than 13579, or to
  a contract other than the registry and the MultiVault (`refusal` in `agent-key.ts`).
  `arp_get_skill` keeps a skill only when its receipt verifies, matches the bytes and names this
  agent as the caller. 5 tests cover the loop against a fake content server and sponsor; 63 pass in
  `apps/mcp`.
- **Walked once on testnet 13579, the user's approval, 2026-11-02**, with a fresh key in a scratch
  home directory, against the local content server (3002) and sponsor (3200). `arp_get_skill`
  served `youtube-thumbnail-design` (atom
  `0x2fe6afa7d8f74680cf48c2052fa11ebf1c91f4f537baa23cb060eaea4de43d00`). `arp_declare_used` took
  26 s. Read back from the chain the same day: agent #9 on the registry is owned by the key's address
  `0x0B02795b004b8DFDeDDd5eccf58228aa321bda17`, and that address holds 990000000000000 shares on curve
  1 of the triple
  `0x2ef4f396f020f59478ba6def933b6d50956784e59b72c261f9ca0e5b08a784ca`.
- **Walked in Claude Desktop itself, by the user, 2026-11-02**, through the `arp-0.2.0.mcpb` package
  on Windows (« tout a marché », as relayed by arp-30). The key was created in `C:\Users\Max\.arp\`.
  Its `agent.json` reads agent #10. `receipts.jsonl` names `youtube-thumbnail-design`, served to
  `0xf14b09ae2B528eFDf0b74d9E572D9842F0479338`. The sponsor's ledger
  (`~/Project/ARP-50/.arp/sponsor-ledger.jsonl`, lines 19–36) records the same address: mint gas,
  five identity sends, the creation of triple `0x48a8ed49…`, the approval gas, and the deposit, all
  `success`.
- **The key signs exact calls only** (task-verifier, first pass). `refusal` used to accept any
  zero-value calldata to the registry or the MultiVault, and the approval's calldata came from the
  sponsor's `/gas` answer. So a wrong sponsor endpoint could get a zero-value `redeem` or an `approve`
  to another address signed. The issue was latent: localhost, testnet. Now the loop builds the two calls
  itself, `register()` and the approval of the sponsor's address, and `refusal` accepts those exactly.
  A test shows a `redeem` and an approval to a stranger refused.
- **The MultiVault comes from the deployment record**, `data/deployments/13579.json`, and the loop
  refuses a sponsor whose `GET /` names another (task-verifier, second pass, non-blocking).
- **Known limit:** waiting for the indexer depends on the sponsor's error text, "no identity atom on
  the graph". If that wording changes, the first declaration fails instead of waiting.
- **Not yet:** a content server online. Both servers are local for now (user, 2026-11-02).
