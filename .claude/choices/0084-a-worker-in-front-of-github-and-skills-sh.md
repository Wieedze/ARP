# 0084 — A Worker in front of GitHub and skills.sh, as a cache and never a source

**Status:** Accepted
**Date:** 2026-10-30
**Triggered by:** the user, 2026-10-30. They asked why the GitHub data was a snapshot, and how it could
be dynamic: _« on peut faire un mini back end si nécessaire »_. Then: _« fait le worker, j'ai un
compte, mais là on est en test donc on lance en local »_.

## Context

`apps/web/src/data/{skill-facts,repo-facts,skill-paths}.json` were built once by
`scripts/build-*` from measurements taken by hand on 2026-10-29. They are bundled and never
refreshed. A browser cannot read the sources itself. skills.sh sends no CORS header. The GitHub
API allows 60 requests an hour per visitor's IP, and a token must never ship to a browser. ARP had
no backend, and the Vercel config was deleted the same day.

A refresh cycle is 53 repository reads, 31 trees and 662 skill pages: 746 requests.

## Decision

`apps/api`, a Cloudflare Worker. It reads the three sources on a cron, keeps them in KV, and serves
them at `GET /facts` in the shapes the front already read from its bundle. Every value carries the
time it was read (`fetchedAt`), and the response names the URL family it came from.

- **Sliced.** A cycle runs 40 reads per invocation, with the cursor stored in KV. Each slice writes
  the three documents once, at its end. A finished cycle idles for `REFRESH_EVERY_HOURS` (24).
  This fits a Worker's subrequest ceiling and KV's daily write budget.
- **Failure keeps the old value.** A rate limit stops the slice on the unit that hit it, and the
  next slice retries that unit.
- **The front falls back.** `VITE_ARP_API_URL` unset, or a Worker that does not answer, means the
  bundled dated copy is shown, with its date.
- **Chain data does not pass through it.** It serves only third-party figures.
- **Local only for now.** `wrangler dev` under Node (wrangler refuses the Bun runtime), with a
  gitignored `.dev.vars` and no deploy.

## Alternatives considered

- **A daily GitHub Action that reruns the scripts and commits the JSON.** No server to run. But it
  is only fresh to the day, costs one commit a day in an append-minded history, and needs a
  redeploy to show anything.
- **Fetch from the browser.** Ruled out by CORS for skills.sh and by the per-IP quota for GitHub.
- **Serve it from the MCP server.** That server is something an operator runs locally. It is not a
  public endpoint the web app can rely on.

## Consequences

**Positive:**

- On the first local cycle (2026-10-30, 746 reads, 0 errors) the keys matched the bundled copy
  exactly: 662 skills, 53 repos, 521 paths, and the 521 paths and 662 descriptions were identical.
  559 of the 662 install counts had already moved in one day, so the snapshot was going stale.
- `days` is computed when the response is served, from `pushedAt`. The bundle's copy was wrong by
  the next day.

**Negative:**

- ARP now runs a service. The service holds a GitHub token, a classic one with no scopes.
- `wrangler dev` rebuilds when `packages/protocol/dist` changes, and any gate that runs
  `protocol build` restarts it mid-request. This was seen twice on 2026-10-30.

**Neutral (worth knowing):**

- `scripts/build-*` and the bundled JSON stay: they produce the fallback.
- A deploy needs a real KV namespace id in `wrangler.jsonc` and `wrangler secret put GITHUB_TOKEN`.

## References

- Related rule: `.claude/rules/claims.md`. The Worker is a reader, not a claimant; each figure
  carries its source and date.
- Related doc: `apps/api/src/worker.ts` header, `.env.example` (`VITE_ARP_API_URL`)
- Related ADR: `0082` (the apps layout)
