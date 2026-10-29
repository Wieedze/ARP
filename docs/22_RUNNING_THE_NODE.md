# 22 — Running the node

**Date**: 2026-10-29
**For**: somebody deciding whether to install this beside their agent. Not a contributor — every
claim below points at a file and a line so you can check it rather than believe it.

---

## What it is

One process. It answers questions about tools and agents from a public knowledge graph, it fetches
a skill's file from the repository that publishes it, and it prepares transactions for you to sign
with your own key.

**It is not a service you depend on.** Unplug everything of ours and your agent still runs: the node
is code on your machine, the graph it reads is Intuition's, and the files it fetches come from
GitHub. That property is the whole of ADR `0045` and it is the reason this is installed rather than
hosted.

```
bun run scripts/arp-mcp-server.ts --stdio    # for an MCP client to launch
ARP_TARGET=testnet bun run scripts/arp-mcp-server.ts
```

## The three things that matter before you install anything

**It never signs a transaction.** Not a transfer, not a stake, not a contract call. The two planning
tools return unsigned calls and your runtime signs them with your key, in the order given. There is
no wallet client, no signer parameter and no send path in the package that builds them — ADR `0038`,
and `packages/protocol/src/declare/` is where to check it. The one key the node does hold is below
and it cannot move value.

**It executes nothing it fetches.** A skill's file is Markdown. It is returned with
`content-type: text/plain`, `x-content-type-options: nosniff` and
`content-disposition: attachment`, never rendered, never parsed, never written to disk by the node
(`scripts/arp-content.ts`, the response at the end of `serveContentRequest`). Your agent reads it;
the node does not.

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
.arp/receipts.jsonl    what you fetched through a node, and the receipts
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

> `Bun.serve` binds **every interface** when it is given no hostname. So an installed node listened
> on the local network, and anything that could reach the port could ask it to fetch
> `http://127.0.0.1:…/admin` or `http://169.254.169.254/latest/meta-data/` and read the answer. An
> open proxy into the operator's own machine, by accident, in two unrelated correct decisions.

Both halves are fixed, 2026-10-29:

- **The node binds `127.0.0.1` by default.** `ARP_HOST=0.0.0.0` opens it, for somebody who meant
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
does not let you do. So it is a guard against the easy case and not a boundary. If your machine has
something on loopback you would not want a caller to reach, do not open `ARP_HOST`.

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

**Do not believe that, and do not believe a `grep` I hand you either.** Run the enumeration:

```
bun run scripts/measure/node-outbound.ts
```

It reads the six modules a running node actually loads and prints every host literal with its line,
every `fetch` call site, and whether any host is ours. On 2026-10-29,
`measurements/node-outbound-2026-10-29.json`: **6 host literals, 7 fetch call sites, 0 of the hosts
ours.** It exits non-zero if that last number is ever not zero.

This is a script rather than a sentence because the sentence was **wrong twice**. One draft said
four hosts and "the only literals in the code"; the next said six literals and offered a grep over
`scripts/` that returns 116 lines across 31 hosts, because its scope was a directory and the claim's
scope was three files. Different sentences, identical failure — a security claim offered with a
check whose scope does not match it. The script's scope is a named list, which is the one thing it
cannot check for itself, and it says so.

Three things it shows that a count alone would hide:

- Two of the six literals (`localhost:`, `stdio`) are in **log lines** and fetched by nobody, and
  `github.com` is in the probe's **user-agent**, which identifies the node and sends nothing. Three
  of the six are destinations.
- The Intuition graph and RPC are **absent from the literals and present in the node** — they come
  from `deployments/<chainId>.json` at startup. Absence from a literal list is not absence from the
  node, which is the trap a literal count sets.
- `fetchCallSites` is deliberately **over-inclusive**: a definition and the stdio loop calling the
  node's own handler are in it. A site it lists and should not is a reader's minute; a site it
  misses is the claim being false.

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
ARP_DOMAIN_ATTESTOR    whose domain tags to read. A property of the node, never a request parameter
GITHUB_TOKEN           optional. Raises GitHub's 60-requests-an-hour limit on file listings
ARP_RECEIPT_KEY        a key you manage, instead of the generated one. Never a funded one
ARP_NO_RECEIPTS        set to 1 to run with no key at all
ARP_ACCEPTED_SIGNERS   comma-separated. Which receipt signers THIS node's reader accepts
ARP_CHAIN_ID           which chain's catalogue scripts/session-log.ts reads
ARP_SESSION_LOG        where the hook writes. Default .arp/session.jsonl
ARP_RECEIPTS           where fetches are recorded. Default .arp/receipts.jsonl
```

`GITHUB_TOKEN` is the only one that is a credential, it is read server-side only, and it is sent to
`api.github.com` and nowhere else. It needs **no scopes** — public repository listings are public.
Give it none.

## The key, and what losing it would cost you

The node generates `.arp/receipt-key` on first run so you have nothing to configure. It signs one
thing: a **content receipt**, an EIP-712 statement that this node served these exact bytes to this
caller at this time.

```
it is not a wallet              it holds no funds and no token
it is not an identity           your ERC-8004 identity is yours and is not this
it cannot sign a transaction    it signs EIP-712 structs, and the only struct it is handed
                                is a receipt (packages/protocol/src/receipt.ts)
it cannot move value            ADR 0080 constraint 3, and the plan path has no key at all
```

**If somebody steals it**, they can forge receipts in this node's name. They cannot spend anything.
A reader who stops accepting that signer is back to the declaration they already had — which is the
property that makes a receipt able only to _add_. Delete the file and restart to rotate; the node
publishes its current signer at `GET /` so anyone can see which key they are being offered.

`ARP_NO_RECEIPTS=1` runs with no key. The content route still serves bytes; what you lose is the
corroboration.

**`ARP_RECEIPT_KEY` is your own risk and the code cannot check it.** Nothing here can tell a funded
key from an empty one — that would need a balance read on every chain it might hold value on — so
it warns on stderr and carries on. Do not hand this process a key that holds funds. ADR `0080`
constraint 3 is a convention the code states and does not enforce, and an earlier draft of this
document said it did.

## What a receipt proves, and what it does not

**Access, not use.** It says the bytes left this node and reached that caller. Whether they changed
what the agent did is not observable by anything, and no mechanism here pretends otherwise.
`docs/14` is the long version.

And the part worth knowing before you put weight on one: **a receipt signed by a node you run
yourself is your own word in a second place.** One hand holds both keys. That is not a defect — it
pins the bytes, so you can re-derive what your agent actually held — but it is not corroboration to
a stranger.

**And nothing in the receipt can tell the two apart.** Your node generates its own key, so its
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
tool has a different recorded id on each chain, and `catalogue/skills-<chainId>.json` is the record
for one of them.

Today only 13579 has one. `ARP_TARGET` still defaults to **mainnet**, so a default-run node holds
**zero** catalogued skills and says so at `GET /` — `catalogued_skills: 0` — and refuses a testnet
atom id with the reason rather than serving it. Point it at testnet to use the content path:

```
ARP_TARGET=testnet bun run scripts/arp-mcp-server.ts
```

That mattered more than it looks. Before this was per-chain, the catalogue was imported at module
scope from the 13579 file while the chain was configurable, so a default node served testnet atom
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
(`measurements/skill-layouts-2026-10-29T2200.json`), it is re-derivable with one listing request,
and it is the node telling you the truth rather than failing.

**A listing it could not read is not an empty repository.** If GitHub rate-limits us the node
throws rather than answering `absent`, because serving `absent` off our own quota would publish a
claim about somebody's repository on the strength of our limits.

## What this does not protect you from

Stated because a security note that lists only its strengths is marketing.

- **The skill's content.** A `SKILL.md` is instructions for a language model, written by a stranger.
  The node proves which bytes you got; it says nothing about whether those bytes are safe to follow.
  That is prompt injection and it is the real risk in this whole area. Read what you install.
- **The catalogue's judgement.** 662 skills are listed because they crossed an install-count
  threshold on skills.sh (`measurements/catalogue-sources-2026-10-28.json`). That is a popularity
  figure, it is somebody else's number, and ARP publishes no score (ADR `0046`). A listing is not a
  recommendation.
- **A dishonest declaration.** An agent can declare a use it did not make. It costs the price of the
  claim and earns a reputation on a tool it never used, which is worth nothing when somebody picks
  an agent by that reputation — but nothing here prevents it. What the graph gives a reader instead
  is **who** declared, how many distinct addresses, and whether the declarer and the tool share one.
- **Your own key.** The planners hand you unsigned calls with a `why` on each one. Read them. A plan
  you cannot explain to yourself is a plan to refuse.
- **A caller you let reach the port.** The node answers whoever can talk to it, and it has no
  authentication. On loopback that is the processes on your machine, which is the intended
  deployment. Open `ARP_HOST` and it is whoever can route to you.

## If you want to verify all of this rather than read it

```
bun run scripts/verify-content-route.ts    # against a running node
```

It fetches a real skill, recovers the receipt's signer, re-hashes the bytes that arrived, and prints
whether each refusal is distinguishable. It exists because the unit tests inject every piece of IO
and so cannot see the one property that matters most — that a third party can re-derive the digest
with their own tools.
