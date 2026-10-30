# 0054 — A tool's atom is derived from its URL

**Status:** Accepted
**Date:** 2026-10-21
**Triggered by:** user request — _« on doit match les mêmes atom, donc s'ils ont le même url ils sont censés avoir le même terms id, est-ce que c'est possible ? comment faire pour que grâce au choix du nom par l'utilisateur on n'ait pas mille doublons ? »_

## Context

ARP points at tools and prices opinion on them (ADR `0051`). A tool is identified by a URL — a GitHub
repo, an MCP endpoint, a skill page. The pointer is an Intuition atom, and an atom's id is the hash of
its data, which for the canonical form is a pinned schema.org `Thing` document.

That document contains a **free-text `name`**. Two people registering the same tool type two different
names, produce two different documents, two different CIDs, two different atoms, two vaults and two
reputations — and Intuition has no deletion.

This is not a hypothetical. Measured on mainnet 1155 on 2026-10-21 by
`scripts/measure/url-atom-fragmentation.ts`, over all 90,608 atoms whose Thing carries a URL:

| | |
| --- | --- |
| distinct raw URLs | 85,367 |
| distinct normalised URLs | 84,768 |
| raw URLs held by more than one atom | 3,256, covering 8,497 atoms |
| of those, groups where a name repeats too | 1,722 |
| one host, every atom named apart | 1,534 |
| **atoms in excess of their names** | **2,022** |
| forks only normalisation sees | 213 |

**2,022 is the number that means duplication, and getting to it took two corrections.** It is
`size - distinctNames` summed over every group: the atoms in *excess* of the names present. Counting
whole groups instead says `https://meerkat.town` has 69 duplicates, when its 69 atoms carry 68 names
— one duplicated pair.

An earlier draft of this ADR said "the worst single URL, `https://zyf.ai`, has 297 atoms" and offered
it as the worst fork. It is not a fork: those 297 atoms carry **297 distinct names** — "Zyfai Rebalancer Agent
for 0x2461C9…" and so on — so they are 297 different agents sharing one provider's homepage. The
figure was counted over "atoms sharing a URL" and stated about "atoms duplicating each other", which
is `rules/claims.md` failure 2 exactly, committed in the same hour as the rule was cited.

The discriminator is distinct names against group size. Where a name repeats, two atoms share **both**
a URL and a name and nothing but duplication explains it. Real examples, read on mainnet 2026-10-21:

| URL | atoms | distinct names |
| --- | --- | --- |
| `https://trenches.bid` | 53 | **1** — all "Clawlett" |
| `https://hourglass.box/` | 64 | 2 |
| `https://github.com` | 5 | 2 — "GitHub" ×2, "github.com" ×3 |

53 atoms under one name for one URL is the failure this ADR exists to stop.

The user's framing is the right one: the atom should belong to the URL, not to whoever registered it
first.

## Decision

**Every field of a tool's Thing is a pure function of the normalised URL.**
`packages/protocol/src/declare/tool-thing.ts`:

```
name        the normalised URL without its scheme   github.com/crytic/slither
description one fixed sentence, the same for every tool atom
image       ""
url         the normalised URL                      https://github.com/crytic/slither
```

So same URL in → same document → same CID → same atom id, computable on any machine with no
credential and no network. Nobody picks a name, so nobody can pick a different one.

`normaliseToolUrl` merges the spellings of one URL: a bare host gets `https://`, the scheme becomes
`https`, `www.` is dropped, a default port and the fragment are dropped, a trailing `/` is dropped,
and query keys are sorted. The path's **case is kept** — most servers are case-sensitive there, and
GitHub's leniency is GitHub's choice, not a property of URLs.

`prepareDeclareUsed` still prefers an **existing** atom over minting a derived one, and now searches
both the raw and the normalised spelling before deciding, because an atom on the graph carries
whatever URL its creator typed. Several hits remain an error, not a coin flip
(`AmbiguousToolAtomError`).

Pinning is a **separate step** (`scripts/seed/pin-tool.ts`). It makes the document readable — Intuition's
indexer resolves `value.thing` from the CID — and is not needed to know the id, to plan, to create,
or to stake. Same split as the identity atom's (ADR `0016`): the plan needs no credential, the
legibility does.

## Alternatives considered

- **Keep the free-text name and deduplicate by lookup.** This is what the code did. It needs a graph
  read per tool, the read only finds atoms that already exist, and it cannot stop two people
  registering the same tool in the same hour. It stays in place as the first preference — it is a
  *better* answer when it hits — but it cannot be the only one.
- **A bare URL atom** (`calculateAtomId(stringToHex(url))`). Deterministic, and off the cohort's
  canon: of the 84 tool atoms on mainnet `uses` edges, 78 are `ipfs://` and 77 resolve a pinned
  Thing; the only two raw-URL atoms are schema.org vocabulary terms. The vendored `intuition` skill
  says it directly — "plain string versions are **legacy duplicates**". An atom nobody's indexer
  shows a name for is a hash in every UI.
- **An ARP-run naming registry** — first registrant names the tool, ARP stores the mapping. That is a
  registry with records, which ADR `0051` decided ARP is not.
- **A `name` predicate on the graph.** Measured 2026-10-20: `name` resolves to five distinct atoms
  carrying **1 edge in total**, `has description` to 0, `has alias` to 32. `has tag` has 57,783 but
  is a Keywords type and means tagging. There is no canonical naming predicate to use, so this would
  have meant minting one — ADR `0030`'s exact failure.

## Consequences

**Positive:**

- Two agents declaring the same tool land on the same atom with no coordination, no lookup and no
  credential. That is the property the whole market needs: deposits have to pile onto one vault to
  mean anything.
- The id is computable offline, so a third party can verify ARP's pointer without trusting ARP.
- `prepareDeclareUsed` also deduplicates its **input** on the normalised URL. `github.com/x` and
  `https://github.com/x` used to survive the `Set`, resolve to one id, and produce two identical
  creates — the second reverting with `MultiVault_AtomExists` after the first was paid for.

**Negative:**

- **A reader sees `github.com/crytic/slither`, not `Slither`.** That is the trade. A name is
  recoverable later — an alias edge, a display map in the UI — and a fragmented market is not.
- Normalisation can merge two URLs that genuinely differ: an http-only host, a host where `www.`
  matters, a server where query order or a trailing slash is meaningful. Each rule is listed in the
  function's docstring with the risk it takes. A false merge of two spellings of one tool is
  harmless; a missed merge is permanent.
- It does nothing for the 8,497 atoms already forked. It stops the next one.

**Neutral (worth knowing):**

- A URI that is neither a content address nor an http(s) URL — a `did:`, an `npm:` specifier — still
  takes the bare-URI path with `bareUrlWarning`. There is no URL to normalise there.
- `ipfs://` and `ar://` are unaffected: a content address **is** its own document, so deriving from
  it and the canon are the same thing (ADR `0008`).

## References

- Related ADR: `.claude/choices/0051-arp-points-and-prices-it-stores-nothing.md`
- Related ADR: `.claude/choices/0053-every-term-is-born-with-a-position.md`
- Related ADR: `.claude/choices/0008-arp-module-uri-coupling-via-intuition-pinning.md`
- Related ADR: `.claude/choices/0016-intuition-writes-move-server-side.md`
- Related ADR: `.claude/choices/0030-the-use-edge-is-chosen-on-meaning.md`
- Related rule: `.claude/rules/portability.md`
- Skill: `.claude/skills/intuition/SKILL.md` — "plain string versions are legacy duplicates"
- Scripts: `scripts/measure/url-atom-fragmentation.ts`, `scripts/seed/pin-tool.ts`
