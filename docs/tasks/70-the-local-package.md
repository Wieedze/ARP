# Task 70 — The whole package, working locally

**Status:** started 2026-11-05 on `feat/agent-pulse`. Nothing is pushed, published or hosted.
**Decision:** the user, 2026-11-05: « on finit tout le package en local, et quand toute la checklist est vérifiée, que tous les services sont confirmés, on avance » (spelling corrected).
**Rules:** `code.md`, `portability.md`, `security.md`, `claims.md`, `workflow.md`.
**Reviewers:** `intuition-integrator` where an item touches a graph read; `task-verifier` once, at the end of the checklist.

## The goal

One plugin. An agent searches, checks before it installs or pays, notes what failed on its machine, can share that as a public line on testnet 13579, and the next agent's search reads it. All of it on one machine, with every service running locally.

## Checklist

An item is ticked only with the command that shows it and its output, in the item's own commit.

| # | Item | Holder | Done when |
| --- | --- | --- | --- |
| 1 | The plugin can write a line | `arp-5a` | From the plugin's own install, an agent writes a form B line through the local sponsor, signing nothing. A chain read shows the line |
| 2 | Sharing the local memory | `arp-7c` | A failure the hook noted becomes a public line only after the person has turned sharing on, in closed words. Off by default: a test shows nothing leaves |
| 3 | A false line | `arp-5a`, design first | The user chose a design. A test: one false line no longer moves every choice, by the rule the user chose |
| 4 | One search | `arp-d8` | `arp_pulse` returns what you install and what you call (ADR `0139`). An agent no longer has to pick between search tools, and the tools it replaces are removed from the plugin's set |
| 5 | The cost before writing | `arp-d8` | A plan states a line's total cost before it is sent, and a budget smaller than that is refused. A test on the case that broke, 0.011 against 0.01 |
| 6 | The services' addresses | `arp-f3` | Every local address has one setting, documented, and a service that is down gives a clear message rather than a hang |
| 7 | The local walk | `arp-f3` | Below |

## The local walk, last

From a tarball of the CLI and a local marketplace, in a clean `HOME`, with `apps/sponsor`, the content server and `apps/node` running:

1. `claude plugin marketplace add <local path>`, `claude plugin install arp@arp`.
2. A real session searches for a skill and reads what it requires.
3. A failure is noted by the hook, and the next session reports it.
4. Sharing is turned on, the line is written, and it can be read on 13579.
5. A second clean `HOME`, standing for another person, finds that line in its search.
6. An agent found through the same search is paid and called.

Each step's output goes in this file. A step that fails is written as it is.

### What the walk showed, 2026-11-05

Testnet 13579, `claude -p`, `sonnet`, from a tarball of the CLI installed in a throwaway folder, with a throwaway `ARP_HOME`. **Not a clean `HOME`:** that would have meant copying the user's Claude credentials. So `claude plugin validate` and `--plugin-dir` stand in for `marketplace add` and `install`, which remain to be run for real. `npx` found the CLI in the folder, as it is not on npm.

| Step | Result | Cost |
| --- | --- | --- |
| 1 | `claude plugin validate packaging/claude/arp`: passed | |
| 2 | A real session found `baoyu-url-to-markdown` through the plugin's `arp_pulse`, and said what its file names | $0.10 |
| 3 | `web2md` really absent: the hook noted `missing-program`, and the next session reported it. `arp share send` with sharing off sent nothing | $0.26 |
| 4 | `arp share on`, then `arp share send`: `sent 1, failed 0`, then `sent 0, failed 0`. The line: `softaworks/agent-toolkit?skill=web-to-markdown`, `document`, `failed`, `missing-program`, by a new agent (13579:38), through the local sponsor | $0.08, and the sponsor's spend for the day rose 0.0242 tTRUST, new agent included |
| 5 | Another `ARP_HOME`, in another folder: the session reads that line, says it is one wallet under the 3 that move the score, and lists agent 13579:2 | $0.08 |
| 6, first | **Failed.** The user ran the node and the wallet, as the auto mode refused the tunnel to the agent session. With one search, the agent searched its own words and `domain: business`, got only skills, and paid nobody. A regression from item 4: agent 2 is only in `document` | $0.23 |
| 6, after `efa2a9e` | The same prompt, the same offer, the plugin's read tools over HTTP, one run. The agent found agent 2 through `offers_matching_need`, paid 0.001 tTRUST once at the signed address, and answered 14 March and 41,300 | see `agent-paid-runs-2026-11-05.jsonl`, 19:04:44 |

**Seen on the way:** a machine that already has ARP as a global MCP server has two servers of the same name, and a session may call the global one. In this walk that is `mcp__arp__arp_pulse`, excluded with `--disallowedTools 'mcp__arp__*'` so the plugin's was the one tested. The first attempts at steps 3 and 4 hit this as a permission refusal, and their line had no source and no domain.

**Item 6:** with both services stopped, `arp line` and `arp_get_skill` each name the service, its address and, for the content server, `ARP_CONTENT` (`1772253`). `arp line`'s own message was written by item 1.

## After the checklist, not before

The push to `main`, publishing `@arp-protocol/cli`, hosting the sponsor, and the install commands in the README. Each waits on the user's own go.

## Do not do

Mainnet. A change to a score weight without the user. Task 67's list or thresholds. The `/tools` work in the main folder, which is another session's.

## Evidence ladder

Tier 3, staked: it makes a declared line reachable from one install. It moves ARP up only when somebody else writes one.

## Evidence, item by item

**Item 5, the cost before writing.** `arp_declare_used` takes `budget_wei`: over it, the answer is `status: refused` with the plan's total and no calls. The demo's `write_line` requires it, and counts the receipt in the total. It is what is left to spend, so a payment already made is the caller's to subtract: an agent that passes its whole budget after paying can still go over it, which no tool here can see. `write_line` was not run against the chain after this change.

```
cd packages/protocol && bunx vitest run test/agent-pulse.test.ts -t budgetRefusal --reporter=verbose
 ✓ budgetRefusal > refuses the case that broke: 0.011 against 0.01
 ✓ budgetRefusal > lets a plan through at exactly the budget, and one that costs nothing
cd apps/mcp && ARP_TARGET=testnet ARP_NO_RECEIPTS=1 bunx vitest run test/server.test.ts -t budget
 Tests  2 passed | 39 skipped (41)
```

**Item 4, one search.** `arp_pulse` returns `agents` beside `skills`. `ARP_TOOLS=read` serves `arp_pulse`, `arp_agent_endpoints` and `arp_tool_reputation`. `arp_find_tools` and `arp_find_agents` stay in the full, Desktop and sponsored modes, since those two do not run the search package. **What this gives up:** the plugin has no catalogue search left to fall back on, so when `npx skills` does not run, `arp_pulse` says the search did not run and the agent has nothing else to search with. That dependence on one vendor stays open. An agent is found only through a declared line in a domain, or by describing itself with the word.

```
ARP_TARGET=testnet ARP_TOOLS=read ... arp_pulse {search_output: "", domain: "document"}, on 13579, 2026-11-05
tools/list: ['arp_pulse', 'arp_tool_reputation', 'arp_agent_endpoints']
results: [], agents.used_here: agent 2, wallets_worked 2, wallets_failed 1
arp_find_tools: unknown tool
cd apps/mcp && ARP_TARGET=testnet ARP_NO_RECEIPTS=1 bunx vitest run
 Tests  139 passed (139)
```

The real search package was not run in this check, and no agent in a session has used the narrowed set yet. The local walk does that.

## Item 1, what shows it

From this repository's CLI, not from a plugin's own install, whose `marketplace add` and `install` remain in the local walk. Local sponsor on port 3277 with a budget of 0.1 tTRUST and one line a day:

    ARP_SPONSOR=http://127.0.0.1:3277 bun run apps/cli/src/cli.ts line --tool "https://github.com/Wieedze/ARP?skill=arp" --domain development --outcome failed --reason missing-file

The first two tries were refused in clear words, `"software" is not a category under tool` and the same for `ai`, and spent nothing on a line. The third wrote a test line on 13579, about ARP's own skill, which did not really fail: T1 `0x2d2b8c4a…` to T4 `0x5867cd0e…`, 0.018 tTRUST in value for the run (0.006 of listing, 0.012 for the line) plus gas, with the local agent `0x56BC52…` holding a position on each level and the treasury as creator (read from the index by `term_id`; `data/measurements/pulse-lines-*.json` holds what the reader returns). A second line was refused, `1 sponsored lines a day per agent, reached`. `getPulseUsage` reads one nested line, `development`, `failed`, `missing-file`, written by that agent and not by the treasury.

**A trap:** the listing takes GitHub's own spelling, so `Wieedze/ARP` was listed as `intuition-box/ARP`, and a search under the old name does not reach the line. `writeLine` returns the URL it wrote under, as `toolUrl`.

## Item 2, what shows it

**Done, 2026-11-05.** The user accepted the domain rule and starting the sponsor, adding « il y a toujours un contexte ». Written in the walk by `arp-f3`, through the local sponsor and the real plugin, after a real failure of `web2md`:

    $ arp share send
    sent 1, failed 0
    $ arp share send
    sent 0, failed 0

Read back from 13579 with no local memory, through `arp_pulse` in a separate `ARP_HOME`, `domain: document`:

    "by_domain": {"document": 1}, "by_outcome": {"failed": 1}, "by_reason": {"missing-program": 1}

The hook records a search from either server, as it matches `__arp_pulse` at the end of the tool's name. A person with ARP installed globally as well as the plugin has two servers of that name, which is `arp-f3`'s finding in the walk.

Sharing off, shown by `apps/cli/test/share.test.ts`: the writer is never called, and `arp share send` stops before loading it.

A real session, 2026-11-05, Claude Code, `sonnet`, $0.09, in a throwaway home and folder. `softaworks/agent-toolkit@web-to-markdown` was installed by hand and its `web2md` really is absent from this machine, so the failure is true. The domain `document` was passed to `arp_pulse` in the prompt, not inferred from a need:

    {"skill":"web-to-markdown","source":"softaworks/agent-toolkit","domain":"document","reason":"missing-program"}

    $ arp share send
    sharing is off: nothing was sent. `arp share on` turns it on
    $ arp share on
    would be public on testnet 13579:
      https://github.com/softaworks/agent-toolkit?skill=web-to-markdown  document  failed  missing-program

The hook gets an MCP answer as a list of `{type, text}` blocks, seen in that kind of session.

With no search, 2026-11-05, a second real session (`haiku`, $0.004) said « I am preparing a document » and gave `domain: document` from those words, and none of them is in the file. A hand-installed skill with no search has no source, so it stays on the machine, as a private skill must. After a real `npx skills add` in a throwaway `HOME`, the same failure showed as a line that would be public. Words that name no category still give no domain.

### For step 4 of the walk

With a clean `HOME` and the plugin installed, the sponsor running, and `command -v web2md` printing nothing. Install the skill the normal way, because its lock file gives the source even if `arp_pulse` is refused in the session:

    npx --yes skills@1.7.6 add softaworks/agent-toolkit --skill web-to-markdown -g -y --agent claude-code

Then a session, whose failure is real, and whose words name the context:

    claude -p 'I am preparing a document. Use the skill web-to-markdown to convert https://example.com to markdown. Install nothing. Skip the install check and run the web2md command once, with --print, then report what happened and stop.' --plugin-dir <plugin> --allowedTools "Skill,Bash(web2md:*)" --model sonnet --max-budget-usd 0.5

Then, reading each output:

    arp share            # says sharing is off, and sends nothing
    arp share on         # shows the one line that would be public
    arp share send       # writes it. Expect: sent 1, failed 0

It writes that this skill failed for want of a program, which is true of a machine without `web2md`, permanently on testnet 13579. A second run of `arp share send` must say `sent 0`.

**Note on item 4's evidence:** `wallets_worked 2, wallets_failed 1` predates `payers` reaching the agent path (`d590849`). It should now read 1 and 0 on that agent, and was not re-run.

**Item 4, corrected after step 6 failed.** On 2026-11-05 at 18:56 UTC the agent searched with its own words, tried `domain: business`, and found no agent, while agent 2's node was up with its offer. The first version of the one search looked only in a domain, and the earlier runs had reached `document` by trying several words with `arp_find_agents`, which one search with an inferred domain does not do. `arp_pulse` now also reads the offers of up to ten agents with a signed address and returns those sharing at least two words with one of the need's phrases, as `offers_matching_need`. It compares words and reads no meaning, an offer is its author's text, and an agent with no offer or a stopped node is not found this way. Each search with words now asks those agents' newest addresses.

```
cd apps/mcp && ARP_TARGET=testnet ARP_NO_RECEIPTS=1 bunx vitest run
 Tests  152 passed (152)
arp_pulse {search_output: "", queries: ["internal project note", "company project notes"], domain: "business"}, live on 13579
 4.4 s; used_here: [], offers_matching_need: agent 2
```

The regression test uses the failed run's own phrases and domain, and the demo's offer as served. No agent in a session has run this yet: that is step 6 again.

