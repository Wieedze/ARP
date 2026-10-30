# The skill page

**For:** Claude Code. **Route:** `/atom/:atomId`, when the atom is a skill (its pinned url has the shape `https://github.com/<owner>/<repo>?skill=<name>`, ADR 0077). **Reference:** `skill-page.html` next to this file. Open it in a browser; the case switcher at the top shows used by 13, used by one, and nobody yet.

Real in the reference: the skill, its url, atom id, domain, source repository, the SKILL.md description and sections, and the GitHub and skills.sh figures (read 2026-10-29). **Everything marked `sample` is invented**: the agents, positions, curves and market. Never ship a figure from the reference.

---

## 1. The page, top to bottom

| block | what it shows | where it comes from |
|---|---|---|
| kind + repo | `SKILL` and `owner/repo` | parsed from the pinned url |
| title | the skill name, `type-title` | parsed from the pinned url (`?skill=`) |
| **Description** | the SKILL.md `description` field, large; under it the SKILL.md `##` sections, each with its first command; on the right `SKILL.md · v<version>` | the description is already in the catalogue (`skill-domains` measurement). **The sections and version are not stored yet**: read the SKILL.md frontmatter and headings from GitHub, like the other external signals |
| install line | `npx skills add <repo> --skill <name>`, Copy button | the two strings of the url |
| **Classification** | Domain (`tool / video`, each a link to its atom), Source (repo atom), Repository (`maintained` when tagged) | on chain: the skill's own outgoing `has tag` and `source` triples, the repo's `has tag maintained`, and the domain's `is a sub domain of` chain. Only what ARP's attestor holds (`shares > 0`) |
| **External signals** | installs (skills.sh), stars and days since last push (GitHub), with the read date and a Hint | third parties, never on chain (docs/20 §2). Large mono figures: it is a real signal, but named by source |
| **market card** | behind the skill itself, positions, largest holder, top three, first and latest backer, a concentration bar, **your position in Saffron**, `Take a position` (primary) and `Exit` | `AtomMarket` and `getTermShape(atomId)`. `positionCount === 0` shows "Nobody is behind it yet." and no figure (dust, ADR 0042) |
| **curves** | Signals per bucket (bars, last one in paper), Value moved (area with endpoint), grain day / week / month, Hint "money moving, not a price" | `getTermActivity(atomId, {grain})`. Empty: "Nothing has moved on this market yet." |
| **Relations** | the claim field v2 (loupe, card, legend), every incoming claim | `ClaimField` as shipped, fed by `getAtomStanding(atomId).groups` |
| **On the record** | atom id, the url it identifies, source, has tag with its triple id, the domain's parent, who wrote it | chain ids from the catalogue (`data/catalogue/skills-13579.json`: `atom`, `tagTriple`) |

## 2. Rules carried from the repo

- **Two markets, never summed**: the skill's own vault (market card) and the vaults on the claims about it (Relations). ADR 0056.
- **No score, no rank, no stars of ours** (ADR 0046). GitHub stars are GitHub's figure and are labelled so.
- **Saffron** only on `Take a position`, the lit claim, and the viewer's own position.
- **No explanatory sentence inside a panel**: each caveat is a `Hint`.
- Mono for every id, amount, count and date.
- The page holds **no section about other skills with the same name**: same name in another repo is another skill, unrelated. The identical-pack story (6 repos carrying the same 26 skills) belongs to the repo page.

## 3. Missing data to add

1. **SKILL.md sections and version**: fetch `raw.githubusercontent.com/<repo>/<branch>/skills/<name>/SKILL.md`, keep the frontmatter `version` and the `##` headings with the first fenced command of each. Cache it with the other external reads.
2. **External signals per skill**: installs already exist in `data/measurements/skills-installs-*.json`, stars and push in `repo-liveness-*.json`. Serve them with their `measuredAt`.

## 4. Done means

- The three cases render: used by many, used by one, nobody (no figure, empty curves, the zero claim field).
- `check:tokens`, `tsc -b`, `lint`, `test` pass.
- 390px: no horizontal scroll; the market card stacks above the curves.
- Reduced motion: the field holds still, the loupe does not tour.
