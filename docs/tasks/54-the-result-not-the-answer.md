# Task 54 — The result, not the answer: what discovery without a prior search is worth

**Status:** **PLAN**, 2026-11-02. Nothing built. Decided with the user the same day.
**Depends on:** task 52 (`scripts/measure/discovery-eval.ts --suite install`, its 14 needs).
**Owner:** session arp-7f, who built the task 52 measurement.
**Rules:** `code.md`, `claims.md`, `workflow.md`.
**Reviewers:** `task-verifier`.

---

## 1. Why

Task 52 measured the **answer**: with ARP, Claude names a skill or MCP server that exists in 40 of
42 answers, 6 of 42 without (`docs/tasks/52` §3). A blind judge still preferred the answer without
ARP 26 times of 42, and it could not install or try anything.

The user then said what has to be shown instead (2026-11-02): the same question, asked by a user
who knows no skill and searches nothing, to Claude alone and to Claude with ARP. With ARP, Claude
finds a skill and uses it, and the **result** is better. The value is not the skill, it is the
discovery without a prior search: _« c'est le combiné découverte sans recherche préalable qui
compte, c'est un facilitateur »_.

## 2. The three arms

| Arm | What the user does | What it isolates |
| --- | --- | --- |
| **A · Claude alone** | asks the question, nothing else | the result from memory |
| **B · Claude + ARP** | asks the same question, nothing else | the result when Claude finds and uses a skill itself |
| **C · a manual search first** | searches skills.sh, picks, installs, then asks | the result a user could get without ARP, and what it cost them |

- **B against A** is the quality gain at the same user effort: none.
- **B against C** is the same result without the prior search, which is the facilitator.

## 3. What is measured

1. **The produced result, judged blind.** For each of task 52's 14 needs, the file or output Claude
   produces in A and in B (and in C), shown to a judge without the arm. Objective checks where the
   need has one: the PDF form is filled, the `.pptx` opens, the thumbnail has the right size.
2. **The user's effort.** What the user had to do or know: 0 actions in A and B; in C the steps to
   find, choose and install, and the time. C's search is done the way a user would do it, and how
   is written down before the run, not after.
3. **Cost per successful result**, per arm, with its interval: the profitability figure. Task 52's
   per-answer equivalent, for reference only: $0.039 per real skill or MCP server found with ARP
   against $0.128 without, from `discovery-eval-install-2026-11-02-recheck.jsonl` (1.55 $ / 40
   against 0.77 $ / 6).

## 4. What would make the demo wrong, and must be known first

- **C beating B.** A person can pick a better skill than the registry ranks first. If so, the
  claim is "as good without searching", and only if the numbers say so.
- **A matching B.** For some needs, Claude's own libraries may do as well as a skill. Report them
  per need, not only in aggregate.
- **Needs the catalogue covers.** The 14 were chosen because it does; say so next to every figure.

### 4b. Found by the pre-pilot reading, and the preconditions proposed (not decided)

The user chose a free reading with no execution before any paid pilot. Session arp-7f read the
SKILL.md of the top skills for the three needs that need no account (slides, PDF, landing page) on
2026-11-02, through the GitHub contents API and `arp_find_tools` on testnet 13579.

1. **ARP delivers SKILL.md only, and the best skills need their sibling files.** The content server
   serves that one file. `anthropics/skills` pptx references five scripts (`add_slide.py`,
   `clean.py`, `office/soffice.py`, `office/validate.py`, `thumbnail.py`) and `npm install
   pptxgenjs`; `anthropics/skills` pdf sends form-filling to `FORMS.md` and
   `scripts/fill_fillable_fields.py`. `npx skills add`, arm C's path, installs the whole directory.
   Run today, arm B would measure this defect, not the value of discovery.
2. **ARP's ranking can put a skill that needs an account first.** `query: "slide"` returns
   `lark-slides` (a Lark or Feishu account, `lark-cli auth login`); `query: "landing page"` returns
   `101-skills` landing-page-design (inference.sh's `belt` CLI, an account, paid image generation).
   `"presentation"` or `"pptx"` return `anthropics/skills` pptx.
3. **What skills.sh returns first:** "slide deck from notes" → `anthropics/skills` pptx; "fill pdf
   form" → `claude-office-skills` pdf-form-filler, a self-contained SKILL.md; "landing page" →
   `autonnel` landing-page-conversion-audit, then `pbakaus/impeccable`.
4. **"Needs no account" holds** for Anthropic's pptx and pdf and for pdf-form-filler. It does not
   hold for ARP's first landing-page result.

Proposed as preconditions of any paid run, **not decided by the user yet**:

- **(a)** the content server delivers the skill's whole directory, with one receipt over all of it;
- **(b)** a skill that needs an account or an external CLI is flagged in `arp_find_tools`.

Until (a) holds, a sentence that ARP "serves the skill" is true of its SKILL.md only.

## 5. Do not do in this task

- Claim a token saving: none has been established (tasks 45c, 51, 52).
- Compare ARP's search with skills.sh's: this measures the user's path, not two search engines.
- Change the catalogue or the ranking to improve the result.

## 6. Evidence ladder

It serves no tier directly: it measures whether a declaration's subject, the skill, changes an
outcome. It is what makes declaring worth doing for an operator, which is what moves agents onto
the **staked** tier.
