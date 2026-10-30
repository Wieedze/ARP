/** Where a skill's `SKILL.md` actually sits inside its repository.
 *
 *      GITHUB_TOKEN=… bun run scripts/measure/skill-layouts.ts
 *      GITHUB_TOKEN=… bun run scripts/measure/skill-layouts.ts --json measurements/skill-layouts-<date>.json
 *
 *  Read-only. One GitHub tree request per repository — 31 of them — so the unauthenticated quota of
 *  60 an hour covers a run, and a token only makes it comfortable.
 *
 *  ## The question it exists to answer
 *
 *  `tasks/31` plans a `GET /content/:atomId` endpoint on the MCP server. An atom's id is a pure function
 *  of its URL (ADR `0054`), so the endpoint can recover `github.com/<owner>/<repo>?skill=<name>`
 *  without asking anyone. What it cannot recover is **the path**: `raw.githubusercontent.com` needs
 *  one, and nothing in the atom carries it.
 *
 *  So the resolver is either a pure function of `(repo, skill)` or it needs the repository's tree.
 *  **Which one is an empirical question**, and the task says to settle it before the resolver
 *  exists rather than after. That is the whole of this file.
 *
 *  ## Why the match can fail, and why that is the useful part
 *
 *  A catalogued skill's name comes from **skills.sh**, not from the tree — `measure/skills-installs.ts`
 *  read it off the published pages. The directory inside the repository is the repository's own
 *  business. Nothing guarantees the two agree, so counting the ones that do not is a measurement
 *  rather than a tautology.
 *
 *  Every skill this cannot locate is a skill the endpoint must **refuse** on, the same way
 *  `packages/protocol/src/session.ts` refuses a name six repositories carry. A resolver that
 *  guessed a path would serve somebody else's file under the right atom's name, which is worse than
 *  serving nothing.
 *
 *  ## What it does not claim
 *
 *  **Not that a located file is the right one.** It matches a directory segment against a name. A
 *  repository that nests two skills under one directory would satisfy that test and be wrong, which
 *  is why `ambiguous` is reported separately instead of resolved by a rule.
 *
 *  **Nothing about content.** `measure/skill-content-duplicates.ts` already hashes it.
 */
import { writeFileSync } from 'node:fs';

import catalogue from '../../catalogue/skills-13579.json';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const headers: Record<string, string> = {
  accept: 'application/vnd.github+json',
  'user-agent': 'arp-measure',
};
const token = process.env['GITHUB_TOKEN']?.trim();
if (token !== undefined && token.length > 0) headers['authorization'] = `Bearer ${token}`;

type CataloguedSkill = { repo: string; skill: string; url: string };
const skills = (catalogue as { skills: CataloguedSkill[] }).skills;
const repos = [...new Set(skills.map((row) => row.repo))].sort();

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

type Tree = { tree?: { path: string; type: string; sha: string }[]; truncated?: boolean };

/** `repo -> every path in the default branch whose basename is SKILL.md, in any case. */
const paths = new Map<string, string[]>();
/** `repo/path -> the file's git blob sha, so two candidates can be compared without downloading. */
const blobs = new Map<string, string>();
const truncated: string[] = [];
const unread: string[] = [];

for (const repo of repos) {
  const response = await fetch(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`, {
    headers,
    signal: AbortSignal.timeout(25000),
  });
  if (response.status === 403 || response.status === 429) {
    console.error(`rate limited at ${repo}; ${paths.size} of ${repos.length} read.`);
    break;
  }
  if (!response.ok) {
    unread.push(`${repo} (HTTP ${response.status})`);
    continue;
  }
  const tree = (await response.json()) as Tree;
  // A tree over 100,000 entries comes back truncated and the rest is simply absent. Recorded
  // rather than ignored: a missing path reads here as "the skill could not be located".
  if (tree.truncated === true) truncated.push(repo);
  const own: string[] = [];
  for (const entry of tree.tree ?? []) {
    if (entry.type !== 'blob') continue;
    const basename = entry.path.split('/').pop() ?? '';
    if (basename.toLowerCase() !== 'skill.md') continue;
    own.push(entry.path);
    blobs.set(`${repo}/${entry.path}`, entry.sha);
  }
  paths.set(repo, own);
  console.log(`${repo}: ${own.length} SKILL.md`);
  await sleep(120);
}

/** The path with the skill's own directory replaced, so two repositories can be compared. */
function templateOf(path: string): string {
  const parts = path.split('/');
  if (parts.length < 2) return path;
  parts[parts.length - 2] = '<skill>';
  return parts.join('/');
}

type Located = { repo: string; skill: string; path: string; template: string; exact: boolean };
const located: Located[] = [];
const ambiguous: { repo: string; skill: string; paths: string[]; sameContent: boolean }[] = [];
const unlocated: { repo: string; skill: string; filesInRepo: number }[] = [];

/** The directory a SKILL.md sits in — the only segment a catalogued name is matched against. */
function directoryOf(path: string): string {
  const parts = path.split('/');
  // A SKILL.md at the repository root has no directory. Returning the file's own name would make it
  // a candidate for a skill called `SKILL.md`: no effect on this population, wrong anyway.
  return parts.length < 2 ? '' : (parts[parts.length - 2] ?? '');
}

/** Every such directory in a repository, deduplicated. */
function directoriesOf(repo: string): string[] {
  return [...new Set((paths.get(repo) ?? []).map(directoryOf))];
}

for (const row of skills) {
  const inRepo = paths.get(row.repo);
  if (inRepo === undefined) continue;

  // Exact first, then case-folded. Nothing looser: a fuzzy match would be a guess about which file
  // belongs to which atom, and the endpoint built on this serves bytes under an atom's name.
  //
  // **The immediate parent and no other segment.** The first run of this script matched any
  // directory in the path, which made `plugins/caveman/skills/cavecrew/SKILL.md` a candidate for
  // the skill `caveman` and reported 49 ambiguities where there were far fewer. Worse than the
  // count: a loose match can land on exactly one wrong file and resolve confidently, which is the
  // silent failure this measurement exists to prevent. `measurements/skill-layouts-2026-10-29.json`
  // is that first run; the correction is in the later file.
  const exact = inRepo.filter((path) => directoryOf(path) === row.skill);
  const folded =
    exact.length > 0
      ? exact
      : inRepo.filter((path) => directoryOf(path).toLowerCase() === row.skill.toLowerCase());

  const only = folded[0];
  if (folded.length === 0) {
    unlocated.push({ repo: row.repo, skill: row.skill, filesInRepo: inRepo.length });
  } else if (folded.length > 1) {
    // Whether the candidates are the same file decides what the endpoint can do: identical bytes
    // make the choice cosmetic, different bytes make it a claim about which one the agent read.
    const shas = new Set(folded.map((path) => blobs.get(`${row.repo}/${path}`) ?? path));
    ambiguous.push({
      repo: row.repo,
      skill: row.skill,
      paths: folded,
      sameContent: shas.size === 1,
    });
  } else if (only !== undefined) {
    located.push({
      repo: row.repo,
      skill: row.skill,
      path: only,
      template: templateOf(only),
      exact: exact.length > 0,
    });
  }
}

const templates = new Map<string, number>();
for (const row of located) templates.set(row.template, (templates.get(row.template) ?? 0) + 1);

const perRepo = repos
  .filter((repo) => paths.has(repo))
  .map((repo) => {
    const own = located.filter((row) => row.repo === repo);
    const ownTemplates = [...new Set(own.map((row) => row.template))].sort();
    const catalogued = skills.filter((row) => row.repo === repo).map((row) => row.skill);
    // The figure that says WHY a skill could not be located. A repository with no uncatalogued
    // directory has nothing the name could have been renamed to, so its unlocated skills are
    // simply absent from HEAD rather than sitting under another name.
    const orphanDirectories = directoriesOf(repo).filter(
      (dir) => !catalogued.some((name) => name.toLowerCase() === dir.toLowerCase()),
    );
    return {
      repo,
      filesInRepo: (paths.get(repo) ?? []).length,
      catalogued: catalogued.length,
      located: own.length,
      orphanDirectories,
      templates: ownTemplates,
    };
  });

const out = {
  measuredAt: new Date().toISOString(),
  source: 'api.github.com/repos/{repo}/git/trees/HEAD?recursive=1',
  question:
    "Whether a skill's SKILL.md path is a pure function of (repo, skill) or needs the repository's tree. " +
    'Every unlocated skill is one the /content endpoint must refuse on rather than guess.',
  authenticated: token !== undefined && token.length > 0,
  reposRead: paths.size,
  reposCatalogued: repos.length,
  unread,
  truncated,
  skillsCatalogued: skills.length,
  counts: {
    located: located.length,
    locatedExact: located.filter((row) => row.exact).length,
    ambiguous: ambiguous.length,
    ambiguousSameContent: ambiguous.filter((row) => row.sameContent).length,
    unlocated: unlocated.length,
    distinctTemplates: templates.size,
    reposWithOneTemplate: perRepo.filter((row) => row.templates.length === 1).length,
    reposWithSeveralTemplates: perRepo.filter((row) => row.templates.length > 1).length,
    unlocatedInReposWithNoOrphanDirectory: unlocated.filter(
      (row) =>
        (perRepo.find((entry) => entry.repo === row.repo)?.orphanDirectories ?? ['x']).length === 0,
    ).length,
  },
  templates: [...templates.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([template, skills_]) => ({ template, skills: skills_ })),
  perRepo,
  ambiguous,
  unlocated,
  located,
};

console.log('');
console.log(`read        ${out.reposRead} of ${out.reposCatalogued} repositories`);
console.log(`located     ${out.counts.located} of ${out.skillsCatalogued} catalogued skills`);
console.log(`  exact     ${out.counts.locatedExact} (the rest matched case-folded)`);
console.log(
  `ambiguous   ${out.counts.ambiguous}, of which ${out.counts.ambiguousSameContent} are the same ` +
    'file under two paths',
);
console.log(`unlocated   ${out.counts.unlocated}`);
console.log(
  `  of which ${out.counts.unlocatedInReposWithNoOrphanDirectory} are in a repository with no ` +
    'uncatalogued directory — nothing there they could have been renamed to',
);
console.log('');
console.log(`distinct templates        ${out.counts.distinctTemplates}`);
console.log(`repos with one template   ${out.counts.reposWithOneTemplate}`);
console.log(`repos with several        ${out.counts.reposWithSeveralTemplates}`);
console.log('');
for (const row of out.templates)
  console.log(`  ${String(row.skills).padStart(4)}  ${row.template}`);

const path = arg('json');
if (path !== undefined) {
  writeFileSync(path, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`\nwritten to ${path}`);
}

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
