# 0120 — The sponsor lists a tool, and the web app may ask it to

**Status:** Accepted
**Date:** 2026-11-03
**Triggered by:** `docs/tasks/53` 53c, and the user's decisions:
- 2026-11-02: "listing a tool from path C is sponsored on testnet 13579, with a limit"
  (`docs/tasks/53` §2);
- 2026-11-03, the limit: « B quand une clé est disponible, A sinon », confirmed to arp-c4 as "Les
  deux";
- 2026-11-03, the browser: "Ouvrir pour l'app".

## Context

Path C in the web app lets a visitor who is not in web3 paste the URL of a tool or a skill the index
does not know, and have it listed. "Listed" means the tool's atom exists on Intuition, so ARP can
point at it. For a skill, it also means the repository's atom and `(skill, source, repository)`, the
shape `scripts/seed/seed-own-skill.ts` writes.

Three constraints:
1. **Who pays.** The visitor has no wallet and pays nothing, so the sponsoring service pays. No row
   of `security.md`'s signing table covered a listing.
2. **No proof.** A listing is not a use. There is no receipt and no payment to gate it on, so the
   only abuse is inventing many distinct URLs. A URL is idempotent: the same URL gives the same atom.
3. **The browser is refused.** ADR `0116` made the sponsor refuse any request carrying an `Origin`,
   because before it any page on any site could make the treasury key spend.

## Decision

**`POST /list-tool`, testnet 13579 only.** Body `{url, request?}`. The service:
1. refuses a string that is not a tool URL, or one longer than 2,048 characters;
2. checks that the URL exists where it says (below), and for a GitHub URL learns GitHub's own spelling
   of the repository;
3. lists it under its **canonical spelling** (`canonicalToolUrl`). A GitHub URL is rebuilt as the
   seed scripts build theirs, `https://github.com/<owner>/<repo>`, with `?skill=<s>` for a skill.
   The rebuild uses GitHub's case, and drops a path such as `/tree/main`, any other query parameter
   and a port. `normaliseToolUrl` keeps path case, so without this, `wieedze/arp` and `Wieedze/ARP`
   would be two permanent atoms beside the seeded one. This was found by `intuition-integrator`
   before it shipped;
4. plans the terms (`planToolListing`, `packages/protocol/src/sponsor/list-tool.ts`). When
   everything already exists it answers `created: false` and spends nothing;
5. checks the limits (below);
6. on the existence check of step 2: a GitHub repository must answer GitHub's tree API, and
   a skill must have a SKILL.md in a directory of its name, by the content server's rule
   (`resolveContentPath`). **Any other URL is accepted unchecked**: fetching an arbitrary URL from
   the process that holds the treasury key would let a caller point it at the local network. An
   answer is remembered for ten minutes, so one URL repeated does not spend GitHub's hourly
   allowance;
7. pins each Thing it creates and checks the returned URI against the computed one;
8. creates each term at `cost + minDeposit` (ADR `0053`). The service holds the creation position,
   as `/publish` and `/identity` do.

It creates no `uses` edge and labels nothing declared or proven. A listing is a pointer.

**Two limits, as the user decided.**
- A request signed by an address (`ListToolRequest`: address, url, nonce, expiresAt, EIP-712, no
  `verifyingContract`) counts against that address's daily limit,
  `SPONSOR_LISTINGS_PER_ADDRESS_PER_DAY`, default 5. Each nonce is spent once, and the signed URL
  must be the URL sent.
- An unsigned request counts against one shared cap, `SPONSOR_ANONYMOUS_LISTINGS_PER_DAY`, default
  20. arp-5e proposed "about 20"; the user did not fix the number.
- **All listings together stay under `SPONSOR_LISTINGS_PER_DAY`**, default 50. A fresh key costs
  nothing to make, so the per-address limit alone does not bound a caller. Without this total, a page
  signing with throwaway keys could spend the daily budget that `/deposit`, `/gas`, `/mint-gas`,
  `/identity` and `/publish` share. This was found by the security review before it shipped.
- All of it sits inside ADR `0092`'s daily budget. A listing counts once however many terms it
  creates.

**This route alone answers a browser.** It answers only the web app's local origins (Vite's 5173
and 4173, the activity feed's list, ADR `0091`) plus `SPONSOR_ALLOWED_ORIGINS`, which is empty by
default. It answers the `OPTIONS` preflight and sets `Access-Control-Allow-Origin` for those
origins only. Every other route keeps ADR `0116`'s refusal, and the `Host` check stays on every
route, so DNS rebinding is still refused.

## Alternatives considered

- **A per-address limit only.** The visitor may have no key, and asking for one puts web3 in sight.
  Refused: the user chose both limits.
- **A global cap only.** One page could use up the day for everyone, even a visitor who could sign.
  Refused for the same reason.
- **Route the web app through the local MCP server.** That keeps the sponsor closed to every
  browser, but adds a step, and the MCP server must be running. The user chose to open this one
  route.
- **Check any URL by fetching it.** That is SSRF from the treasury's process. Refused: the caps bound
  an invented URL instead.

## Consequences

**Positive:**

- A visitor lists a tool with nothing installed and nothing to sign.
- The terms are written exactly as the seed scripts write them, so a listed skill reads like a seeded
  one.

**Negative:**

- **An allowed origin is a port, not an app.** Any page served on localhost at 5173 or 4173 can
  call this route, and so can any other dev server the user runs on those ports. Such a page can use
  up the anonymous cap, and with throwaway keys the daily total. It cannot spend past the total, and
  the total is set well below the budget the other routes share.
- An invented non-GitHub URL is listed if it is well formed. Its cost is bounded by the caps: about
  0.002 tTRUST a listing at testnet prices (`atomCost + minDeposit`, read at send time).
- Checking GitHub costs a request per listing, and GitHub allows 60 an hour per IP without
  `GITHUB_TOKEN`. A rate-limited check answers 503 and spends nothing.
- **The limit checked before the pins is not final under concurrency.** Parallel requests with
  distinct URLs can each pass it and each pin with ARP's pinning key, and only those that fit spend.
  Pinning moves no value. The count inside the queue is the one that decides, as in `/identity`.
- `security.md`'s signing table gains a row.

**Neutral (worth knowing):**

- Mainnet needs a new ADR, like every sponsored write.
- Task 59's categories will need a sibling route under the same rules (arp-5e).
