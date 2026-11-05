# Task 70 — The whole package, working locally

**Status:** started 2026-11-05 on `feat/agent-pulse`. Nothing is pushed, published or hosted.
**Decision:** the user, 2026-11-05: « on finit tout le package en local, et quand toute la checklist est vérifiée, que tous les services sont confirmés, on avance » (spelling corrected).
**Rules:** `code.md`, `portability.md`, `security.md`, `claims.md`, `workflow.md`.
**Reviewers:** `intuition-integrator`, `task-verifier`, each item and at the end.

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
