# 22 — Running the MCP server, the node and the hook

**Date**: 2026-10-29. Split by program 2026-10-30 (ADR `0082`).
**For**: somebody deciding whether to install this beside their agent. Not a contributor — every
claim below points at a file and a line so you can check it rather than believe it.

---

## Three programs, installed separately

This document used to call the MCP server "the node". There are three programs, and they do not
share a trust surface, so each is described on its own and you install only the one you need.

|                | the MCP server — `apps/mcp`                           | the node — `apps/node`                                | the hook — `apps/hook`           |
| -------------- | ----------------------------------------------------- | ----------------------------------------------------- | -------------------------------- |
| launched by    | your MCP client, over stdio                           | you, as a server                                      | your runtime, on every tool call |
| reachable from | your machine (`127.0.0.1`)                            | **every interface** — it is the address you publish   | nowhere; it reads stdin          |
| key            | `.arp/receipt-key`, generated, signs content receipts | your agent's `AGENT_PRIVATE_KEY`, signs hire receipts | none                             |
| network        | the graph, the RPC, GitHub — counted below            | the RPC only                                          | none                             |

Sections up to "If you want to verify" are about the **MCP server**. The node and the hook have a
section each after it.

## What the MCP server is

One process. It answers questions about tools and agents from a public knowledge graph, it fetches
a skill's file from the repository that publishes it, and it prepares transactions for you to sign
with your own key.

**It is not a service you depend on.** Unplug everything of ours and your agent still runs: the server
is code on your machine, the graph it reads is Intuition's, and the files it fetches come from
GitHub. That property is the whole of ADR `0045` and it is the reason this is installed rather than
hosted.

```
bun run apps/mcp/src/server.ts --stdio    # for an MCP client to launch
ARP_TARGET=testnet bun run apps/mcp/src/server.ts
apps/mcp/dist/arp-server.js --stdio       # the same, as one file: cd apps/mcp && bun run build
arp mcp                                   # the same under Node 22: @arp-protocol/cli (apps/cli)
```

`@arp-protocol/cli` holds the three programs behind one `arp` binary and runs on Node 22 without
Bun (ADR `0089`). It is built and checked (`cd apps/cli && bun run check:node`) but **not yet
published**, so `arp` means `node apps/cli/dist/cli.js` until it is.

## The three things that matter before you install anything

**It never signs a transaction.** Not a transfer, not a stake, not a contract call. The two planning
tools return unsigned calls and your runtime signs them with your key, in the order given. There is
no wallet client, no signer parameter and no send path in the package that builds them — ADR `0038`,
and `packages/protocol/src/declare/` is where to check it. The one key the server does hold is below
and it cannot move value.

**It executes nothing it fetches.** A skill's file is Markdown. It is returned with
`content-type: text/plain`, `x-content-type-options: nosniff` and
`content-disposition: attachment`, never rendered, never parsed, never written to disk by the server
(`apps/mcp/src/content.ts`, the response at the end of `serveContentRequest`). Your agent reads it;
the server does not.

**It cannot be made to fetch somewhere else.** This is the one that would matter most if it were
wrong, so it is worth stating precisely. The only input to the content route is an atom id. That is
looked up in a catalogue shipped in this repository, which yields a URL; the URL yields
`owner/repo`; the path comes from the repository's own file listing. **No part of the request
reaches the outbound URL.** `packages/protocol/test/content-serve.test.ts` has a test called
"never lets the request choose where the fetch goes" that asserts the single URL fetched.

## Every file it creates

```
.arp/receipt-key       the signing key. Generated on first run, mode 0600
.arp/session.jsonl     what the hook recorded, if you wired the hook
.arp/receipts.jsonl    what you fetched through a server, and the receipts
.arp/skills/<name>/SKILL.md   files you fetched, if you used arp-fetch-skill.ts
```

That is all of it, and `.arp/` is in `.gitignore`. Nothing is written outside the working directory.
Nothing is written to your home directory, your shell profile, your git config or any system path.

## Every outbound connection

Five fixed hosts, the first two configurable:

```
the Intuition graph    reads. Set by ARP_TARGET, or INTUITION_GRAPHQL_URL
the Intuition RPC      reads. Set by ARP_TARGET, or INTUITION_RPC_URL
api.github.com         one file listing per repository, cached ten minutes
raw.githubusercontent.com   the skill's own bytes, passed through, never cached
ipfs.io                an agent's registration document, when it published an `ipfs://` one
```

**And two that are not fixed, which you should know about before you install this.** Both exist for
the same reason and ADR `0045` is explicit about it: ARP can **verify** another agent's endpoint and
cannot **provide** one. Verifying means connecting to a host somebody else chose.

```
arp_probe_endpoint     fetches a URL the caller passes directly
arp_agent_endpoints    fetches the `registrationFile` out of an ERC-8004 `tokenURI` — read from
                       a registry whose ADDRESS the caller supplies, so the URL is reachable
                       through two hops rather than one
```

Both now refuse a private target. The second one did not until this document was written: naming
every outbound connection is what found it, which is the argument for writing such a section at
all.

An earlier draft of this document said there were four hosts, that the probe was the only unfixed
fetch, and that the four were "the only literals in the code" — a sentence that invited the grep
that disproves it. All three were wrong. The first version of this section is also what changed the
code:

> `Bun.serve` binds **every interface** when it is given no hostname. So an installed server listened
> on the local network, and anything that could reach the port could ask it to fetch
> `http://127.0.0.1:…/admin` or `http://169.254.169.254/latest/meta-data/` and read the answer. An
> open proxy into the operator's own machine, by accident, in two unrelated correct decisions.

Both halves are fixed, 2026-10-29:

- **The server binds `127.0.0.1` by default.** `ARP_HOST=0.0.0.0` opens it, for somebody who meant
  to. The startup line says which, every time.
- **Both caller-steerable fetches refuse a private target.** Loopback, `10/8`, `172.16/12`,
  `192.168/16`, `169.254/16`, `0/8`, IPv6 loopback and unique-local, `localhost`, `.internal`,
  `.local`. `ARP_ALLOW_PRIVATE_PROBE=1` if you are probing your own rig. The guard is
  `privateProbeTarget` in `packages/protocol/src/verify/probe.ts` and its boundaries are tested:
  `172.15` and `172.32` are public and only `172.16`–`172.31` are not, and `10.example.com` is a
  real host that an earlier version of the guard refused.

**What that guard does not cover, said plainly.** A hostname that _resolves_ to a private address —
`example.com` pointing at `127.0.0.1`, or DNS rebinding between the check and the connection — gets
through. Closing it needs resolving the name and connecting to the resolved address, which `fetch`
does not let you do. So it is a guard against the easy case and not a boundary.

**A redirect was the other way through, and it needed no DNS at all.** `fetch` follows redirects by
itself, so a caller-controlled **public** host answering
`302 Location: http://169.254.169.254/latest/meta-data/` got the private body back. Measured
2026-10-29, with a local stand-in: the body came through, and nothing in the first-hop check could
have stopped it. **A guard on hop one is not a guard.**

```
arp_agent_endpoints    fixed. Redirects are followed by hand, every hop through the same
                       check, at most three hops
arp_probe_endpoint     NOT fixed, and this is the one thing in this document that is a
                       known open hole rather than a stated limit
```

The probe is left for a reason rather than an oversight: a refused redirect has to **mean**
something in its `live` / `dead` / `inconclusive` vocabulary, and that vocabulary is deliberate —
"a timeout is an answer about the agent, a TLS or DNS failure is not, because it could equally be
us". Deciding what a refused redirect is needs its own decision record, and it is in `FUTURE.md`.

**And "do not open `ARP_HOST`" does not cover the registration route.** That advice bounds a caller
who has to reach you over the network; `arp_agent_endpoints` is called by a process on your own
machine by design. The chain is the one named at the bottom of this document: a stranger's
`SKILL.md` telling your agent to call it with an attacker's registry. That is why that route is
fixed in code and not merely disclosed.

**And what it covers better than that caveat suggests**, because a caveat that undersells is a wrong
claim too: `http://2130706433/`, `http://127.1/` and `http://0177.0.0.1/` are all refused — `URL`
normalises those shorthands to a dotted quad before the guard sees them — and so is
`http://[::ffff:127.0.0.1]/`, an IPv4-mapped IPv6 address, which **passed until 2026-10-29**. It
arrives as `::ffff:7f00:1` in hex groups rather than the dotted form it was written in, so the first
version of the unwrap matched nothing; its own test caught that. All four are asserted in
`packages/protocol/test/probe-private.test.ts`.

**A scheme other than http, https or ipfs is refused outright.** That is separate from the address
check and it was missing until the same day: `file:///etc/passwd` walked through the private-address
guard and Bun's `fetch` read it — 200, and the file's contents handed back to the caller. The
registration path was the exposed one, because `privateProbeTarget` assigns the scheme check to its
caller and that caller did not do it. `fetchableDocumentUrl` is now both halves in one place with
the tests, and `ARP_ALLOW_PRIVATE_PROBE` is about addresses only — it is not a licence to read the
disk.

**Nothing is sent to us.** No telemetry, no analytics, no phone-home, no reporting endpoint.

**Do not believe that, and do not believe a `grep` I hand you either.** Run the enumeration — and
read what it does **not** cover first: a viem `http()` transport opens a connection that is neither
a host literal nor a `fetch` call, which is how the Intuition RPC reaches the network. It is named
twice above as a configurable fixed host and it will not appear in the script's output.

```
bun run scripts/measure/node-outbound.ts
```

It reads the six modules a running server actually loads and prints every host literal with its line,
every `fetch` call site **labelled `outbound`, `inbound` or `definition`**, and whether any host is
ours. On 2026-10-30, after the move to `apps/mcp` and `packages/graphql`,
`data/measurements/node-outbound-2026-10-30T0220.json`: **6 host literals, 9 call sites of which 6 are
outbound, 0 of the hosts ours** — the same figures as the 2026-10-29 run, at new paths. (The
script keeps its old name. `node-outbound-2026-10-30.json`, from the same day, has the same
figures, and its prose still calls the MCP server "the node".) It exits non-zero if that last number is ever not
zero.

The six outbound ones are the whole of it: two on the registration route (the document and a
redirect hop), two on the content route (a repository listing and the skill's bytes), the probe's,
and the shared transport every graph read funnels through.

This is a script rather than a sentence because the sentence was **wrong twice**. One draft said
four hosts and "the only literals in the code"; the next said six literals and offered a grep over
`scripts/` that returns 116 lines across 31 hosts, because its scope was a directory and the claim's
scope was three files. Different sentences, identical failure — a security claim offered with a
check whose scope does not match it. The script's scope is a named list, which is the one thing it
cannot check for itself, and it says so.

Three things it shows that a count alone would hide:

- Two of the six literals (`localhost:`, `stdio`) are in **log lines** and fetched by nobody, and
  `github.com` is in the probe's **user-agent**, which identifies the server and sends nothing. Three
  of the six are destinations.
- The Intuition graph and RPC are **absent from the literals and present in the server** — they come
  from `data/deployments/<chainId>.json` at startup. Absence from a literal list is not absence from the
  server, which is the trap a literal count sets.
- `fetchCallSites` is deliberately **over-inclusive and labelled**: a definition and the stdio
  loop's call to the server's own inbound handler are in it, marked as such. A site it lists and
  should not is a reader's minute; a site it misses is the claim being false. The labels exist
  because an over-inclusive count with no labels cannot be compared against anything — and the
  first version of the classifier called that self-dispatch `outbound`, which is the over-count
  the labels were added to make visible.

## Every environment variable it reads

```
PORT                   which port to listen on. Default 3002
ARP_HOST               which interface. Default 127.0.0.1 — loopback only
ARP_ALLOW_PRIVATE_PROBE  set to 1 to let the probe reach a private address
ARP_TARGET             testnet | mainnet. Picks the chain, the graph and the RPC
ARP_TRANSPORT          stdio, for an MCP client
INTUITION_GRAPHQL_URL  override the graph
INTUITION_RPC_URL      override the RPC
ARP_MULTI_VAULT        override the contract address
ARP_DOMAIN_ATTESTOR    whose domain tags to read. A property of the server, never a request parameter
GITHUB_TOKEN           optional. Raises GitHub's 60-requests-an-hour limit on file listings
ARP_RECEIPT_KEY        a key you manage, instead of the generated one. Never a funded one
ARP_NO_RECEIPTS        set to 1 to run with no key at all
ARP_ACCEPTED_SIGNERS   comma-separated. Which receipt signers THIS server's reader accepts
ARP_CHAIN_ID           which chain's catalogue apps/mcp/src/session-log.ts reads
ARP_SESSION_LOG        where the hook writes. Default .arp/session.jsonl
ARP_RECEIPTS           where fetches are recorded. Default .arp/receipts.jsonl
ARP_ACTIVITY_DIR       session-log.ts --serve only: the directory it tails. Default .arp
ARP_ACTIVITY_PORT      session-log.ts --serve only: its port. Default 3003, on 127.0.0.1
ARP_ACTIVITY_ORIGINS   session-log.ts --serve only: comma-separated origins added to the CORS list
```

`GITHUB_TOKEN` is the only one that is a credential, it is read server-side only, and it is sent to
`api.github.com` and nowhere else. It needs **no scopes** — public repository listings are public.
Give it none.

**`session-log.ts --serve` opens a second listener**, and only when asked: the activity feed the web
app's activity bar reads (ADR `0091`). It binds `127.0.0.1:3003`, reads `.arp/session.jsonl`,
`receipts.jsonl` and `sent.jsonl`, and writes nothing. It makes no outbound connection. CORS
answers only for the web app's origins (Vite's ports on `localhost` and `127.0.0.1`, plus
`ARP_ACTIVITY_ORIGINS`). A request whose `Host` is not `127.0.0.1:<port>` or `localhost:<port>`
gets 403, which is what stops a DNS-rebinding page that CORS alone would let through. What it
serves is your agent's record: skill and MCP names, receipts, transaction hashes, the signer's
address. Run it only while you want a browser to see that.

## The key, and what losing it would cost you

The server generates `.arp/receipt-key` on first run so you have nothing to configure. It signs one
thing: a **content receipt**, an EIP-712 statement that this server served these exact bytes to this
caller at this time.

```
it is not a wallet              it holds no funds and no token
it is not an identity           your ERC-8004 identity is yours and is not this
it cannot sign a transaction    it signs EIP-712 structs, and the only struct it is handed
                                is a receipt (packages/protocol/src/receipt.ts)
it cannot move value            ADR 0080 constraint 3, and the plan path has no key at all
```

**If somebody steals it**, they can forge receipts in this server's name. They cannot spend anything.
A reader who stops accepting that signer is back to the declaration they already had — which is the
property that makes a receipt able only to _add_. Delete the file and restart to rotate; the server
publishes its current signer at `GET /` so anyone can see which key they are being offered.

`ARP_NO_RECEIPTS=1` runs with no key. The content route still serves bytes; what you lose is the
corroboration.

**`ARP_RECEIPT_KEY` is your own risk and the code cannot check it.** Nothing here can tell a funded
key from an empty one — that would need a balance read on every chain it might hold value on — so
it warns on stderr and carries on. Do not hand this process a key that holds funds. ADR `0080`
constraint 3 is a convention the code states and does not enforce, and an earlier draft of this
document said it did.

## What a receipt proves, and what it does not

**Access, not use.** It says the bytes left this server and reached that caller. Whether they changed
what the agent did is not observable by anything, and no mechanism here pretends otherwise.
`docs/14` is the long version.

And the part worth knowing before you put weight on one: **a receipt signed by a server you run
yourself is your own word in a second place.** One hand holds both keys. That is not a defect — it
pins the bytes, so you can re-derive what your agent actually held — but it is not corroboration to
a stranger.

**And nothing in the receipt can tell the two apart.** Your server generates its own key, so its
address differs from your agent's while you hold both. A reader therefore has to say which signers
it accepts — `ARP_ACCEPTED_SIGNERS`, and **empty is the default**, which makes an unrecognised
signer read as `unknown-signer`: not corroborated, not dismissed. `corroborationOf` in
`packages/protocol/src/receipt.ts` is that comparison and it reports rather than refuses (ADR
`0080`). Its first version called every locally-served receipt a second party, which was the
strongest verdict for the weakest case.

Anyone can check a receipt without asking us anything:

```
sha256sum SKILL.md          # compare to the digest in the receipt
```

That is why the digest is sha256 and not keccak256. The signature half is
`verifyContentReceipt`, and the path the receipt names is the path to re-fetch.

## It only knows the chain it is pointed at

The catalogue is a **per-chain record**: an atom id is a pure function of a tool's URL, so the same
tool has a different recorded id on each chain, and `data/catalogue/skills-<chainId>.json` is the record
for one of them.

Today only 13579 has one. `ARP_TARGET` still defaults to **mainnet**, so a default-run server holds
**zero** catalogued skills and says so at `GET /` — `catalogued_skills: 0` — and refuses a testnet
atom id with the reason rather than serving it. Point it at testnet to use the content path:

```
ARP_TARGET=testnet bun run apps/mcp/src/server.ts
```

That mattered more than it looks. Before this was per-chain, the catalogue was imported at module
scope from the 13579 file while the chain was configurable, so a default server served testnet atom
ids and stamped **1155** into every receipt's domain — for atoms that do not exist there, and where
a create pair costs 0.22 TRUST against 0.004. Measured 2026-10-29.

## What it refuses, so you can tell a bug from an answer

Eight refusals, each with its own status and sentence. Three of them are facts about the world and
not failures:

```
404 unknown-atom    not a catalogued tool
404 not-a-file      catalogued, but there is no file — every MCP server is this
404 absent          the repository has no such skill at HEAD. 139 of 662 are here
409 ambiguous       several paths, contents differ. 2 of 662. It refuses rather than pick
400 bad-atom-id     not 0x + 64 hex
413 too-large       over the 1 MiB cap
502 upstream        the origin answered something else
500 unsafe-path     the listing named a path outside the repository
```

`absent` is worth a sentence: 139 of the 662 catalogued skills no longer have a file in the
repository the catalogue points at. That is a measurement
(`data/measurements/skill-layouts-2026-10-29T2200.json`), it is re-derivable with one listing request,
and it is the server telling you the truth rather than failing.

**A listing it could not read is not an empty repository.** If GitHub rate-limits us the server
throws rather than answering `absent`, because serving `absent` off our own quota would publish a
claim about somebody's repository on the strength of our limits.

## What this does not protect you from

Stated because a security note that lists only its strengths is marketing.

- **The skill's content.** A `SKILL.md` is instructions for a language model, written by a stranger.
  The server proves which bytes you got; it says nothing about whether those bytes are safe to follow.
  That is prompt injection and it is the real risk in this whole area. Read what you install.
- **The catalogue's judgement.** 662 skills are listed because they crossed an install-count
  threshold on skills.sh (`data/measurements/catalogue-sources-2026-10-28.json`). That is a popularity
  figure, it is somebody else's number, and ARP publishes no score (ADR `0046`). A listing is not a
  recommendation.
- **A dishonest declaration.** An agent can declare a use it did not make. It costs the price of the
  claim and earns a reputation on a tool it never used, which is worth nothing when somebody picks
  an agent by that reputation — but nothing here prevents it. What the graph gives a reader instead
  is **who** declared, how many distinct addresses, and whether the declarer and the tool share one.
- **Your own key.** The planners hand you unsigned calls with a `why` on each one. Read them. A plan
  you cannot explain to yourself is a plan to refuse.
- **A caller you let reach the port.** The server answers whoever can talk to it, and it has no
  authentication. On loopback that is the processes on your machine, which is the intended
  deployment. Open `ARP_HOST` and it is whoever can route to you.

## If you want to verify all of this rather than read it

```
bun run scripts/verify/verify-content-route.ts    # against a running server
```

It fetches a real skill, recovers the receipt's signer, re-hashes the bytes that arrived, and prints
whether each refusal is distinguishable. It exists because the unit tests inject every piece of IO
and so cannot see the one property that matters most — that a third party can re-derive the digest
with their own tools.

## The node — `apps/node`

```
AGENT_PRIVATE_KEY=… AGENT_REGISTRY=eip155:13579:0xC165… AGENT_ID=2 \
  AGENT_NODE_PORT=3100 bun run apps/node/src/node.ts
curl -s localhost:3100/healthz
```

| variable                        | default                    | what it is                                                            |
| ------------------------------- | -------------------------- | --------------------------------------------------------------------- |
| `AGENT_PRIVATE_KEY`             | required                   | the agent's key; signs hire receipts, never a transaction             |
| `INTUITION_RPC_URL`             | required                   | the chain payments are read on — also the receipt's `chainId`         |
| `AGENT_REGISTRY` + `AGENT_ID`   | both unset                 | the agent as its ERC-8004 registration file names it; both or neither |
| `AGENT_NODE_MIN_BUDGET`         | `0.001`                    | the smallest payment accepted, in the chain's native unit             |
| `AGENT_NODE_LEDGER`             | `.arp/node-payments.jsonl` | every payment already used, one line each                             |
| `AGENT_NODE_MAX_BODY_BYTES`     | `65536`                    | larger bodies are a `413`                                             |
| `AGENT_NODE_HANDLER_TIMEOUT_MS` | `60000`                    | a slower handler is a `504`, and the payment is released              |
| `AGENT_NODE_RATE_LIMIT`         | `30`                       | `POST /task` per client IP per minute, paid or not; then `429`        |

What makes an agent reachable: it listens at the address the agent publishes in its ERC-8004
registration file, checks on chain that the requester paid it before doing any work, and returns a
receipt signed with the agent's key (ADR `0045`, format ADR `0083`). The work itself is yours — `ARP_NODE_HANDLER`
names a module exporting `handle(payload, context)`; without one it echoes.

**It signs receipts and never transactions.** The key is the agent's because a hire receipt must be
signed by the agent, and a signature is not a spend. Its only outbound connection is the RPC it
reads the payment from, it loads one module you name, and it writes one file — the ledger below:

```
grep -nE "createPublicClient\(|writeFile|appendFile|mkdir|import\(|async fetch\(" apps/node/src/node.ts apps/node/src/task.ts
```

prints six lines on 2026-10-30: the `node:fs` import, the ledger's `mkdirSync` and `appendFileSync`
(`task.ts:6`, `:85`, `:86`), the server's own inbound `fetch(request)` handler (`task.ts:246`), your
handler's import (`node.ts:112`) and the RPC client (`node.ts:120`).

**It binds every interface**, unlike the MCP server, because being reached is its job:
`serveFetch({ port, maxBodyBytes })` in `main()` at `apps/node/src/node.ts:142` passes no hostname,
and `node:http` then listens on every interface.

**One payment buys one job.** Before any work the node checks that the payment is mined and did
not revert, was sent to this agent, came from the declared requester and paid at least
`AGENT_NODE_MIN_BUDGET` — and that it has not been used before. Every accepted payment is appended
to `AGENT_NODE_LEDGER` (`.arp/node-payments.jsonl` in the working directory by default), read back
at start, and a second presentation is a `409`. A payment whose handler failed is released, so the
requester can retry with it.

Until 2026-10-30 there was no ledger: on testnet 13579 one 0.001 payment (`0xf3649dbe…`) was
presented twice and served twice. After the fix the same payment against the built node answered
`200`, then `409`, then `409` again after a restart. **The ledger starts empty**, so a payment a
node accepted before it existed is accepted once more; and deleting the file forgets every payment
in it. Keep it where the node's state lives.

**The receipt is EIP-712, and a stranger checks it in three steps** (ADR `0083`). The node answers
`{ result, receipt: { format: "eip712", receipt, chainId, agent, signature } }`, where `receipt`
names the agent's ERC-8004 identity, the requester, the payment, the amount, the hashes of the
payload and of the result, and the time. The domain is `{ name: "ARP Hire Receipt", version: "1",
chainId }`, with the payment's chain. The layout follows x402's signed receipt and ERC-8004's
identity string.

1. `verifyHireReceipt(receipt)` (`@arp-protocol/core`) recovers the signer.
2. `getAgentWallet(agentId)` on the registry `agentRegistry` names should be that signer — on
   2026-10-30, testnet 13579, agent 2's wallet was `0x9C985BEF…` and so was the recovered key.
3. `getTransaction(payment)` on `chainId` should show `requester` paying the agent `paid`, and
   `hireReceiptMatches(receipt, payload, result)` should hold for the JSON you sent and received.

The hashes are keccak256 over RFC 8785 canonical JSON, so step 3 needs no library of ours.

## The hook — `apps/hook`

```
cd apps/hook && bun run build      # once: writes apps/hook/dist/arp-hook.js
```

`arp init` writes this for you (`@arp-protocol/cli`, `apps/cli`): it copies the hook to
`~/.arp/bin/hook.js`, registers it on both events, and backs up `settings.json` first. `arp
uninstall` takes it out again. By hand, it is:

<!-- prettier-ignore -->
```jsonc
// your runtime's .claude/settings.json — the path is absolute, because the hook runs in your
// project and not in this one
{"hooks": {
  "PostToolUse": [{"matcher": "*", "hooks": [
    {"type": "command", "command": "bun /path/to/ARP/apps/hook/dist/arp-hook.js", "async": true}
  ]}],
  "PostToolUseFailure": [{"matcher": "*", "hooks": [
    {"type": "command", "command": "bun /path/to/ARP/apps/hook/dist/arp-hook.js", "async": true}
  ]}]
}}
```

Both events, because a failed call reaches only `PostToolUseFailure`. Grok Build reads this same
file and sends camelCase keys, which the hook also reads (`apps/hook/src/payload.ts`).

It fires on every tool call and appends one line to `.arp/session.jsonl` (or `ARP_SESSION_LOG`)
for a skill or an MCP call, and nothing for anything else. It reads `.arp/receipts.jsonl` (or
`ARP_RECEIPTS`) to name the atom of a skill you fetched through an MCP server, and your MCP
configuration (`~/.claude.json`, `.mcp.json`) to name an MCP server by its URL or its npm or PyPI
page. A script, a local path or localhost names nothing. **A configured URL can hold a key**, so
the hook drops its query, fragment and `user:pass@`, and keeps only the origin when a path segment
looks like a token (long, letters and digits mixed). The first time it creates `.arp/` it writes
`.arp/.gitignore` containing `*`, so your repository does not commit the log by accident.

Per call it writes the call id, an outcome (`ok`, `tool_error`, `auth`, `timeout`, `unreachable`,
`payment`), at most a status code such as `401`, the duration the runtime measured, and **the size
of the response, never its content, its arguments or the error's text**. A response can hold a key
or a file, and this log later feeds a declaration. A call you cancel is not written.

It makes no network call. The bundle carries host literals from protocol constants it never calls;
the call sites are what matter, and there are none:

```
cd apps/hook && bun run build && grep -cE "fetch\(|createPublicClient\(" dist/arp-hook.js
```

prints `0` on 2026-10-30. A payload it cannot parse exits `0` and writes nothing, so a hook never
blocks the tool call it is watching.
