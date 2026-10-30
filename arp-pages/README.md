# ARP pages: skill, repository, agent

Three design references in one system, each a self-contained HTML file to open in a browser, each with a note for Claude Code saying where every block's data comes from.

| folder | page | route |
|---|---|---|
| `skill/` | `remotion-dev/skills?skill=remotion-render` | `/atom/:atomId` when the atom is a skill |
| `repo/` | `remotion-dev/skills` and `101-skills/superpowers` | `/atom/:atomId` when the atom is a repository |
| `agent/` | a sample agent, docs/16's order | `/agent/:chainId/:tokenId` |
| `claim-field/` | the shared component, updated with ring names on the field | `app/src/components/atom/` |

Shared across the three: the classification panel (on chain) beside the external signals panel (third parties, named by source), the market card with its curves, and the claim field under **Relations**. Everything marked `sample` in a page is invented and must never ship.
