# 26 — Demo plan: ARP in Claude Desktop and in Claude Code

Written 2026-11-02, at the user's request, to keep for when a demo is needed. Everything here runs
on **Intuition testnet 13579**, where it is free for the person watching. Mainnet waits until
Intuition validates ARP.

Two demos, one per application. They show different things, and the difference is the point of
showing both:

| | Claude Desktop (Chat) | Claude Code |
| --- | --- | --- |
| who it is for | someone who has never touched a terminal | a developer |
| what they install | one file, `arp-0.2.1.mcpb` | the CLI and its plugin, `arp init` |
| what is proven | the skill was **served** to this agent (a signed receipt) | the same, **plus** the runtime's own record that the skill was **invoked** (the hook) |
| what the person signs or pays | nothing | nothing, in the sponsored path |
| ready today | **yes**, walked by the user on 2026-11-02 (agent #10) | **no**: two pieces are missing, §4.1 |

The strongest evidence of an *action* is neither of these. It is a payment the chain records, for
example one agent hiring another (tasks 43 and 44). Neither demo shows that, and neither should
claim it (§5).

---

## 1. What to say, and what not to

Every figure below comes from a committed measurement. Quote it with its file, or leave it out.

**Say:**

- "Without ARP, Claude named a skill or an MCP server that exists in 6 of 42 answers. With ARP, in
  40 of 42. Neither invented one." Source: `data/measurements/discovery-eval-install-2026-11-02-recheck.jsonl`,
  task 52 §3. Scope: 14 needs the catalogue covers, Sonnet, 3 reps.
- "Claude looks in ARP when it needs a tool, and not otherwise": consulted on 13 of 14 prompts that
  needed a tool, 0 of 6 that did not (task 45c).
- "The person signs nothing and pays nothing. ARP's sponsor pays on testnet, and the record is in
  the agent's name."

**Do not say:**

- **"ARP saves tokens."** It does not. A run with ARP used 3.14 times the tokens of answering from
  memory (task 45c), and 5.19 times when asked what to install (task 52).
- **"The skills ARP finds give better results."** The judge preferred the answer without ARP in 26
  of 42 pairs, and it could not install anything to check (task 52 §3).
- **"This proves Claude used the skill."** A receipt proves the skill was served. A hook proves it
  was invoked. Neither proves it did the job (`docs/14`).

---

## 2. Before either demo (about 10 minutes)

Both servers run on the user's machine for now (user, 2026-11-02). When the content server goes
online, steps 1 and 2 disappear for Desktop.

1. **The sponsor**, from `~/Project/ARP-50` or any checkout of `dev`:

   ```
   SPONSOR_KEY_FILE=~/.arp/sponsor.key \
   SPONSOR_DEPOSIT_WEI=… SPONSOR_APPROVAL_GAS_WEI=… \
   SPONSOR_MINT_GAS_WEI=100000000000000 \
   SPONSOR_REGISTRIES=eip155:13579:0xC165A2AD2E540A4069E02834009161E2b4490d5A \
   SPONSOR_CONTENT_SIGNERS=0x8A185081bc77aF234d8Ee1290DA1962E43ae8D4B \
   INTUITION_PIN_API_KEY=… \
   bun run apps/sponsor/src/main.ts
   ```

   The deposit and approval-gas amounts have no default and are the user's to set
   (`apps/sponsor/src/main.ts` header). Check it answers: `curl -s http://127.0.0.1:3200/`, which
   should show `identity: enabled` and a `mintGasWei` that is not `off`.
2. **The content server**, from `~/Project/ARP`:

   ```
   ARP_TARGET=testnet bun run apps/cli/src/cli.ts mcp --http
   ```

   It listens on 3002 and signs receipts with `~/Project/ARP/.arp/receipt-key`, the address the
   sponsor accepts above. Check: `curl -s http://127.0.0.1:3002/`.
3. **The treasury has funds.** It held 5.008 tTRUST on 2026-11-02. A new agent's first declaration
   costs it the mint gas, five identity sends, one triple creation, the approval gas and one
   deposit.
4. **The daily caps.** The sponsor allows 20 new agents a day by default. A rehearsal uses one, so
   do not rehearse twenty times on demo day.

---

## 3. Demo A — Claude Desktop (ready)

**Setup, once:** in Claude Desktop, go to Settings → Extensions, remove any older ARP, and install
`C:\Users\Max\arp-test\arp-0.2.1.mcpb`. To show a *first* run, with a new agent created live,
rename `C:\Users\Max\.arp` to something else beforehand. Otherwise the demo reuses agent #10.

**Script (5 minutes):**

1. Ask: _"Make me a YouTube thumbnail for a video about sourdough bread, with ARP."_
2. Point out the calls as they appear:
   - `arp_find_tools`: Claude searches the registry first, before it searches the web.
   - `arp_get_skill`: it gets `youtube-thumbnail-design`. Its SKILL.md comes back through ARP's
     content server, with a receipt naming this agent.
   - Claude follows the skill.
   - `arp_declare_used`: it records that it used the skill. The first time, this takes about a
     minute (gas, registration, identity, approval, deposit). After that, a few seconds.
3. Show that nothing was asked of the person: no wallet, no signature, no payment.
4. Show the record, for those who want to see it:
   - `C:\Users\Max\.arp\agent.json`: the agent's number and its identity;
   - the sponsor's ledger, `.arp/sponsor-ledger.jsonl` in the sponsor's checkout: one line per step,
     all `success`;
   - the web app, run locally: the agent and its declaration.

**What can go wrong:**

| symptom | cause | fix |
| --- | --- | --- |
| `arp_get_skill` fails at once | the content server is not running | §2 step 2 |
| `arp_declare_used`: "no gas to register (429)" | the day's new-agent cap is used up | wait until 00:00 UTC, or reuse an agent |
| `arp_declare_used`: "the sponsor names MultiVault …" | the sponsor is running against another deployment | restart it from `dev` |
| the first declaration fails after two minutes | the indexer is slow, and the wait reads the sponsor's error text (task 50 §6, known limit) | call `arp_declare_used` again |
| Desktop still shows the old tools | the old version is still installed | remove it, restart Desktop, reinstall |

---

## 4. Demo B — Claude Code (not ready yet)

### 4.1 Two pieces to build first

1. **Install the fetched skill into the project.** Claude Code invokes a skill only when it is in
   `.claude/skills/`. Measured 2026-11-02 with Claude Code 2.1.316: a skill written there during a
   session answers `Unknown skill` in that same session, and is invoked normally in the next one.
   So `arp_get_skill`, when it runs in a project rather than in Desktop, has to write
   `.claude/skills/<name>/SKILL.md`, and the demo runs in two sessions.
2. **Install the sponsored tools in Claude Code.** `arp init` writes `ARP_TARGET=testnet` and serves
   the full tool set, whose declarations are unsigned plans. The sponsored path needs
   `ARP_TOOLS=desktop` in the MCP entry, under a name that says what it does in Claude Code too.

What the hook adds is already built. On `PostToolUse` it writes `.arp/session.jsonl`, the runtime's
own line "this skill was invoked at T", which the model never touches (`apps/hook/src/hook.ts`).
What is not decided is where that line goes. The sponsor's proof is the content receipt alone
(ADR `0109`), so the hook's record stays on the machine. Publishing it next to the declaration
needs a decision of its own.

### 4.2 The script, once those exist (10 minutes)

1. In an empty folder: `git init`, then `arp init --project --yes`, then open Claude Code.
2. **Session 1.** Ask: _"I need YouTube thumbnails for my channel. Find a skill with ARP and set it
   up here."_ Claude calls `arp_find_tools`, then `arp_get_skill`, and the skill lands in
   `.claude/skills/`.
3. **Session 2** (quit, then reopen Claude Code). Ask: _"Make a thumbnail for a video about
   sourdough."_ Claude invokes the skill with its `Skill` tool, and the hook writes the line.
4. Ask Claude to declare what it used. Then show the two records side by side:
   - the receipt in `~/.arp/receipts.jsonl`: "ARP's server served this file to this key at T1";
   - the hook's line in `.arp/session.jsonl`: "the runtime invoked this skill at T2".

   These are two parties that do not share interests, agreeing on the skill and the agent
   (`docs/14`, the table "What we have / What we know").

---

## 5. If someone asks for proof that the work was done

Say plainly what the demos show and what they do not:

- **Desktop** proves access: the skill was served to this agent, under a signature it could not
  forge.
- **Claude Code** adds the runtime's record of the invocation, which is written by a hook and not
  by the model.
- **Proof of an action** is a fact the chain records: a payment from one agent to another, with the
  paid agent's signed receipt (tasks 43 and 44, `ReceiptEnforcer`). It is built, but not wired into
  either demo. It is the next demo to plan if this question keeps coming.
