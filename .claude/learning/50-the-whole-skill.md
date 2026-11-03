# 50 — The whole skill: its directory, under one receipt, for a runtime that can run it

**Task:** `docs/tasks/57-the-whole-skill.md`
**Completed:** 2026-11-02
**Commit:** `e7ce712` (branch `feat/57-skill-bundle`, on top of `01fd3d8`)
**Verifier verdict:** PASS (second pass. The first failed on a manifest forgery and three stale sites)

## What shipped

- `packages/protocol/src/content-bundle.ts`: `serveSkillBundle`, `bundleManifest` (`sha256sum` format, sorted by path), `bundleMatchesReceipt`, `isSafeRelativePath`. Caps: 300 files, 8 MB total, 1 MB per file. Tests in `test/content-bundle.test.ts`.
- `apps/mcp/src/content.ts`: `GET /content/:atomId?bundle=1` returns JSON with each file in base64 and the receipt in `x-arp-receipt`. `refusal` gains `too-many-files`.
- `apps/mcp/src/desktop/loop.ts`, `handlers.ts`: in project mode (`ARP_SKILLS_DIR` set), `getSkill` asks for the bundle, checks the signature, the manifest, the caller and that SKILL.md is present, then writes every file. Desktop mode is unchanged.
- `packages/protocol/src/receipt.ts`: `path` and `digest` are documented for both cases, a single file or a directory.
- Docs: task 57. `docs/01` §positioning says what is served where. In `docs/22`: the sponsored-mode key (two transactions plus two typed-data messages), a sponsored-mode file list, two more outbound hosts, and the bundle route. Status lines in tasks 54 and 55. A restart note in `docs/26`.

## Surprises

- The manifest is not injective when a path may hold `\n`. One file named `a\n<sha(E)>  b` gives the same manifest as the two files `a` and `b`. Git allows such names. The fix is in `isSafeRelativePath`: no control characters. `\0` alone was not enough.
- Case-folded duplicates (`SKILL.md` beside `skill.md`) are one file on macOS. The client refuses them. The server still signs such a bundle, so it fails closed at install.
- A receipt type with two meanings for `path` needed its type docs changed. Without that, a stranger following `receipt.ts`'s "fetch `path`, run `sha256sum`" gets a 404 on a directory.
- Adding a sponsored-mode paragraph to `docs/22` contradicted the "Nothing is written to your home directory" list 30 lines further down. The paragraph was right, but the section it sat in was not updated with it (`claims.md` check 5).

## Decisions made

- **Claude Code gets the directory, Desktop does not.** User decision 2026-11-02: Chat runs no script.
- **Reuse `ContentReceipt` rather than add a bundle type.** The sponsor checks signer, chain and caller, not path or digest, so a bundle receipt backs a deposit unchanged. The cost is that `path` now means two things. Its type docs say so. No ADR.

## Rules touched

- `.claude/rules/security.md`: sufficient. No new signature site, since this is the same EIP-712 receipt.
- `.claude/rules/claims.md`: sufficient. Check 5 caught `docs/01`'s "Only that file" and `docs/22`'s file list.

## Suggestions for future tasks

- When a hash runs over a text encoding of many items, check that the encoding is injective before trusting the signature. Separators in user-controlled names are the usual way it breaks.
- `raw()` reads a whole file before the cap check. `listing()` discards the tree API's blob `size`, which could refuse a file before it is fetched. Not done.
- No `desktop.test.ts` case covers a bundle with a `../` path reaching the write loop. Only the protocol-level gate is tested.
- The manifest's sort is by JS string compare, so a stranger re-deriving it should use `LC_ALL=C sort` for non-ASCII paths.
