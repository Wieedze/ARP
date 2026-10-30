# The repository page

**For:** Claude Code. **Route:** `/atom/:atomId`, when the atom is a repository (`https://github.com/<owner>/<repo>`, the object of the skills' `source` edges). **Reference:** `repo-page.html`. The case switcher shows `remotion-dev/skills` (an author) and `101-skills/superpowers` (a pack published identically in 5 other repositories).

Real in the reference: both repositories, every skill they publish with its description and domain tag (`catalogue/skills-13579.json`), stars and last push (`measurements/repo-liveness-2026-10-29.json`), installs (`measurements/skills-installs-2026-10-29.json`), and the 5 identical repositories. **Everything marked `sample` is invented**: market, curves, agents, positions. Never ship them.

---

## 1. The page, top to bottom

| block | what it shows | where it comes from |
|---|---|---|
| kind | `REPOSITORY · github.com` | the pinned url |
| title | `owner/repo`, owner in steel, repo in paper | the pinned url |
| install line | `npx skills add <owner>/<repo>`, Copy | the url |
| **Classification** | Repository: `maintained`, `archived` (alarm dot) or `no verdict`. Skills: how many on chain point here by `source`. Domains: one chip per domain with its count, plus a dashed `no tag N` | on chain: the repo's `has tag maintained`, the incoming `source` edges, and each skill's `has tag`. Only what ARP's attestor holds (`shares > 0`) |
| **External signals** | stars, days since last push, installs summed over its skills | GitHub and skills.sh, with the read date. Summing installs across one repository's skills is fine: same source, same unit. Never sum across sources |
| **market card + curves** | the repository's own vault, exactly as on the skill page | `AtomMarket`, `getTermShape`, `getTermActivity` on the repo atom. Empty at zero positions |
| **N skills** | one row per skill: name (link to its skill page), description, domain chip, agents using, behind it, installs with a bar to scale | catalogue + `getAtomStanding` per skill (or one batched read) + skills.sh. Ordered by installs, the one order that is not ARP's to choose |
| **The same N skills, in K other repositories** | only when another repository publishes the **same set**: every skill name and every description match. Three figures (repositories in the pack, installs here, installs in the others) and a table: repository, stars, last push, installs over the pack | computed from the catalogue and the descriptions. A Hint says ARP does not say which came first |
| **Relations** | the claim field, with **every incoming claim except `source`** (the skills are already listed above) | `getAtomStanding(repoAtom).groups` minus the `source` group |
| **On the record** | the url it identifies, its `has tag`, incoming `source` count, how many of its skills carry a domain tag, who wrote it | chain |

## 2. Rules

- **Same name is not a relation.** A skill with the same name in another repository is another skill. Only the identical-pack test (all names and all descriptions equal) earns a section, and only on the repository page.
- Two markets, never summed: the repository's vault and its skills' vaults.
- No score, no rank. Stars and installs are labelled with their source.
- Saffron only on `Take a position`, a lit claim, the viewer's own position.
- `no tag` is dashed and steel: 61 skills carry nothing because no keyword matched, and that abstention is deliberate (docs/20 §2).

## 3. Worth a look before shipping

The catalogue tags several `101-skills/superpowers` skills with domains that read wrong (`agent-browser` and `python-executor` as `video`). They are the real tags on chain. Worth running `scripts/audit-skill-tags.ts` on them.

## 4. Done means

- Both cases render; a repository with no identical pack shows no pack section.
- `check:tokens`, `tsc -b`, `lint`, `test` pass. 390px: the tables scroll inside their own container, the page does not.
