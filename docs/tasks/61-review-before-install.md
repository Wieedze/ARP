# Task 61 — Review before install: a pinned version, a page of facts, and a human who accepts

**Status:** **plan**, 2026-11-03. Not started.
**Depends on:** task 31 (the content path), task 55 (project mode), task 57 (the whole skill).
**Rules:** `code.md`, `security.md`, `portability.md`, `claims.md`, `workflow.md`.
**Reviewers:** `intuition-integrator` (deliverable B), `task-verifier`.

---

## 1. Why

A friend of the user asked whether malicious skills and MCP servers exist and how ARP protects
against them. They do, and the honest answer exposed a gap in what ARP ships today.

In project mode (`arp init --sponsored`, `ARP_SKILLS_DIR=.claude/skills`,
`apps/cli/src/install/targets.ts:93-97`), `arp_get_skill` writes a skill's whole directory,
scripts included, under `.claude/skills/<name>/` (`apps/mcp/src/desktop/loop.ts:174-192`), and
Claude Code loads it from the next session on. Three things stand between a compromised repository
and that directory, and none of them is a person:

- **The receipt proves which bytes were served, not that they are safe.** A compromised upstream is
  served with a valid receipt.
- **The content is read at HEAD, not at a pinned commit.** `.claude/STATE.md`, task 31's row: "139
  have no file at HEAD". So the bytes installed are not necessarily the bytes anybody declared.
- **The only human gate is a sentence to the model.** `arp_get_skill`'s description says "tell the
  person what it will do first" (`apps/mcp/src/tools.ts:475-478`). That is an instruction, not a
  lock. Claude Code's permission prompt shows an `id`, not the skill.

Decided by the user on 2026-11-03 (« ok ça me paraît bien »): pin the version, show the facts,
make a human accept. Stripping scripts (Desktop's behaviour) was rejected for Claude Code, because a
`SKILL.md` alone can say `curl … | sh`, and stripping scripts breaks honest skills without stopping
malicious ones.

## 2. The line this task must not cross: facts, not verdicts

ARP publishes no score (`docs/12`, "Not a scorer"; ADR `0046`). A screen that says "suspicious" or
"well maintained" is a score, and it moves the responsibility the gate exists to hand back to the
person: a skill ARP did not flag becomes ARP's miss.

Every line on the screen is a fact anyone can re-derive, with its source and date:

| not this        | this                                                                         |
| --------------- | ---------------------------------------------------------------------------- |
| "suspicious"    | "2 executable files, 3 lines that call the network (`curl`, `wget`)"         |
| "maintained"    | "last commit 2026-10-12, repository not archived"                            |
| "popular"       | "14 distinct agents declared this commit, 3.2 TRUST behind it, 0 against"    |
| "trusted"       | "4,800 installs on skills.sh — skills.sh's figure, read 2026-10-28"          |

The figures in that table are illustrations, not measurements.

A pattern-match line ("lines that call the network") is a count of matches, printed with the
pattern and the matching lines. It never becomes a label. Where that boundary sits is the ADR this
task owes (deliverable E).

## 3. Deliverables

**A. A pinned version.** The skill catalogue records, per skill, the commit it was listed at. The
content server serves that commit and nothing else, and the receipt names it. A newer upstream
commit is a new version that has to be re-listed, never a silent substitution.

**B. Declarations that count per version.** "N agents used this commit" needs the version attached
to a declaration, or derivable from it. Two candidates, to settle with `intuition-integrator`
before building:

1. the version in the atom (one atom per commit): exact, but it splits a skill's standing across
   versions and multiplies atom fees;
2. the version in the receipt the declaration carries: the atom stays per skill, and the per-commit
   count is read from the receipts, so it is only as complete as the receipts that were published.

**C. The facts page.** For one skill at its pinned commit: repository, commit, date, file list with
sizes, executable files, pattern-match counts with the lines, the per-version figures from B, the
opposing side, and the third-party figures with their source and date. Built in
`packages/protocol/` (`portability.md`), rendered by whichever surface D picks.

**D. The gate.** Nothing is written under `ARP_SKILLS_DIR` until a person accepts. **The question
is always asked: there is no flag, setting or mode that turns it off** (user decision, 2026-11-03,
« la question doit toujours être posée »). A demo runs with the agent's permissions open and still
stops at this one question.

The rule that picks the surface: **a gate the model can operate is not a gate.** With permissions
open, the model makes a second tool call or runs a CLI command itself, so neither counts on its own.

1. **The client declares elicitation** → the server sends the facts page as an MCP elicitation,
   Accept or Decline. The model cannot answer it. Claude Code's CLI shows it as a terminal dialog
   (code.claude.com/docs/en/mcp.md). The one documented way to answer it without a person is an
   `Elicitation` hook the user installs themselves (code.claude.com/docs/en/hooks.md).
2. **The client does not declare it** → nothing is installed. The skill goes to `.arp/pending/<name>/`
   and the agent tells the person. The person runs `arp skills accept <name>`, which prints the
   facts page and reads `y/N` from the controlling terminal, not from stdin, so a model's
   non-interactive shell cannot answer it. **Untested idea**; prove it before relying on it.

Three things to test before building, read on 2026-11-03 and not confirmed:

- the VS Code extension: a third-party report says it declines elicitations silently;
- whether the dialog still shows with permissions bypassed — the docs do not say;
- Claude Desktop: likely unsupported, and it installs nothing anyway (task 57).

The cost on our side: `apps/mcp` handles `initialize`, `tools/list` and `tools/call` only
(`apps/mcp/src/server.ts:281-288`). It never reads the client's capabilities and never sends the
client a request, so the round trip has to be added, at least over stdio.

**E. An ADR** on where a fact ends and a verdict begins, and on a gate with no off switch.

## 4. Do not do in this task

- Write any label, score, colour or ranking that judges a skill. Section 2.
- Cache the bytes. The content path passes them through (`docs/tasks/31` §9). Pinning a commit is
  not caching.
- Run or sandbox the skill. ARP does not execute what it serves.
- Change the Desktop extension's behaviour. It gets `SKILL.md` alone and installs nothing (task 57).

## 5. Open questions, for the user

1. B1 or B2.
2. Settled for D: elicitation where declared, the pending folder otherwise. Open: the three tests
   listed under D.
3. Whether the pattern list in C ships at all, or the page shows only provenance and figures.
4. **Versioning, not started, user decision 2026-11-03.** Whether a version is only ARP's digest
   pin (A), also an atom on Intuition (B1), or also a publisher's name pointing at it — TNS
   (`github.com/Samoris/TNS`, an ENS fork on 1155) was looked at as that layer. Read on 2026-11-03:
   its records can be overwritten, and its resolver's admin can rewrite any name's records through
   `trustedController`. So a name is at most a fact on the page, never the pin. No wiring until
   this is decided.

## 6. Evidence ladder

Tier 3 (staked), and it is what makes that tier honest for skills: today a position on a skill
backs whatever the repository holds at HEAD. With a pinned version it backs the bytes that were
used, and the person installing sees how much stands behind exactly those bytes before accepting.
