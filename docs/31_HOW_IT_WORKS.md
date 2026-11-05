# 31 — How it works

For someone new to ARP. `docs/12` holds the mechanism and `docs/30` what may be claimed. To see this run, in about three minutes and spending nothing: `bun run scripts/demo/terminal-demo.ts` (`docs/26` §6).

ARP is the public pulse for skills and autonomous agents: **check before your agent installs or pays**. It stores no skill and no agent. What exists lives somewhere else, and ARP adds what agents declared about it. It runs on Intuition testnet 13579, and no third party has reported a result on a skill yet.

## The whole picture

```mermaid
flowchart TB
    subgraph machine["The person's machine"]
        runtime["Claude Code, with the ARP plugin"]
        pulse["arp_pulse, in the plugin's MCP server: read-only, holds no key"]
        hook["The hook: runs on every tool call, no network"]
        memory[("Local memory: ~/.arp/failures.jsonl, .arp/session.jsonl, .arp/searches.jsonl")]
        share["arp share: off by default, a separate process with the agent's key"]
    end

    subgraph others["Third parties, read only"]
        search["skills.sh, through npx skills@1.7.6"]
        github["GitHub: the skill's files"]
    end

    subgraph ours["ARP's sponsoring service, on our machine today"]
        sponsor["apps/sponsor: pays, testnet 13579 only"]
    end

    subgraph chain["Public, Intuition testnet 13579"]
        vault["MultiVault: the line's triples and positions"]
        index["The index: testnet.intuition.sh"]
    end

    subgraph elsewhere["Another operator's machine"]
        hired["arp node, behind a tunnel they rent"]
    end

    runtime -- "1. searches" --> pulse
    pulse -- "2. who has this" --> search
    pulse -- "3. what do its files name" --> github
    pulse -- "4. what did agents write" --> index
    memory -- "5. what failed here" --> pulse
    runtime -- "every call" --> hook
    hook -- "6. a skill's failure, in closed words" --> memory
    memory -- "7. only if the person turned sharing on" --> share
    share -- "8. a signed request" --> sponsor
    sponsor -- "9. writes the line, in the agent's name" --> vault
    vault --> index
    index -- "10. the next search, on any machine" --> pulse
    pulse -- "11. an agent's signed address, and whether it answers" --> hired
    runtime -. "12. pays on chain, then calls: from a wallet outside the plugin" .-> hired
```

The search is the product, and a line is its fuel. Step 12 is the one the plugin cannot do alone: it holds no key, so the payment comes from a wallet the operator runs. It was walked once, with `scripts/demo/agent-call-wallet.ts` as that wallet (`docs/tasks/70`, step 6). ARP is not in the call's path: the operator's tunnel carries it, and the node checks the payment and signs a receipt.

## The path of one failure

From a command that fails to a line another machine reads.

```mermaid
sequenceDiagram
    participant A as Agent
    participant H as Hook
    participant M as Local memory
    participant P as Person
    participant S as arp share send
    participant V as Sponsor
    participant C as Testnet 13579
    participant O as Another machine

    A->>H: A command fails, in a session that used a skill
    H->>H: Did this skill ask for this command? Which closed reason does its output show?
    H->>M: skill, source, domain, reason. Never the command or the output
    A->>M: The next search on this machine reads it
    Note over A,M: failed_on_this_machine. Nothing has left yet
    P->>S: arp share on, reads what would be public, then arp share send
    S->>V: A request signed by the local agent key: public URL, domain, failed, reason
    V->>V: Checks the signature, the daily caps and the budget
    V->>C: Writes T1 to T4, and deposits in the agent's name on each level
    O->>C: Its next search reads the line from the index
    Note over O,C: Shown as unconfirmed: below 3 wallets it moves no order
```

| Stays on the machine | Leaves, only after `arp share on` and `arp share send` |
| --- | --- |
| The command and its output: never written, even locally | The skill's public GitHub URL |
| The person's words: matched against closed words, never copied | The domain, a category that already exists under `tool` |
| The session id and the date in `failures.jsonl`, and any path | `failed` |
| A skill with no known public source, or several | The reason: `missing-key`, `missing-program` or `missing-file` |
| A failure of a command no skill asked for: not recorded at all | An agent address and id on testnet, and the time, as with any transaction |

A hook can see a failure and can never tell that something worked, so `worked` does not come from it (ADR `0140`). The line is the agent's word, and nothing proves a use happened. The check for "off by default" is `apps/cli/test/share.test.ts`: the writer is never called.

## What a line is on chain

Form B: each triple is the subject of the next (`docs/28`, which has the reasons). The same sentence always gives the same id, so two agents who write it speak about the same term.

```mermaid
flowchart LR
    A["Agent 13579:38"] --> T1(("T1 uses"))
    T1 --> S["softaworks/agent-toolkit, web-to-markdown"]
    T1 --> T2(("T2 in context of"))
    T2 --> D["document"]
    T2 --> T3(("T3 has outcome"))
    T3 --> O["failed"]
    T3 --> T4(("T4 because"))
    T4 --> R["missing-program"]
```

A round is a triple, a rectangle is an atom. A line can stop at any level, and each level costs one more fee. The words are closed: a domain under `tool`, `worked` or `failed`, and a reason that follows only a failure (`missing-key`, `missing-program`, `missing-file`, `not-the-right-tool`).

That line is real, and it is one of ours: T3 is `0x9bc685e5f9baf1647818cc20edd604845bde42a11de9db66c0e22879d2c2c9eb`, in [this transaction](https://testnet.explorer.intuition.systems/tx/0x5aee4d1a668082b311fb1ad16d3c56adc188fceaaa8fabccc8566bbf3b4f636b). Our sponsoring service created the terms, and the agent's own wallet holds a position on them, so the wallet that paid is not counted as saying it (ADR `0144`).

## How a search is ranked

```mermaid
flowchart TD
    R["The search's own order gives each result a prior, 0.8 to 0.2"] --> L["The lines written about each result"]
    L --> W{"Weight of a line"}
    W -- "same domain" --> W1["1"]
    W -- "a domain above or below" --> W2["0.5"]
    W -- "another domain" --> W0["0: shown, not counted"]
    W1 --> E{"A failure for lack of something this person can supply?"}
    W2 --> E
    E -- "yes" --> W0
    E -- "no" --> B["Each wallet keeps its heaviest line per outcome"]
    B --> T{"3 wallets or more saying the same thing?"}
    T -- "no" --> U["Shown as unconfirmed, and the order does not move"]
    T -- "yes" --> F["score = (prior + worked) / (1 + worked + failed)"]
```

| Counts | Does not count |
| --- | --- |
| Distinct wallets, and from 3 of them saying the same thing | The amount deposited: the reader does not ask for it |
| The domain, against the one searched | A second line from the same wallet |
| What the person says they can supply (`can_provide`) | The wallet that only paid (ADR `0144`) |

Under 3 wallets a line is still read by the agent, with how many wallets said what, not confirmed, to check in the skill's file. A skill the search did not return enters the list only from 3 wallets too. Agents follow the same threshold.

Beside the score, each result shows what its files name: commands, keys, a login, hosts, words suggesting a paid service. These are matches in a file, not proven requirements. The score ranks a search and does not say a skill works: a line is a declaration, and several wallets can still buy several lines. The code is `packages/protocol/src/pulse-score.ts`, the decisions are ADRs `0138` and `0143`.

## What runs where today

| Piece | Where it runs today |
| --- | --- |
| The MCP server and the hook | The person's machine. The plugin passes `claude plugin validate`. The package is not on npm, so it is installed from a tarball or a local folder |
| `arp share`, `arp line` | The person's machine, one call at a time. They load `~/.arp/agent-key` |
| `apps/sponsor`, the sponsoring service | **Local only**, on our machine, port 3200. Testnet 13579 only. Without it, `arp share send` names the service and fails |
| `arp mcp --http`, the content server | **Local only**, port 3002. Used by the sponsored setup, not by the plugin |
| `arp node` | The operator's machine, on 127.0.0.1 behind a tunnel they rent. Only our test agents run one so far |
| `apps/web`, the web app | **Local only**, `bun run dev` |
| `apps/probe`, `apps/api`, Workers | **Local only**, with no public deployment (`docs/27`) |
| MultiVault and the index | Intuition's, public, testnet 13579 |
| skills.sh, GitHub | Third parties. Without a token, GitHub allows 60 requests an hour per address, and a new search takes about 5 (`docs/tasks/70`) |

## What is not done

- **No third party has reported a result on a skill yet.** The result lines so far are ours: `bun run scripts/measure/proof-of-work.ts` counts them and says so. Other wallets did write `uses` edges, which say a use and report no result.
- **A line proves nothing about use.** Whether a line shown moves anybody's choice is open (`docs/tasks/71`).
- **Nothing is published or hosted.** Publishing the package, hosting the sponsor and the install commands in the README each wait on a decision (`docs/tasks/70`). So a line can be written only where the sponsor runs, unless the writer pays for it directly.
- **`claude plugin marketplace add` and `install` remain to be run for real** in a clean home (`docs/tasks/70`, the walk).
- **One search, one vendor.** When `npx skills` does not run, the plugin has no other search and says so.
- **The plugin does not pay.** A paid call needs a wallet outside it.
- **Mainnet.** A port stays blocked until a writer's control of the agent is proven (ADR `0135`), and until the price of a line held on deposits is answered (ADR `0138`). `docs/27` is the checklist.
