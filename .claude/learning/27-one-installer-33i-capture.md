# 27 — One installer, 33i (first half): `arp hook --capture` and `arp init --capture`

**Task:** `docs/tasks/33-one-installer.md` §4 33i. Capture tooling only. Per-runtime adapters wait on real captures from the user.
**Completed:** 2026-10-30
**Commit:** uncommitted
**Verifier verdict:** PASS, on the second pass

## What shipped

- `apps/hook/src/capture.ts`: `redact()` denies by default and `capture()` never throws. At the top level it keeps listed naming strings, numbers and booleans, and a URL keeps only its scheme and host. At every deeper level, strings become `<string:N>` and numbers `<number>`, booleans are kept, and a key is kept only if it is identifier-shaped (otherwise `<key:N>`).
- `apps/hook/src/hook.ts`: `--capture` writes to `~/.arp/captures/` before normal processing.
- `apps/hook/test/capture.test.ts`: the five leak probes from the first pass, plus two tests for what must be kept. One end-to-end test in `hook.test.ts`.
- `apps/cli/src/install/edits.ts`: `HookSpec` (nested or flat), `withHooks`/`hooksOf`/`hasHooks`. `CLAUDE_HOOKS` keeps the 33c behaviour.
- `apps/cli/src/install/targets.ts`: capture hooks for Codex, Gemini (one combined edit), Cursor and Copilot (new runtime). A plain `init` removes leftover capturing hooks (`noHook`). A config left as `{}` is deleted, and its backup is kept.
- `apps/cli/src/install/commands.ts`: `--capture`. `uninstall` names the captures directory and leaves it in place.
- Docs: the 33i section, the ADR `0090` status line, and STATE row 33.

Gates, re-run by the verifier: hook 33 pass, tsc 0; cli 30 pass, tsc 0.

## Surprises

- The first `redact()` was an allow-list of *content* fields, which makes it deny-by-exception. It leaked a URL password and token (`mcp_server_url` kept verbatim, against ADR `0090` line 39), nested `name`/`type`/`status` under unknown containers, numbers in responses, and data keys. The formats being captured are by definition unseen, so no list of content fields can be complete.
- A config can carry a credential in a field the hook's own code names (`mcp_server_url`). That is the same class ADR `0090`'s first FAIL was about, reintroduced one file over.

## Decisions made

- **Deny by default, with an explicit residue.** Kept: top-level numbers, booleans at every depth, identifier-shaped keys. The adapter needs the structure. Recorded in ADR `0090`'s status line as not the session log's rule.

## Rules touched

- `.claude/rules/security.md`: sufficient.
- `.claude/rules/claims.md`: sufficient. "Under the same rule" was a claim the code did not meet, caught on the first pass.

## Suggestions for future tasks

- **Residue to revisit before a capture leaves the machine.** An identifier-shaped key can still be data: an AWS key id (20 chars) or a `ghp_` token (40 chars) used as an object key matches `/^[A-Za-z_][A-Za-z0-9_]{0,39}$/`. The host of a URL is kept, so a credential-shaped subdomain survives. The operator reads each file before handing it over, and the module says so.
- **Wording nit, still open.** ADR `0090`'s status line says the session log "keeps none of" the residue. The session log does keep one top-level number, the call's duration (`apps/hook/src/payload.ts:84`). Fix it to "keeps only the duration".
- **Any redactor for an unseen format: write the probes first** (URL userinfo/query, nested naming keys, a top-level array, numbers, data keys). Each one broke the first version.
