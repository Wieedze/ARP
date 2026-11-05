# 0145 — The published CLI carries viem and has no dependency

**Status:** Accepted
**Date:** 2026-11-05
**Triggered by:** the user's test of a real plugin install. A first session that ended while `npx` was still downloading left a broken cache, and every later session failed with `arp: not found`. The user asked how others cope, and chose this over a larger plugin. `docs/tasks/70`.

## Context

The plugin runs `npx -y @arp-protocol/cli@0.0.1 mcp` (ADR `0089`). `npx` installs into `~/.npm/_npx/<hash>`, and an install killed part-way can leave the package there without `node_modules/.bin`, which later runs treat as installed. Other projects report the same symptom and clear the entry by hand ([tortoise #10287](https://github.com/daniel-ospina/tortoise/issues/10287), [termul #1413](https://github.com/gnoviawan/termul/issues/1413)). Our package depended on viem, so the window was long.

Measured 2026-11-05 by `scripts/measure/npx-kill.sh`, raw output `data/measurements/npx-kill-2026-11-05.jsonl`, in a clean container against a local registry: an install killed at a moment during its own length, then run again. With viem as a dependency, a clean install took 10.6 s, and 8 of 24 stayed broken (Wilson 95%: 19% to 53%). With viem in the bundle, 1.7 s on that run, and 0 of 17 (0% to 18%). A first hand run gave 6 of 12 and 0 of 12, with kills past the end of the short install, so it said less.

## Decision

`apps/cli`'s build bundles viem, and the package declares no dependency. `npx` and the thin plugin stay, as ADR `0089` decided.

**The launch line carries `--prefix /`.** A red-team pass proved that `npx -y <package>` run from a project executes that project's planted `node_modules/.bin/arp`, and takes its `.npmrc`'s registry. In a clean container both attacks ran without the flag and neither ran with it. The search, the same way, runs with its private home as `cwd` and prefix. Not tested on Windows.

## Alternatives considered

- **The server inside the plugin**, as the hook is, with no `npx`: no download at all, and the plugin would not need npm. It adds about 2 MB to the repository per version and departs from ADR `0089`. Available later if the measure above proves too optimistic.
- **Clearing a broken cache by itself:** a wrapper would have to run before `npx`, which is what it would repair.

## Consequences

**Positive:** a faster first start on every runtime, and a far narrower window for a broken cache.

**Negative:** the window is narrower, not closed. A viem security fix now needs a new CLI release, as the version was already pinned, it costs the same.

**Neutral:** the package is about 2 MB, 470 KB compressed.

## References

- Related ADR: `0089`
- Related doc: `docs/tasks/70-the-local-package.md`
