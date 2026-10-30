/** What the Worker reads facts about. Bundled, like `apps/mcp/src/data.ts`, so it carries its list.
 *
 *  The skills are the ones ARP wrote on testnet 13579 — the only chain with a skill catalogue. The
 *  facts themselves are GitHub's and skills.sh's and belong to no chain; only the list does.
 */
import skills13579 from '../../../catalogue/skills-13579.json';
import tools from '../../../catalogue/tools.json';

export type Skill = { repo: string; skill: string };
export type Repo = { slug: string; kind: string };

// Committed files with this shape; `scripts/record-skills-catalogue.ts` and the catalogue's own note define it.
export const SKILLS: readonly Skill[] = (skills13579 as { skills: Skill[] }).skills.map(
  ({ repo, skill }) => ({
    repo,
    skill,
  }),
);

// `catalogue/tools.json` is hand-maintained with exactly these two fields per tool, among others.
export const REPOS: readonly Repo[] = (
  tools as { tools: { url: string; kind: string }[] }
).tools.map((tool) => ({
  slug: tool.url.replace('https://github.com/', ''),
  kind: tool.kind,
}));

/** `github.com/owner/repo` — the repository atom's label, which is what the front looks up by. */
export function repoLabel(slug: string): string {
  return `github.com/${slug}`;
}

/** `github.com/owner/repo?skill=name` — the skill atom's label. */
export function skillLabel(repo: string, skill: string): string {
  return `github.com/${repo}?skill=${encodeURIComponent(skill)}`;
}
