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

From this repository's CLI, not yet from a plugin's own install, which is step 4 of the local walk. Local sponsor on port 3277 with a budget of 0.1 tTRUST and one line a day:

    ARP_SPONSOR=http://127.0.0.1:3277 bun run apps/cli/src/cli.ts line --tool "https://github.com/Wieedze/ARP?skill=arp" --domain development --outcome failed --reason missing-file

The first two tries were refused in clear words, `"software" is not a category under tool` and the same for `ai`, and spent nothing on a line. The third wrote a test line on 13579, about ARP's own skill, which did not really fail: T1 `0x2d2b8c4a…` to T4 `0x5867cd0e…`, 0.018 tTRUST in value for the run (0.006 of listing, 0.012 for the line) plus gas, with the local agent `0x56BC52…` holding a position on each level and the treasury as creator (`data/measurements/pulse-lines-*.json`). A second line was refused, `1 sponsored lines a day per agent, reached`. `getPulseUsage` reads one nested line, `development`, `failed`, `missing-file`, written by that agent and not by the treasury.

**A trap:** the listing takes GitHub's own spelling, so `Wieedze/ARP` was listed as `intuition-box/ARP`, and a search under the old name does not reach the line. `writeLine` returns the URL it wrote under, as `toolUrl`.

## Item 2, what shows it so far

**Not ticked: no line has been written.** The domain rule awaits the user (ADR `0140`, amendment), and the chain write belongs to the walk, as the sponsor's key is the user's to start.

Sharing off, shown by `apps/cli/test/share.test.ts`: the writer is never called, and `arp share send` stops before loading it.

A real session, 2026-11-05, Claude Code, `sonnet`, $0.09, in a throwaway home and folder. `softaworks/agent-toolkit@web-to-markdown` was installed by hand and its `web2md` really is absent from this machine, so the failure is true. The domain `document` was passed to `arp_pulse` in the prompt, not inferred from a need:

    {"skill":"web-to-markdown","source":"softaworks/agent-toolkit","domain":"document","reason":"missing-program"}

    $ arp share send
    sharing is off: nothing was sent. `arp share on` turns it on
    $ arp share on
    would be public on testnet 13579:
      https://github.com/softaworks/agent-toolkit?skill=web-to-markdown  document  failed  missing-program

The hook gets an MCP answer as a list of `{type, text}` blocks, seen in that kind of session.

### For step 4 of the walk

With a clean `HOME` and the plugin installed, the sponsor running, and `command -v web2md` printing nothing. In a project, put the skill in place:

    mkdir -p .claude/skills/web-to-markdown
    curl -sL https://raw.githubusercontent.com/softaworks/agent-toolkit/HEAD/skills/web-to-markdown/SKILL.md -o .claude/skills/web-to-markdown/SKILL.md

Then a session, whose failure is real:

    claude -p 'First call arp_pulse once with limit 1, domain "document" and search_output set to exactly: softaworks/agent-toolkit@web-to-markdown 773 installs
    Then use the skill web-to-markdown to convert https://example.com to markdown. Install nothing. Skip the install check and run the web2md command once, with --print, then report what happened and stop.' --allowedTools "mcp__arp__arp_pulse,Skill,Bash(web2md:*)" --model sonnet --max-budget-usd 0.5

The plugin may name its tool differently from `mcp__arp__arp_pulse`: check it first. Then, reading each output:

    arp share            # says sharing is off, and sends nothing
    arp share on         # shows the one line that would be public
    arp share send       # writes it. Expect: sent 1, failed 0

It writes that this skill failed for want of a program, which is true of a machine without `web2md`, permanently on testnet 13579. A second run of `arp share send` must say `sent 0`.

