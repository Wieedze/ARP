# Task 52 — When memory falls short: does ARP find a skill Claude does not know?

**Status:** **BUILT**, 2026-11-02, branch `feat/52-memory-falls-short`.
**Rules:** `code.md`, `claims.md`, `workflow.md`.
**Reviewers:** `task-verifier`.

---

## 1. Why

Task 45c and task 51 found that consulting ARP costs more tokens than letting Claude answer from
memory. The user then named what they want to show instead: _« Quand la mémoire ne suffit pas. Un
outil récent, ou un skill installable qu'il ne connaît pas : sans ARP, il se trompe, ou il cherche
longuement. C'est ce que je veux démontrer »_. On 2026-11-02 they chose the pass criterion: the
95% intervals of "names a skill or MCP server that exists" must not overlap, with ARP above, and ARP
must invent no more.

## 2. What shipped

`scripts/measure/discovery-eval.ts --suite install` adds:
- **14 needs the catalogue has a skill for.** Each was checked with `arp_find_tools` on testnet
  13579 before the run. Each is asked as the user's tester would: "… I use Claude. What can I
  install so that you can do it yourself?".
- **A check on every reference in an answer.** Each GitHub repository, npm package and pip package
  it names is looked up with `gh api`, the npm registry and PyPI. A name that does not exist counts
  as invented. One that exists counts as a skill or an MCP server when ARP's catalogue holds it,
  when skills.sh lists skills from that repository, or when its name says `mcp`.
- A judge question for this suite: which answer better tells the person what to install so the
  assistant can do the job itself.
- Tests for the reference extraction, in `scripts/test/discovery-eval.test.ts`.

## 3. Measured

Sonnet for the agent and Opus for the judge, 14 needs × 3 reps × 2 arms, 84 runs and 0 failed.
The run was made from the working tree on top of `3ef1b1f`. The code that ran is committed with this
file, plus one line added after the run that prints the judge's interval. The agent runs cost $2.31; the judge
calls are not costed. The raw output is `data/measurements/discovery-eval-install-2026-11-02.jsonl`.
The figures below come from `discovery-eval-install-2026-11-02-recheck.jsonl`: the same answers,
with references read by the corrected extractor (`--recheck`, no agent run; see "How the count was
corrected"). Re-derive them with `bun run scripts/measure/discovery-eval.ts --summarise <that file>`.

| | with ARP | without |
| --- | --- | --- |
| names a skill or MCP server that exists | 40 of 42, 95% 84% to 99% | 6 of 42, 95% 7% to 28% |
| names anything installable that exists | 41 of 42 | 27 of 42 |
| names one that does not exist | 0 of 42, 95% 0% to 8% | 0 of 42, 95% 0% to 8% |
| tokens per run | 33,151 | 6,391 (ratio 5.19, 95% 4.23 to 6.23) |
| judged better | 16 of 42, 95% 25% to 53% | 26 of 42 |

**The criterion passes.** Without ARP, Claude named a skill or an MCP server in 6 of 42 answers:
- Anthropic's own `anthropics/skills`, for slides (2) and PDF (1);
- the ElevenLabs MCP server, for the voiceover (1);
- `@playwright/mcp`, for the website video (2).

In most of its other answers it named libraries (Pillow, ffmpeg), SaaS products (Canva), or a
generic "image-generation MCP server" with nothing to install, and offered to build the thing
itself. With ARP it named a skill or an MCP server in 40 of 42: `higgsfield-youtube-thumbnail` for
thumbnails, for example.

**What it does not show:**
- **That the skills it found are better.** The judge preferred the answer without ARP in 26 of 42
  pairs. The judge reads the answers and cannot install a skill or check that it works.
- **That it costs less.** It costs 5.19 times the tokens: the agent reads the repositories it found
  before recommending them.
- **Anything about a need ARP does not cover.** The 14 needs were chosen because the catalogue
  covers them.

**How the count was corrected, and what changed after looking at answers.**
- A first launch was aborted and its partial output deleted, so it cannot be re-checked. Pip
  extraction and the skill or MCP classification were added before the full run, because the smoke
  answers named pip libraries the first extractor ignored.
- After the full run, the first verification found that the extractor read only the forms the ARP
  arm uses. Those are full GitHub URLs, which ARP returns. It missed the forms an answer from memory
  uses: a bare `owner/repo`, `/plugin marketplace add` and `uvx`. That undercounted only the arm
  without ARP. The first count read 2 of 42 there. The extractor now reads all of these forms, and
  the same answers were re-read into the recheck file.
- One rule was added after looking at the re-read answers: a backticked `skills/pptx` is a folder
  inside a repository, not a repository, so common folder names are excluded. Without the rule,
  three ARP answers counted as invented.

Limits of the check:
- A tool named only by its name ("Pillow"), with no repository, package or install command, is not
  counted, in either arm.
- "In ARP's catalogue" counts as a skill or MCP server, which is ARP's own list by construction. A
  library the catalogue lists counts too: `remotion`, in the arm without ARP, in a run already
  counted for `@playwright/mcp`. The ARP-arm hits spot-checked by the verifier are skill
  repositories.
- The judge's blinding is partial: an answer citing a registry can be told apart.

## 4. Do not do in this task

- Install or run a skill the eval finds. They are third-party code.
- Claim a token saving or a better answer from this run.

## 5. Evidence ladder

Tier 3 (staked): it measures whether an agent reaches skills through the registry where
declarations are staked. It does not move ARP up the ladder.
