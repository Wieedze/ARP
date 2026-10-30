# 0089 — The probe is not the pulse

**Status:** Accepted
**Date:** 2026-10-30
**Triggered by:** the user, 2026-10-30. Asked whether a cron should check every server in real time,
they approved the distinction below: _« ça c'est trop bien »_.

## Context

ADR `0087` moves a tool's identity to the thing an agent calls: a package, or a remote endpoint.
An endpoint can be asked whether it answers. `docs/16_THE_AGENT_PAGE.md` §4 already reserves a
slot for that, "Does it answer?", and calls it a **fact**. The tool page's operators section
(`docs/design/pages/tool/TOOL-PAGE.md` §2) describes something else: how the tool does for the
operators who use it, from their signed weekly reports. Both are a tool's pulse, so it is easy to
merge them, and merging them would be wrong.

## Decision

**Two signals, never mixed.**

| | the probe | the pulse |
| --- | --- | --- |
| says | "this server answered ARP from Cloudflare at 14:10" | "it works for the operators who use it" |
| from | `apps/api`'s cron, one `initialize` per remote endpoint; a package's registry record (latest version, date, deprecated) since a package cannot be probed | the CLI's signed weekly reports, and the `uses` triples |
| kind | a dated third-party fact, like GitHub's stars | operators' evidence |
| stored | off chain, cached and dated (ADR `0084`). **Never written as a triple** | reports on IPFS, a Merkle root on chain |

- **The probe does not stand in for the pulse.** A server can answer `initialize` and fail every
  real call, and one that asks for auth still answers.
- **Neither one is colored red, and neither one is a score** (ADR `0046`). The page states what was
  read and when.
- The probe fills docs/16 §4 and the same block on the tool page, until then `not checked yet`.

## Consequences

- **No separate script** (the user, 2026-10-30: _« pas de script »_). The probe lives in the Worker
  only. The endpoints ADR `0087` still has to validate are checked by the Worker's first cycle,
  triggered locally, and that reading is what the user validates from.
- The probe is ARP's own measurement. It reads as `measured by ARP`, never as `verified`.
- A per-user endpoint (Zapier's) has no public identity and is not probed.
