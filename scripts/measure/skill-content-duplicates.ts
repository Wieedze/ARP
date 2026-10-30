/** Which catalogued skills are literally the same file, proven by content hash.
 *
 *      bun run scripts/measure/skill-content-duplicates.ts
 *      bun run scripts/measure/skill-content-duplicates.ts --json data/measurements/skill-duplicates-<date>.json
 *
 *  Read-only. One GitHub tree request per repository — 31 of them — so a token is wanted but the
 *  unauthenticated quota of 60 an hour also covers one run.
 *
 *  ## Why a hash and not a name
 *
 *  `measure/skills-installs.ts` found 177 of 662 skills sharing a name with another. A shared name
 *  is a hint and nothing more, and treating it as evidence produced a wrong claim that reached four
 *  files: **six repositories named `superpowers` were described as copies of `obra/superpowers`,
 *  and they are not.** Measured here, they share **zero** files with it. They are copies of one
 *  another — 86 SKILL.md each, all 86 identical across the six — and `obra/superpowers` is a
 *  different project that happens to carry the same repository name.
 *
 *  The user's test, 2026-10-29: _« si le contenu est bien le même »_. So this reads the content.
 *
 *  ## What a blob sha is, and why it is the right hash
 *
 *  GitHub's tree API returns a `sha` per file: `sha1("blob " + length + "\0" + content)`, git's own
 *  object id. It is a pure function of the bytes, it needs no download, and **anyone can reproduce
 *  it** — `git hash-object SKILL.md` prints the same string with no credential at all. That is
 *  `docs/14`'s test for a signal, met exactly: a third party can check the claim without asking us.
 *
 *  An install count cannot do this. It is somebody else's number, it cannot tell a copy from its
 *  author's, and it only ever ranks (`docs/20`). A matching content hash is a **fact**, and it is
 *  the kind of claim worth putting on chain — which is a separate decision and not taken here.
 *
 *  ## What it cannot say
 *
 *  **Not who was first.** Two identical files prove duplication and say nothing about direction.
 *  Commit dates would be a guess — a repository can be rewritten, a fork can predate a publish.
 *  This reports the pairs and leaves the arrow unclaimed.
 */
import {writeFileSync} from "node:fs";

import catalogue from "../../data/catalogue/tools.json";

function arg(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? undefined : process.argv[index + 1];
}

const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "arp-measure",
};
const token = process.env["GITHUB_TOKEN"]?.trim();
if (token !== undefined && token.length > 0) headers["authorization"] = `Bearer ${token}`;

const repos = (catalogue as {tools: {url: string; kind: string}[]}).tools
    .filter((tool) => tool.kind === "skill-repo")
    .map((tool) => tool.url.replace("https://github.com/", ""));

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

type Tree = {tree?: {path: string; sha: string}[]; truncated?: boolean};
/** `repo -> path -> blob sha`, for every SKILL.md in the default branch. */
const files = new Map<string, Map<string, string>>();
let truncatedRepos = 0;

for (const repo of repos) {
    const response = await fetch(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`, {
        headers,
        signal: AbortSignal.timeout(25000),
    });
    if (response.status === 403 || response.status === 429) {
        console.error(`rate limited at ${repo}; ${files.size} repositories read.`);
        break;
    }
    const tree = (await response.json()) as Tree;
    // A tree over 100,000 entries comes back truncated and the rest is simply absent. Counted
    // rather than ignored, because a missing file reads here as "not a duplicate".
    if (tree.truncated === true) truncatedRepos += 1;
    const own = new Map<string, string>();
    for (const entry of tree.tree ?? []) {
        if (entry.path.toLowerCase().endsWith("skill.md")) own.set(entry.path, entry.sha);
    }
    files.set(repo, own);
    await sleep(120);
}

console.log(`${files.size} repositories read${truncatedRepos > 0 ? `, ${truncatedRepos} truncated by GitHub` : ""}\n`);
console.log("repository                              SKILL.md   distinct contents");
for (const [repo, own] of files) {
    console.log(
        `${repo.padEnd(38)} ${String(own.size).padStart(8)} ${String(new Set(own.values()).size).padStart(19)}`,
    );
}

// A content hash held by more than one repository. The unit is the file, not the skill name.
const holders = new Map<string, Set<string>>();
for (const [repo, own] of files) {
    for (const sha of own.values()) {
        const set = holders.get(sha) ?? new Set<string>();
        set.add(repo);
        holders.set(sha, set);
    }
}
const shared = [...holders.entries()].filter(([, set]) => set.size > 1);

console.log(`\n${holders.size} distinct SKILL.md contents across the catalogue`);
console.log(`${shared.length} of them exist in more than one repository`);

// Repository pairs, by how many files they share. The arrow is deliberately absent.
const pairs = new Map<string, number>();
for (const [, set] of shared) {
    const list = [...set].sort();
    for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
            const key = `${list[i]} ↔ ${list[j]}`;
            pairs.set(key, (pairs.get(key) ?? 0) + 1);
        }
    }
}
console.log(`\nrepository pairs sharing files — the arrow is NOT claimed:`);
for (const [pair, count] of [...pairs].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${String(count).padStart(4)} files  ${pair}`);
}
if (pairs.size === 0) console.log("  none");

/**
 * A shared **name** and a shared **content** are not the same finding, and separating them is the
 * whole point of this script.
 *
 * A skill's name is the directory its SKILL.md sits in — `guides/agent/affirmations/SKILL.md` is
 * the skill `affirmations` — which is also what `npx skills add --skill` takes.
 */
function skillNameOf(path: string): string {
    const parts = path.split("/");
    return parts.length >= 2 ? (parts[parts.length - 2] ?? path) : path;
}

const byName = new Map<string, {repo: string; sha: string}[]>();
for (const [repo, own] of files) {
    for (const [path, sha] of own) {
        const name = skillNameOf(path);
        byName.set(name, [...(byName.get(name) ?? []), {repo, sha}]);
    }
}

let sameNameSameFile = 0;
let sameNameDifferentFile = 0;
let withinOneRepo = 0;
const divergent: {name: string; repos: number; contents: number}[] = [];
for (const [name, holders_] of byName) {
    // **Distinct repositories, not entries.** Counting entries made `impeccable` read as "25
    // repositories" when it is 25 copies inside ONE — `pbakaus/impeccable` ships the same skill
    // under `.agent/`, `.agents/`, `.claude/`, `.cursor/` and twenty-one more runtime directories.
    // A within-repo duplicate is a packaging choice; a cross-repo one is the finding.
    const repos = new Set(holders_.map((row) => row.repo));
    if (repos.size < 2) {
        if (holders_.length > 1) withinOneRepo += 1;
        continue;
    }
    // One sha per repository: a repo shipping its own skill 25 times still holds one content.
    const perRepo = new Map<string, Set<string>>();
    for (const row of holders_) {
        perRepo.set(row.repo, (perRepo.get(row.repo) ?? new Set()).add(row.sha));
    }
    const contents = new Set(holders_.map((row) => row.sha)).size;
    if (contents === 1) sameNameSameFile += 1;
    else {
        sameNameDifferentFile += 1;
        divergent.push({name, repos: repos.size, contents});
    }
}

console.log(`
${byName.size} distinct skill NAMES`);
console.log(`  ${sameNameSameFile} carried by several repositories with the SAME file`);
console.log(`  ${sameNameDifferentFile} carried by several repositories with DIFFERENT files`);
console.log(`  ${withinOneRepo} repeated inside ONE repository — a packaging choice, not a copy`);
console.log(`
same name, different content — a name proves nothing:`);
for (const row of divergent.sort((a, b) => b.contents - a.contents).slice(0, 12)) {
    console.log(`  ${row.name.padEnd(32)} ${row.repos} repos, ${row.contents} different files`);
}

const jsonPath = arg("json");
if (jsonPath !== undefined) {
    writeFileSync(
        jsonPath,
        JSON.stringify(
            {
                measuredAt: new Date().toISOString(),
                source: "api.github.com git/trees, blob sha = git hash-object",
                reposRead: files.size,
                truncatedRepos,
                distinctContents: holders.size,
                sharedContents: shared.length,
                perRepo: [...files].map(([repo, own]) => ({
                    repo,
                    files: own.size,
                    distinct: new Set(own.values()).size,
                })),
                pairs: [...pairs].map(([pair, files_]) => ({pair, files: files_})),
                names: {
                    distinct: byName.size,
                    sharedSameFile: sameNameSameFile,
                    sharedDifferentFile: sameNameDifferentFile,
                    repeatedWithinOneRepo: withinOneRepo,
                    divergent,
                },
            },
            null,
            2,
        ),
    );
    console.log(`\nwritten to ${jsonPath}`);
}

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
