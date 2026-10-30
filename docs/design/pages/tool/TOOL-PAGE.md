# The tool page

**For:** Claude Code. **Route:** `/atom/:atomId`, when the atom is a tool. **Reference:** `tool-page.html`, on Supabase's MCP server, with two cases: reported by operators, and no reports yet. **It is the page the README badge opens.**

A skill is a kind of tool (docs/20: skills sit under `tool` in the domain tree). So this page and `../skill/skill-page.html` are **one page with two variants**: the same blocks in the same order, and only the description block and the install line differ. Build one component tree, not two pages.

Real in the reference: Supabase's tool atom on testnet 13579 (`0xf51e…6c9d`), its url, title and purpose (`data/catalogue/tools.json`, `data/catalogue/registered-13579.json`), its npm package, its GitHub stars and last push (2026-10-29). **Everything marked `sample` is invented.** Never ship it.

---

## 1. The page, top to bottom

| block | MCP server | skill | source |
|---|---|---|---|
| kind | `TOOL · MCP server` | `SKILL · owner/repo` | atom type, catalogue `kind` |
| title | the tool's title | the skill's name | pinned Thing |
| **Description** | the purpose, large; under it the 4 most used functions with their share of calls | the SKILL.md description; under it its sections | catalogue / reports; SKILL.md |
| install line | the package command (`npx -y @supabase/mcp-server-supabase`) | `npx skills add <repo> --skill <name>` | registration or catalogue |
| **Classification** | domain, kind, repository maintained | domain, source, repository maintained | on chain, ARP attestor only |
| **External signals** | stars, last push, npm downloads | installs, stars, last push | GitHub, npm, skills.sh, with read date |
| **How it does for operators** (new) | see §2 | absent: the hook only sees MCP calls, not skills | the signed weekly reports |
| market card + curves | the tool's own vault | the same | `AtomMarket`, `getTermShape`, `getTermActivity` |
| **Relations** | claim field v2 | the same | `getAtomStanding` |
| **On the record** | atom, the url it identifies, the other urls it is reached as, registration, writer | atom, url, source, has tag | chain + catalogue |

## 2. How it does for operators

Only when at least one signed weekly report covers this tool. Otherwise one dashed box: "No operator reports this tool yet. A report starts the week an agent with ARP installed calls it." and the `init` command.

| part | what | rule |
|---|---|---|
| four figures | operators using it (`uses` triples), success last week with how many operators reported it, median call, last change and what it was | a Hint on success: "The average of what operators reported, each counted once. ARP does not grade the tool." |
| Calls that worked, by week | one bar per week, 80 to 100 %, value on top, operators reporting under the date | a week under 95 % is in alarm red; the latest week in paper; others steel. Draw to scale |
| What changed | date, kind (`functions`, `host`, `price`, `outage` in red), what | from the `changes` the hooks report |
| Most used functions | name with a bar to scale, share of calls | from the reports |
| Where operators went | tools that operators who stopped this one started using, with counts | from the reports; "nowhere else" is a row |
| Check it yourself | the weekly reports (IPFS), the Merkle root tx, the `verify` command, the three anti-cheat rules | nothing in this block needs ARP |
| the badge | the tool's badge, as a README shows it | see `../../cli-surfaces/` |

## 3. One identity problem to settle before week 2

**The catalogue and the hook name the same tool by different URLs.** The catalogue registered Supabase as `https://github.com/supabase/mcp`. The hook (`packages/cli`, `mcp-config.ts`) resolves a configured server to its endpoint URL (remote) or its npm or PyPI page (local), so it would find `npmjs.com/package/@supabase/mcp-server-supabase`. Under ADR 0054 those are **two atoms**, and the hook's `uses` triples would never land on the page the badge opens.

Options: resolve to the repository URL when the package declares one (`repository` in package.json, `project_urls` on PyPI), or keep an alias table from endpoint and package to the catalogue atom. The page already shows an "Also reached as" row for this. Decide before the first `uses` triple is written: a wrong atom is permanent.

## 4. Done means

- Both cases render; a skill renders through the same tree without the operators section.
- `check:tokens`, `tsc -b`, `lint`, `test` pass. 390px: no horizontal scroll.
