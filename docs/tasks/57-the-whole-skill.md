# Task 57 — The whole skill: its directory, under one receipt, for a runtime that can run it

**Status:** **BUILT**, 2026-11-02, branch `feat/57-skill-bundle`.
**Depends on:** task 31 (the content path), task 55 (project mode).
**Rules:** `code.md`, `security.md`, `claims.md`, `workflow.md`.
**Reviewers:** `task-verifier`.

---

## 1. Why

Task 54's pre-pilot reading (§4b, finding 1) showed that ARP delivered a skill's `SKILL.md` alone,
while the best skills need the files beside it. Anthropic's `pptx` calls five scripts in its own
`scripts/`, and its `pdf` sends form filling to `FORMS.md` and a script. `npx skills add` installs
the whole directory. The user decided on 2026-11-02 (« ok super ») that Claude Code gets the whole
directory and the Claude Desktop extension does not, because Chat runs no script.

**Size, read 2026-11-02 from GitHub's tree API:**

| skill | files | size |
| --- | --- | --- |
| `youtube-thumbnail-design` | 1 | 9 KB |
| `anthropics/skills` pdf | 12 | 57 KB |
| `anthropics/skills` pptx | 56 | 1,112 KB |
| `anthropics/skills` docx | 61 | 1,102 KB |
| `larksuite/cli` lark-slides | 50 | 1,588 KB |

For pptx, 954 KB of that is 39 Office XML schema files. The files go to disk, and Claude still reads
only `SKILL.md` unless it needs a script, so the directory adds no tokens.

## 2. What shipped

- **`serveSkillBundle`** (`packages/protocol/src/content-bundle.ts`). It serves every file of the
  skill's directory, and no file of a neighbouring directory. The receipt is the existing type:
  `path` is the directory, and `digest` is sha256 over a manifest, one `<sha256 hex>  <path>` line
  per file, sorted by path, which is `sha256sum`'s format. **`bundleMatchesReceipt`** rebuilds the
  manifest from the files received, so the signature covers every byte. It refuses a file that is
  changed, missing, added, or has a path leaving the directory.
- Caps: 300 files, 8 MB in all, and 1 MB per file, the existing cap.
- **`GET /content/:atomId?bundle=1`** (`apps/mcp/src/content.ts`) returns JSON with each file in
  base64 and the receipt in `x-arp-receipt`. Without `bundle=1`, nothing changes.
- **`arp_get_skill` in project mode** (`ARP_SKILLS_DIR` set, task 55) asks for the bundle, verifies
  it, and writes every file under `.claude/skills/<name>/`. Its answer gives the file count. The
  Desktop extension is unchanged.
- The sponsor is unchanged. It checks the receipt's signer, chain and caller, not its path, so a
  bundle receipt backs a deposit like a single file's.

## 3. Measured

Testnet 13579, 2026-11-02, a content server built from this branch on port 3012, one fetch of
`anthropics/skills` pptx with `bundle=1`, no transaction: 56 files, 1,139,175 bytes decoded, 1.5 MB
of JSON. The signature verified, `bundleMatchesReceipt` was true, and false after one byte of one
file was changed.

## 4. Known limits

- The running content server must be restarted from a build that has this, or `bundle=1` is
  ignored: the old server answers SKILL.md as plain text, and `arp_get_skill` in project mode fails
  on reading it as JSON.
- A skill installed this way is not executed by ARP. Claude Code runs its scripts, as it would after
  `npx skills add`.
- Installing overwrites files of the same names under `.claude/skills/<name>/` (task 55 §4).

## 5. Do not do in this task

- Send scripts to the Desktop extension.
- Cache the bytes. The content path passes them through (`docs/tasks/31` §9).

## 6. Evidence ladder

Tier 3 (staked): a declaration's receipt now covers what the agent actually installed, not just its
instructions. It is still access, not use (`docs/14`).
