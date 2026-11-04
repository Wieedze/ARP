# 0133 — A search says when a skill cannot be fetched, and ranks it last

**Status:** Accepted
**Date:** 2026-11-04
**Triggered by:** the editing skills listed for the demo. The user, 2026-11-04: _« pourquoi arp envoie
des agents vers un téléchargement refusé »_, then the decision below.

## Context

A repository can hold several differing copies of one `SKILL.md`. The content server refuses those
with a 409, deliberately (`packages/protocol/src/content-path.ts`). The search never knew:
`video-editing` from `affaan-m/ECC` came first on "edit video", marked only `file_not_read`, and an
agent that took it was refused. `scripts/measure/skill-layouts.ts` already held the fact.

Separately, `/list-tool` writes a skill's repository atom, which then reads as a tool. On "cut video"
`github.com/louisedesadeleer/cut-video` came first, above the skill it holds, with no `requires`.

## Decision

- `data/catalogue/skill-requires.json` carries `not_fetchable`, from the layouts measurement. A result
  shows `not_fetchable: true` and ranks after every skill an agent can fetch.
- A repository that holds catalogued skills stays out of the results, unless it is catalogued as a
  tool itself or an agent declared it.

## Why not

- **Hide it, as `skill-gone.json` does.** A gone skill no longer exists. This one exists, and hiding it
  would make the registry look smaller than it is, in a comparison whose point is the same catalogue.
- **Serve `skills/<name>/SKILL.md` when it exists.** It fixes `video-editing`, not `cut-silences` or
  `cut-mistakes`, whose copies are in `.agents/` and `.claude/`. It also changes what the refusal
  protects, so it is a separate decision.

## Consequences

`not_fetchable` is as fresh as the last measurement. A repository that changes afterwards can be
refused without being marked, or marked and then served. Five skills are marked as of the
`skill-layouts-2026-11-04T1046.json` measurement.
