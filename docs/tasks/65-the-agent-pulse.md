# Task 65 — The agent pulse: the same walk for agents, with a second party

**Status:** verified 2026-11-05 on `feat/agent-pulse`, `task-verifier` PASS, post-mortem `.claude/learning/60-the-agent-pulse.md`. The last `intuition-integrator` round did not cover the known-registry check in `atomIsCanonicalFor`, which has unit and handler tests. No attack was run on chain. A trial, by the user's « oui vazy et prend des notes de tout ça ».
**Depends on:** task 63 (the pulse), ADR `0135` (a domain and an outcome on a declaration), ADR `0095` (the install handshake), ADR `0101` (the hire receipt v2).
**Rules:** `code.md`, `portability.md`, `claims.md`, `workflow.md`, `security.md`.

---

## 1. The idea, in the user's words

« on pourrait imaginer la même chose pour les agents 8004 et tout autre agent joignable par le node avec une connexion au plug-in, comme prévu avec une
double vérif : la preuve de requête vers le node, le node donne l'adresse joignable, la preuve d'accès reçue après avoir été joint par un agent, et la preuve
on chain avec le dépôt sémantique avec contexte et profondeur » (spelling corrected).

What it adds to the skills: a skill cannot say it was used, while a hired agent has to answer and sign. `docs/14`'s amendment of 2026-10-29 says why that matters: an
agent cannot put words in the mouth of something it had to ask.

## 2. What already exists, read before this trial and not yet run together

| The user's proof | What exists | What was missing when this was written |
| --- | --- | --- |
| The address | `arp init --node`, `createHandshakeVerifier`, `prepareEndpointBinding`, `getAgentEndpoints`: the owner and the node key both sign, and anyone can re-check against the registry | No directory is hosted. `arp_agent_endpoints` reads the registration file and not the binding. A quick tunnel's address changes on every start |
| The access | `apps/node`, the hire receipt v2: paid by X, asked Y, answered Z, signed by the hired node, naming a term | It requires a payment. Nothing puts it where a third party can find it |
| The deposit | `arp_declare_used` with `domain` and `outcome` | Categories sit under `tool`. Not tried on an agent. `findDeclaredTools` keeps only `?skill=` URLs, so a line about an agent does not reach `arp_pulse` |

Three reservations, stated before the trial:

1. **The address is not proof of a request.** It says this address belongs to this agent. That somebody asked for it is known only to whoever answered, and an agent can skip the directory.
2. **Both sides can be one person.** Hiring yourself returns your own payment, for gas. A receipt shows that two keys talked and not that they are independent. A score that counts receipts has to answer this.
3. **Without a node there is no double proof.** An ordinary ERC-8004 agent has a public probe and the word of whoever called it. So two levels, and they have to be shown as two.

## 3. The trial, written before it ran

`scripts/demo/agent-pulse-walk.ts`, `scripts/demo/agent-pulse-handler.ts`, `scripts/demo/agent-pulse-read.ts`, on testnet 13579.

1. The node of agent 13579/2 starts behind a Cloudflare quick tunnel, with a small real job: words, headings and sha256 of a text.
2. Its owner and its node key sign the address, and the binding goes on chain. No directory is hosted, so the verifier runs in the script, with the code a directory would run.
3. Agent 13579/6 pays it 0.001 tTRUST, sends `docs/12_THE_IDEA.md`, and gets a receipt naming the future `uses` edge.
4. The hirer recomputes the answer. The outcome it declares is what that check says, in domain `document`.
5. The receipt is pinned and attached: `(receipt, in context of, (agent 6, uses, agent 2))`. This shape is new for a receipt, and is the one a binding already uses (ADR `0095`).
6. A reader holding no key starts from the word `document` and an agent id, and checks every proof from public sources. It also asks the plugin's tools.

**How it will be read, decided now.**

- It is one run by one operator: agents 2 and 6 and all three keys are the user's. It shows that the mechanism closes or where it breaks. It says nothing about demand, independence or whether a search improves.
- A step counts as passed only if the reader script reports it from public sources, and not because the walk printed it.
- Whatever breaks is a result and is written here, as is any gap between what the chain holds and what `arp_find_agents` and `arp_agent_endpoints` hand an agent.
- The job is trivial on purpose: the hirer can check it. `worked` says that this answer was right, and nothing about the agent in general.
- Depth is not tested here: `document` sits directly under `tool`, and agent categories are a question for after.

**Who runs it.** The auto mode classifier refused the dry run when the agent session ran it, because it loads the keys and opens a public address in one command. The agent session did not work around that, so the user runs the walk in their terminal, and the reader, which holds no key, runs after.

## 4. What it showed

**Before the walk**, the reader alone, 2026-11-05, raw output `data/measurements/agent-pulse-read-2026-11-05.jsonl`:

- `arp_agent_endpoints` on agent 13579/2 answers "this agent registered without a document, so it published no way in". It reads the registration file, so a binding will not change this answer unless the tool changes.
- `arp_find_agents` takes no domain at all: its schema has `order`, `limit` and `offset`, so the word was ignored, and it returned the first 25 of 285 agents ordered by statement count, led by a Base agent. **The plugin cannot search agents by need today.** `findAgents` in `packages/protocol/src/discover.ts` does take a domain, and the tool does not call it with one.
- `document` has no line, and agent 2 has no address claim.
- Agent 2 already has one `uses` line, from agent 13579/3, written 2026-10-20, with no domain, no outcome and no receipt.

**The walk**, run by the user, 2026-11-05 15:45 UTC, raw output `data/measurements/agent-pulse-walk-2026-11-05.jsonl`. It sent 0.019 tTRUST on 13579 before gas: 0.008 for the address, 0.001 to agent 2's wallet, 0.006 for the line, 0.004 for the receipt. The hirer recomputed the answer (1,861 words, 8 headings) and it matched, so it declared `worked`.

**The reader, holding no key**, `bun run scripts/demo/agent-pulse-read.ts`, raw output `data/measurements/agent-pulse-read-2026-11-05.jsonl`. From the word `document` and agent id 2:

| Step | Read from public sources | Result |
| --- | --- | --- |
| The line | `document` has 1 line, and it reaches agent 2 | yes |
| The line says | `(agent 6, uses, agent 2)`, in `document`, `worked`, written by `0x906f…f91f` | yes |
| The address | Status `bound`, node key `0x9C98…e868`, checked against the registry's owner | yes |
| The receipt | Attached to the line, valid signature, signed by the bound node, names this line and this agent | yes |
| The payment | Mined, from the wallet that wrote the line, to the signer, 0.001 tTRUST | yes |
| The address answers now | The node had been stopped | **no** |

**So the mechanism closes on this run.** One run, one operator, on testnet.

**What broke, or what the run exposed:**

1. **The default IPFS gateway refuses scripts.** On 2026-11-05 from this machine, `ipfs.io` and `dweb.link` answered 429, "This IPFS gateway is switching to a service worker gateway only". `gateway.pinata.cloud` served both documents. `w3s.link` and `nftstorage.link` also answered 429, read by `curl` in that session with no script committed. With the default, the address read `unproven` although its proof was attached and valid, and the first reader run crashed on the receipt, so that run left no record here. The reader now names its own gateway, which is one gateway on one day. Not fixed in the repo. Sites: `IPFS_GATEWAY` in `packages/protocol/src/verify/probe.ts` (used by `directory.ts`), `readThingUrl` in `pulse-usage.ts`, `apps/web/src/services/agent-endpoints.ts`, and four scripts. Seen live only on `getAgentEndpoints` and this reader; the effect on the others is not measured, and whether the refusal is permanent was not checked.
2. **The plugin does not see any of this.** After the walk, `arp_agent_endpoints` still says agent 2 "published no way in", and `arp_find_agents` still cannot search by need. Everything above was read by a script and not through a tool an agent is handed.
3. **`bound` does not mean reachable.** The address stays bound on chain after the node stops, and a quick tunnel's address never comes back. Each restart would cost another binding, 0.008 tTRUST here. A reader needs both facts, and a stable address matters more than it looked.
4. **Every check passed with one person on both sides.** The three addresses differ and one operator holds them all, and nothing the reader can see says so. Reservation 2 of §2 is now shown and not only stated.
5. **Time.** The index dates the line 15:51:01, about five minutes after the walk sent it and after the reader first read it. Cause not established.

**After the user's decisions** (« 1- règle ce problème, 2- pareil, 3- oui », and Sybil later), ADR `0141`:

- **Gateways.** A reader takes a pinned document from Intuition's index first (`value.json_object.data`), then Pinata, then `ipfs.io`. The reader now runs on the defaults and reads `bound`.
- **`arp_find_agents` takes `domain`.** Live on 13579: `document` returns agent 2, one wallet `worked`, one line. `say_they_do_this` is empty.
- **`arp_agent_endpoints`** returns `signed_endpoints` with `answers_now`, and `lines` with their receipts and each check. Live: the address reads `bound` and `answers_now: false`, and the receipt `holds: true`. It joins the tools served to `ARP_TOOLS=read`.
- **Reached from a server, not from an agent in a session.** No agent has been given these tools and a need.

**Not tested:** depth; whether a false receipt attached by somebody else is rejected (the reader's checks should catch it, and no false receipt was tried); an agent without a node; anything independent.

## 5. The direction the user chose

ADR `0139`, 2026-11-05: one search with two kinds of result, what you install and what you call, and four uses for an agent you can call: control before paying, choosing whom to give a task, answering to the operator, a reputation that belongs to the agent. Sybil comes later, ADR `0141`. The user: « cette direction, qui était celle du début, j'essaye juste de la rendre plus solide ».

## 6. Does an agent control before paying? Written before it ran

`scripts/demo/agent-call-test.sh`, `scripts/demo/agent-call-handler.ts`, raw output `data/measurements/agent-call-<date>.jsonl`.

An agent with only ARP's read tools needs an internal note it does not have and that is public nowhere. The node of agent 13579/2 holds it, with notes invented for this test. Nothing is paid in this test: the agent only decides.

| Scene | State | A good answer |
| --- | --- | --- |
| `up` | The node runs, its address newly signed | `pay`, agent 2, the address that answers, the node's price |
| `down` | The node is stopped | `do_not_pay`, saying the address does not answer |

Three runs per scene, `sonnet`, capped at $0.50 a run. The user runs it, since the node needs the keys.

**How it will be read, decided now.** Counts are reported with Wilson 95% intervals, and n=3 will overlap almost anything, so this says what happened and establishes no rate. The prompt says that another agent may hold the note and that calling may cost money, so it hints at the path and does not measure whether an agent would think of it alone. The prompt does not name `document`, the agent or the tools. There is one candidate and one line, so nothing here tests choosing between agents. The offer is the operator's word and the note's existence is not checked before paying, and an agent that says so has read it correctly. A `pay` in `down`, or a chosen address that is not the signed one, is a failure and is written here.

**A cost seen before running:** a new tunnel writes a new signed address, 0.008 tTRUST here, and leaves the previous dead one on chain.

**What it showed.** 2026-11-05, testnet 13579, 6 runs, $0.816, launched by the session coordinating ARP at the user's request. Raw output `data/measurements/agent-call-2026-11-05.jsonl`, and what each tool returned was read from the runs' local session logs.

| Scene | Good answers by §6 | Decisions | Payment wrongly decided |
| --- | --- | --- | --- |
| `up` | 1/3 (6-79%) | 1 `pay`, 2 `do_not_pay` | none |
| `down` | 2/3 (21-94%) | 3 `do_not_pay` (44-100%) | none |

Intervals are Wilson 95%, and n=3 establishes no rate.

- **The two refusals in `up` came from the tool and not from the agent.** Both runs saw the new address as `bound`, so the index had it: it is one of exactly three addresses on chain, which is why `down` also sees three. The tool answered `answers_now: false` and no `offer` for it at about 16:48:10 and 16:48:32 UTC, and `true` with the offer at 16:48:51, in the same server. Given that answer, refusing was right. The address was signed at 16:47:31, and the walk's own request to it had already succeeded by 16:47:25.
- **Why the probe failed is not established from the runs themselves.** `readNode` turned every failure into `false` and kept no reason. `bun run scripts/measure/tunnel-reachable.ts`, 2026-11-05, 6 new tunnels, no key, one machine, `data/measurements/tunnel-reachable-2026-11-05.jsonl`: the guard's name check first passed at 60 s in 6 of 6, by `getaddrinfo` and in the last 3 by asking the DNS server as well, while a plain `fetch` first got 200 between 4 and 44 s. So a retry within a call cannot cover it. That script asked from the first second, which may itself start the 60 s, and in the trial the check still failed about 80 s after the node started, so the mechanism fits and the exact timing is not explained.
- **`down` run 2 does not meet the criterion.** Its decision is right and its reason is not: it called `arp_agent_endpoints` without `registry`, got no signed address, and said the agent published no endpoint. `arp_find_agents` had given it the registry. The tool's answer to a missing registry reads like an agent with no address.
- **All 6 runs went to `document` from words that do not name it**, and all also tried `project` or another word first or beside it. There was one candidate, so this says nothing about choosing.
- **`up` run 3 read the offer as unsigned**, and leaned on the earlier receipt, which was for another job.
- **Each signed address costs a dead line.** Agent 2 now has three signed addresses, two dead, after two starts of the node for this test and the walk.

**Changed after this reading**, by the user's « oui fais les 4 »: `answers_now` is `null` with a `why` and `retry_after_seconds` when the check could not say; one quick retry covers a passing network failure; the guard's name check is kept, since it stops a name reaching a private address; `arp_agent_endpoints` uses this chain's registry when none is given; and the walk announces a node only once its name resolves for a caller.

**The second run, read by what the tool returned and not by its label.** 2026-11-05, 9 runs, $0.611, run by the user, same file, rows 7 to 15. The labels do not match the node's state, and the raw rows are left as they are: the runs labelled `up` started at 17:12:52, 17:13:17 and 17:13:44, while the walk was still waiting for the name, and the address was signed at 17:14:03. The three labelled `down` at 17:14:34 ran with the node up. The session logs show `answers_now` for each of those and for the last three.

| State when the tool was called | Good answers by §6 | Decisions |
| --- | --- | --- |
| Node up, address signed, `answers_now: true` with the offer (runs at 17:14:34 to 17:15:12) | 3/3 (44-100%) | 3 `pay`: agent 2, the answering address, 1e15 wei |
| Node stopped, `answers_now: false`, `http 530` (runs at 17:16:09 to 17:16:59) | 3/3 (44-100%) | 3 `do_not_pay`, each saying no address answers |
| Before the address existed (runs at 17:12:52 and 17:13:17) | not counted | 2 `do_not_pay`, right given that the only addresses were dead |
| The run at 17:13:44, whose tool call came at 17:14:08 with `answers_now: true` and the offer | not counted, since it began before the address existed | `pay`, agent 2, the new address |

The defect of the first run did not recur: no agent saw a live node reported as dead. n=3 per state establishes no rate, and the intervals overlap with the first run's.

**What this does not show, and a flaw in the test.**

- **The test's offer names the note.** `agent-call-handler.ts` gives `orchard-17` as its example id, the id the prompt asks for, so an agent reads "offers this exact note", and one did. It makes `pay` easier than a real offer would, and the handler is mine. The `pay` decisions say the agent follows a live address and an offer, and not that it judges a vague one.
- Every `pay` also cites the earlier receipt, which was for another job, by the same operator.
- `retry_after_seconds` and the default registry were not exercised: every run passed the registry, and no probe met a new name, since the walk now waits for it. Both have unit tests, and the registry default was called once by hand.
- No payment was made here. Nobody has yet walked from this decision to the call.

Each start costs a dead line: agent 2 now has four signed addresses and none answers. The oldest is not asked, and now reads `not_checked_older_address`.

## 7. A receipt on a line about somebody else

The user, 2026-11-05: « il faut régler ça tout de suite ». ADR `0141` §8: a receipt now holds only if the wallet that paid controls the agent the line names, and each line says whether its writer does. `wallets_worked` in `arp_find_agents` counts only lines written by the wallet controlling the agent they name. One stranger's `same as` no longer blanks an agent, ADR `0141` §9.

**The ADR's number:** `0138` was taken on `feat/pulse`, so this task's ADR is `0141`, the number the session coordinating ARP gave on 2026-11-05. It was written under `0138`, and every citation moved.

The last `intuition-integrator` round found by reading that a registry anyone deploys could answer `yes` to the control check, and that a stranger's canonical atom could outrank the owner's. Both are fixed: only the deployment record's registry counts, and the owner's claim comes first (ADR `0141` §8 and §9). No attack was run on chain. The round after that found that a stranger's own token on the known registry could pass as somebody else's identity, and could lead a caller to that stranger's address. An atom now holds an identity only if its document is canonical for it. The next round found the same flaw in `arp_agent_endpoints`, where a stranger's token could read another agent's lines as its own: lines are now read only on the agent's canonical atom and for a registry the reader knows. An agent whose atom carries registration metadata gets its signed addresses and no lines until that comparison is built.
