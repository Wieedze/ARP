# Task 68 — The field memory: a failure the hook sees, read back at the next search

**Status:** phases 1 to 4 complete 2026-11-05, `task-verifier` PASS on the third pass, post-mortem `.claude/learning/59-the-field-memory.md`, ADR `0140`. Phases 5 and 6 are separate work, not started.
**Asked by:** the user, 2026-11-05: « go », « je veux surtout avoir un produit fonctionnel sans fioriture qui marche », « sans résidu inutile », no publishing for now.
**Rules:** `code.md`, `workflow.md`, `claims.md`, `portability.md`.

---

## 1. The loop

1. A skill's command fails. The hook writes one line to `~/.arp/failures.jsonl`, with no action from the agent.
2. The next `arp_pulse` shows that failure on that skill, so the agent does not repeat it.
3. Later, some lines go to testnet 13579 through the existing form B declaration. On testnet everything is a test, so a line is not marked separately (the user, 2026-11-05).

## 2. Phases

| # | What | State |
| --- | --- | --- |
| 1 | `apps/hook/src/skill-failure.ts`: a failed Bash command counts only if a skill of this session asks for it and its output shows `missing-key`, `missing-program` or `missing-file` | built and walked; run `cd apps/hook && bun test` for the count |
| 2 | `packages/protocol/src/local-failures.ts`: reads the file for one skill | built, with tests |
| 3 | `arp_pulse` shows `failed_on_this_machine` on a skill | built, walked |
| 4 | `arp backfill`: the same rule over old Claude Code transcripts (`apps/hook/src/backfill.ts`). Read once on the user's transcripts, into a throwaway home; Codex left out, no session to test it on | built, with tests |
| 5 | A shorter `arp_pulse` answer by default | not started, out of this task's close |
| 6 | Send chosen lines to testnet | not started, out of this task's close |

## 3. Decisions

- **Only failures are automatic.** No error does not mean the skill did the job, so the hook never writes `worked`.
- **`~/.arp/`, not the project's `.arp/`,** because a key or a program missing here is missing in the next project too.
- **The line holds a closed reason,** never the command or its output. A session stops nothing if the record fails.
- **It does not touch the score.** Its weights are the user's (`docs/tasks/66` §7). `arp_pulse` shows the failure and the agent reads it.

## 4. Walked

2026-11-05, Claude Code 2.1.318, model haiku, one session, a throwaway skill naming a program that does not exist, the hook wired through `--settings` in an isolated folder. `failures.jsonl` received one line, `reason: missing-program`, with neither the command nor its output. One session on a made-up skill: it shows the wiring works, not how often real skills fail.

**The backfill**, same day, into a throwaway `ARP_HOME`: 185 transcripts, 18 skill uses, 1 failure, which was the session above. That session's transcript was then deleted as a test leftover, so a run today finds no failure. So it read Claude Code's real transcript format, and on this machine it fills almost nothing: it gives a history only to someone whose transcripts hold failures.

**The whole loop**, same day, with the built `apps/cli/dist/cli.js` under Node and a throwaway `ARP_HOME`: `arp hook` fed a skill call and a failed command, then `arp mcp` over stdio answered `arp_pulse` with `search_output` naming `anthropics/skills@pdf` and `@docx`. `pdf` carried `failed_on_this_machine: {reasons: {missing-program: 1}, matched_by_name_only: true}`, and `docx` carried nothing. The payloads were written by hand; the real payload is the Claude Code session above. No real agent has yet read the line and changed its choice.

**A defect found on the way:** the first version imported `arpHome` from `@arp-protocol/core/node`, which pulled viem into a hook that must start with nothing installed, so the packaged hook crashed outside the repo. All 47 hook tests passed, as the repo has viem. It now restates `arpHome` in 4 lines, and a test in `apps/cli/test/cli.test.ts` refuses any non-`node:` import in the packaged hook.

## 5. Known limits

- A plugin's skill is not looked for, as where a plugin keeps its files was not tested.
- A command with several parts counts if any part is asked for, since the hook cannot tell which part failed.
- A reason is a text match on the output, so output that merely mentions it can mislabel: `expected status 403, got 200` reads as `missing-key`.
- A skill that fails with no error, or an error outside the three reasons, leaves no line.
- **A live line's source** comes from the session's log or its search, else from what the machine says without doubt: `~/.agents/.skill-lock.json` or a receipt (ADR `0140`). 0 of 24 `Skill` inputs in this machine's transcripts carry one on 2026-11-05 (`grep -rhoE '"name":"Skill","input":\{[^}]*\}' ~/.claude/projects --include='*.jsonl'`, then count those holding `"source"`), which is why the lock file matters. Two sources for one name stay unknown. With none, the line matches by name and says so, and a namesake in another repository would show the same failure. `arp backfill` does not read the lock file, as what is installed today may not be what ran then, so its lines keep `source: null`.
- **A line's domain with no search** is a closed word in the person's words, else the catalogue's table on the skill's name and description (`packages/protocol/src/skill-domains.ts`), else none. It is a table, so it can be wrong, and a wrong word goes public if the person shares the line after reading it in `arp share on`. Measured below.
- Only Claude Code: the other runtimes' payloads wait on task 33i.
- How often skills fail is not known. The local transcripts are too few to say.
- **Attribution lasts the whole session, by program:** a skill naming `git` or `gh` takes a later unrelated failure of that program. Stated rather than bounded, for now (ADR `0140`).
- A command run from another folder than the session log's loses its record, as the log is looked up under the payload's `cwd`.
- Only the first 4000 characters of an error are read, so a reason after them is missed.
- `bash -c "x"` and `sudo x` are not recognised as asked, and a quoted `a | gh b` counts as `gh`.
- Two failures at the same instant can write one line twice, found by reading the code and not tested.

### The table's coverage, 2026-11-05

    bun run scripts/measure/skill-context-coverage.ts

Offline, on the table's last step only: a person's words and a search's domain come first and are not counted. Two populations, not added. A fixed sample of 40 distinct names of what each placed was read by hand, and the script prints each verdict.

| Population | Get a domain | Wrong in the sample |
| --- | --- | --- |
| The catalogue, whole, name and description | 575 of 671 | 6 of 40 (Wilson 95% 7% to 29%) |
| `skills@1.7.6 find` on 12 needs chosen by hand, names only | 720 of 1156 | 6 of 40 (Wilson 95% 7% to 29%) |

The second is not the market: the needs lean towards categories the table has, and it has no description where the hook would. Its doubtful names were read from their `SKILL.md`, except `fleet-management` and `list-hygiene-monitor`, whose file was not found and which were judged by their repository (`grafana/skills`, `aaron-he-zhu/aaron-marketing-skills`).

The errors have two causes the table's header already names. A word in prose: `agent-browser` is `video` for "record video", `scaffold-exercises` is `quality` for "pass linting". A name word caught at the start of a longer word: `codex-pet` is `development` for "code", `service-helpagent-coordinate` is `method` for "help". The table was not changed for them, since it also decides tags.

**The move changed four catalogue results**, from `markdown` as a name word: `web-to-markdown` from `browser`, `lark-markdown` from `collaboration`, `markdown-token-optimizer` from `method`, `webpage-to-markdown` from none, all to `document`. Tags already on chain were written by the older table, and no seed was run, so `scripts/verify/audit-skill-tags.ts` can now disagree with them on these.

## 6. Evidence ladder

It serves **asserted**, and it does not move ARP up the ladder (`docs/09` §3). The line is the runtime's record of a failure rather than the agent's recollection, but it is kept locally and can be forged. What it adds is the first thing a writer gets back.

## 7. Does an agent take the line into account? Rules written before the first run

**Asked:** the user, 2026-11-05, relayed by arp-f3: yes to a test with a real agent over a few sessions, the rules written first, a cap per session, the total cost in the result.

**Script:** `scripts/measure/field-memory-eval.ts`. The list it uses is `data/measurements/field-memory-list-2026-11-05.txt`, 3 on-topic results, in their order, from `npx skills@1.7.6 find "webpage to markdown"`. It was the first 10 until just before the first run: reading one skill costs 2 calls of GitHub's anonymous 60 an hour, so 10 skills over 10 sessions would have made later sessions read less than earlier ones. The script waits for that quota between sessions for the same reason. Raw output goes to `data/measurements/`.

- **Setup.** `claude -p`, model `sonnet`, the built `arp mcp` as its only MCP server, `arp_pulse` as its only allowed tool, a throwaway `ARP_HOME` and working folder. The agent passes the fixed list as `search_output`, so both arms read the same results.
- **Arm B, first, 5 sessions, no failure on the machine.** The skill picked most often becomes the planted skill. A tie goes to the earliest in the list.
- **Arm A, then, 5 sessions.** One line in `failures.jsonl` on the planted skill, `missing-program`, no source, as a real line usually has. The line is planted: this tests whether an agent reads the field, not whether real lines are good.
- **The question asked:** which one skill it would install, as `source@skill` on its last line, installing nothing. The prompt does not mention failures.

**What is read, by script, from the final text:**

| Measure | Rule |
| --- | --- |
| Primary: it says so | The answer holds `failed`, `failure`, `missing-program` or `failed_on_this_machine` |
| Secondary: it chooses otherwise | The last line is not the planted skill |

**Verdict, fixed now:**

- **Worked:** at least 4 of 5 arm A sessions meet the primary measure, and at least 4 of 5 arm B sessions do not.
- **Did not work:** at most 2 of 5 arm A sessions meet it.
- **Unclear:** anything between, written so.
- **Not valid:** arm B picks the planted skill in fewer than 3 of 5, or more than 2 of the 10 sessions return no choice. There is then no default to move, and the result says that.

Choosing otherwise is reported and sets no verdict: a missing program can be installed, so keeping the skill and warning about it is a good answer.

**Limits, stated now.** n is 5 per arm, and task 64's same arm moved from 1/5 to 4/5, so this checks that the wiring reaches an agent's decision. It is not an effect size. The line is planted, one need says nothing about others, and the word match can count a sentence about something else, so the answers are read by hand too.

**Caps.** `--max-budget-usd 0.50` per session, and the script stops if the total passes $5.

## 8. Result of the agent test

Run 2026-11-05, `data/measurements/field-memory-eval-20261105T1743.jsonl`, `sonnet`, **$0.80 in total** for 10 sessions. **Verdict by the rules of §7: worked.**

| Arm | Sessions | Names the failure | Picks the planted skill |
| --- | --- | --- | --- |
| B, nothing on the machine | 5 | 0 | 5 (`jimliu/baoyu-skills@baoyu-url-to-markdown`) |
| A, one planted line | 5 | 5 | 0 (all 5 pick `easyzoom/aix-skills@webpage-to-markdown`) |

5 of 5 is Wilson 95% 57% to 100%. Every arm A answer was read by hand: each sentence the word match counted is about this failure, and 3 of the 5 repeat that it matched by name only.

**What it shows:** the field reaches an agent's decision, and an agent reports it without being asked.

**What it does not show:**

- **That the new choice is better.** No skill was run. This is about reading, not about results.
- **That a line is right.** The line was planted. One line moved 5 of 5 choices, even when the agent said it might be another repository's skill. So a wrong line, which §5 says can happen, would move a choice as easily. That matters little for a person's own machine and much more before any line goes public (phase 6, `docs/tasks/67` §9).
- **Anything general.** One need, three skills, with a good alternative in the list. 41 scripts on the planted skill may have made the agent readier to leave it.

