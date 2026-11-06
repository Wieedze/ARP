# 0145 — The published CLI carries viem and has no dependency

**Status:** Accepted. Amended 2026-11-06 for the Claude Code plugin, at the end: it no longer goes through `npx`.
**Date:** 2026-11-05
**Triggered by:** the user's test of a real plugin install. A first session that ended while `npx` was still downloading left a broken cache, and every later session failed with `arp: not found`. The user asked how others cope, and chose this over a larger plugin. `docs/tasks/70`.

## Context

The plugin runs `npx -y @arp-protocol/cli@0.0.1 mcp` (ADR `0089`). `npx` installs into `~/.npm/_npx/<hash>`, and an install killed part-way can leave the package there without `node_modules/.bin`, which later runs treat as installed. Other projects report the same symptom and clear the entry by hand ([tortoise #10287](https://github.com/daniel-ospina/tortoise/issues/10287), [termul #1413](https://github.com/gnoviawan/termul/issues/1413)). Our package depended on viem, so the window was long.

Measured 2026-11-05 by `scripts/measure/npx-kill.sh`, raw output `data/measurements/npx-kill-2026-11-05.jsonl`, in a clean container against a local registry: an install killed at a moment during its own length, then run again. With viem as a dependency, a clean install took 10.6 s, and 8 of 24 stayed broken (Wilson 95%: 18% to 53%). With viem in the bundle, 1.7 s on that run, and 0 of 17 (0% to 18%). A first hand run gave 6 of 12 and 0 of 12, with kills past the end of the short install, so it said less.

## Decision

`apps/cli`'s build bundles viem, and the package declares no dependency. `npx` and the thin plugin stay, as ADR `0089` decided.

**The launch starts from outside the project.** A red-team pass proved that `npx -y <package>` run from a project executes its planted `node_modules/.bin/arp` and takes its `.npmrc`'s registry. `--prefix /` stopped those two, and a later review proved it was not enough: npm keeps the project's `node_modules/.bin` on `PATH`, so a planted `node` or `npx` still ran. So the launch line is `sh -c 'export ARP_PROJECT_DIR="$PWD"; cd / && exec npx --prefix / ...'`, the server resolves what it writes in a project against that directory, and the search removes such an entry from `PATH`. Both planted programs were replayed against it in a clean container, and neither ran. It needs `sh`, and it is not tested on Windows.

**A short fetch limit, not `--prefer-offline`.** That flag made the start fast with no network, and a stale cached list then refused a new pinned version (`ETARGET`), which would have broken the first upgrade. `--fetch-retries=0 --fetch-timeout=5000` runs a new version, and with a dead registry runs the cached one in 0.3 s to 5.3 s.

## Alternatives considered

- **The server inside the plugin**, as the hook is, with no `npx`: no download at all, and the plugin would not need npm. ~~It adds about 2 MB to the repository per version~~ (never measured, and wrong: see the amendment) and departs from ADR `0089`. Available later if the measure above proves too optimistic. Chosen 2026-11-06.
- **Clearing a broken cache by itself:** a wrapper would have to run before `npx`, which is what it would repair.

## Consequences

**Positive:** a faster first start on every runtime, and a far narrower window for a broken cache.

**Negative:** the window is narrower, not closed. A viem security fix now needs a new CLI release, as the version was already pinned, it costs the same.

**Neutral:** the package is about 2 MB, 470 KB compressed.

## Amendment, 2026-11-06: the plugin carries the CLI

**Triggered by:** a real test, which showed four problems with the plugin's launch through `npx`, and a tester round that comes before any npm release. Four sessions starting together on an empty cache failed 17 times of 80 (Wilson 95%: 14% to 31%; the test's raw output is not committed). A very slow first download failed. The launch needs `sh`. And a tester would need the package on npm.

**Decision.** The plugin holds `bin/arp.js`, the whole CLI in one file with no dependency, built by `bun run packages`, and `.mcp.json` runs `node ${CLAUDE_PLUGIN_ROOT}/bin/arp.js mcp`. This departs from ADR `0089`'s thin manifest for Claude Code only. Gemini and `arp init` stay on `npxLaunch`, and the section above still holds for them. The npm package does not carry the file, as it is built apart from `dist/`.

Nothing is fetched and no `npx` runs the server, so the project stays the working directory, `ARP_PROJECT_DIR` is not set, and no `node_modules/.bin` joins `PATH`. `arp_pulse`'s search still runs `npx skills`, so a tester needs what comes with Node, and the network, for that one call.

**Measured** by `scripts/measure/plugin-start.sh` at `562b98f`, raw output `data/measurements/plugin-start-2026-11-06.jsonl`, in a container with no network, Node 22.23.4, with an empty `HOME`. A session is the launch line, then `initialize` and `tools/list`.

| | |
| --- | --- |
| Start, alone, 20 runs | 123 to 136 ms, median 127 |
| 4 sessions at once, 20 rounds | **0 failures of 80** (Wilson 95%: 0% to 5%), 105 to 153 ms |
| `bin/arp.js` | 2,023,282 bytes, 470,967 gzipped |
| A later version in the repository | 21 KiB once packed: 448 KiB with one version, 469 with a second, from `fb07a89` of 2026-11-05, 3,449 lines apart. 573 KB until `git gc` |

So the 2 MB above was the file's size, not its cost. The cost comes with every commit that changes the bundled code, not only each release, since `packages --check` requires the file to match. The two test setups differ, as the plugin has nothing to fetch, so 0 of 80 says the failure's cause is gone, not that one line is faster than the other.

**Three things found on the way.** Node refused the file under a parent `package.json` with `"type": "commonjs"`, and under Node 22.0 with no `package.json`, so `bin/package.json` says the files are modules, the hook included. The bundle's path comments depend on the working directory, so the build runs from `apps/cli`, or `--check` reads as stale from elsewhere. A plugin installed from a local path is read from that path and not copied (`claude plugin list`: "Read from"), so moving the checkout breaks it.

**Not tested:** Windows. The server's launch no longer needs `sh`, while the hook's command line and the search's `npx` have not been run there. Grok Build reading `${CLAUDE_PLUGIN_ROOT}` in `.mcp.json` has not been run either.

**Sharing from the plugin.** `/arp:share`, `/arp:share-on`, `/arp:share-off`, `/arp:share-send` and `/arp:line` carry `disable-model-invocation`, and each allows its exact command line. Asked to invoke `share-send`, a real session's model got a refusal from the Skill tool. What this does not stop: a model can try the same line through `Bash`, and that rests on the session's permissions.

## References

- Related ADR: `0089`
- Related doc: `docs/tasks/70-the-local-package.md`
