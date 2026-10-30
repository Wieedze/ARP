# docs/design

One folder per thing designed. Every reference page is a self-contained HTML file to open in a
browser; everything marked `sample` in one is invented and must never ship.

| folder           | what it is                                                                          | state                                                                |
| ---------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `brand/v1/`      | "The Source" identity: tokens, logo, sigils, radii. `HANDOFF.md` is the contract    | built, ADR `0057` (its §8, screens and routes, deliberately not)     |
| `brand/v2/`      | the same handoff five days later: final landing, `agent-page.html`                  | reference                                                            |
| `motion/`        | the landing's scene sequence, `MOTION-V2.md` + `index.html`                         | built, task 29, ADRs `0066`-`0070`                                   |
| `claim-field/`   | the shared `ClaimField`: `v1-handoff.md`, `v2/` (loupe), `v2-ring-names/` (no legend) | built, `53c022c`; the repo is ahead of `v2-ring-names/`              |
| `pages/`         | the atom pages `tool/`, `skill/`, `repo/`, and `agent/` (docs/16's order)           | skill and repo built; tool and agent not — `docs/tasks/34`           |
| `cli-surfaces/`  | `arp status`, `arp init`, the session line, the badge spec                          | not built — `docs/tasks/34`                                          |
| `cli-v0/`        | `packages/cli` week 1: hook, SQLite, `arp status`, as a patch and as plain files     | not applied — `docs/tasks/34`, and task 33 names the same package    |
| `readme-badges/` | the README badge SVG generator, tested                                              | deferred to the production release                                   |

`claim-field/*/` and `cli-v0/` were built against `feat/agent-panel-tabs` at `b5682d9`, before
`app/` became `apps/web/`: their patches do not apply to the current tree as they are.
