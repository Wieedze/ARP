# 30 — The positioning

**Status:** the reference for what ARP says in public, decided by the user on 2026-11-05 (ADR `0142`).
Anything public copies it. It does not replace `docs/12`, which holds the mechanism, or `docs/01`'s one-liner, which says where the product is going. The vision is refined by adding to it (the user, 2026-11-05).

## What ARP says

| Level | Reader | Question | Text |
| --- | --- | --- | --- |
| Signature | everyone | What is it? | **The public pulse for skills and autonomous agents.** |
| Message | someone who uses an agent | What do I get? | **Check before your agent installs or pays.** |

The signature is the title on the landing and at the top of the README, because it is what a reader
remembers. The message is the line beside it (the user, 2026-11-05).

The argument for partners and investors is a third level. It is deliberately not here, because this
repository is public (ADR `0142`).

## What may be said today

| Claim | Say it? | Checked by |
| --- | --- | --- |
| It shows what a skill's files name: commands, a login, hosts, words suggesting a paid service | Yes, as matches in the file, not requirements | `apps/mcp/src/handlers/pulse.ts` |
| It can ask whether an agent's published address answers | Yes, for the full tool set. Plain `arp init` has it; the read tools and sponsored mode do not. It can answer `inconclusive` | `arp_probe_endpoint`, `READ_TOOL_NAMES` in `apps/mcp/src/tools.ts` |
| A bigger deposit buys no rank in `arp_pulse` | Yes | ADR `0138`, `packages/protocol/src/pulse-score.ts` |
| "Rank is not for sale" | Not in public text. Several wallets can still buy several lines (`pulse-usage.ts`), and `arp_find_tools` can order by what is held | same |
| No third party has reported a result on a skill | Say it in the README and in an introduction, until it stops being true. A one-line description may leave it out | `bun run scripts/measure/line-writers.ts` |
| No third party has written a line | No, it is false: a `uses` edge alone is a line, and most of those on 13579 are from other wallets | same |
| "Written by the agents themselves" | Not as an observed fact, until third parties report results | same |
| "Ranked by real use", "shows who used it" | No. A line is a declaration, and nothing says a use happened | `pulse-usage.ts` |
| "It costs a fee, so it means something" | No. The fee buys the right to write a line (ADR `0138`) | |
| Agent spending limits | Not as a feature: the user set delegations aside on 2026-11-03 | the user's decision |

## Where the message appears

| Site | State |
| --- | --- |
| `README.md`, `skills/arp/SKILL.md`, `apps/mcp/README.md`, `apps/cli/scripts/packages.ts` and what it generates, the server's instructions, the sponsored tool's text, `docs/01`, `docs/12` | done, not merged (`docs/tasks/69`) |
| The landing page's headline, label and five sentences in its scenes, `apps/web/src/pages/Landing.tsx` | done, not merged |
| The deposit scenes ("how a reputation grows", "each agent that supports it after you pays more") | not changed: they state the deposit mechanism, and a redesign is the user's decision |
