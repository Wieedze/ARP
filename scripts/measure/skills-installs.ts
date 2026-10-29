/** How many people installed each catalogued skill, read from skills.sh.
 *
 *      bun run scripts/measure/skills-installs.ts
 *      bun run scripts/measure/skills-installs.ts --json measurements/skills-installs-<date>.json
 *
 *  Read-only. Signs nothing. One request per skill page, serialised, with a courtesy delay.
 *
 *  ## Why the pages and not the API
 *
 *  skills.sh publishes `GET /api/v1/skills` — a paginated leaderboard, plus `/search`, `/curated`
 *  and `/audit`. It answers **401** to an anonymous caller, and its own documentation says why:
 *  authentication is a **Vercel OIDC token**, obtained by linking a Vercel project, rotated every
 *  ~12 hours, logged against a team and project id. There is no API key to ask for. And
 *  `robots.txt` carries `Disallow: /api/`.
 *
 *  The skill pages are the opposite on every count. `robots.txt` allows them, `sitemap-skills-1`
 *  and `-2` publish **20,000** of them, and each page carries the figure as JSON-LD:
 *
 *      "@type": "SoftwareApplication",
 *      "interactionStatistic": {
 *          "@type": "InteractionCounter",
 *          "interactionType": "https://schema.org/InstallAction",
 *          "userInteractionCount": 4100928
 *      }
 *
 *  JSON-LD exists to be read by a machine. So this reads the figure the site publishes for
 *  machines, from a page the site invites crawlers into, listed in the sitemap the site maintains
 *  for that purpose — and that is the whole of the licence it claims.
 *
 *  ## Why an install count is worth reading at all
 *
 *  `repo-liveness.ts` records why stars are weak: free to give, and they never fall. An install
 *  count shares the first flaw and not the second — a skill people stop installing stops counting.
 *  Measured 2026-10-29, the spread across the 20,000 runs from **14 to 4,100,928**, five orders of
 *  magnitude, which is a signal with room in it.
 *
 *  It is still somebody else's number, unauditable, and it may be inflated. That is exactly why it
 *  belongs in a **ranking input** and never in a tag on chain: ARP asserts what it can defend.
 *
 *  ## The open question this script does not answer
 *
 *  Our catalogue is one row per **repository**; skills.sh counts per **skill**. Measured
 *  2026-10-29, our 31 skill repositories hold 600+ skills between them — 71 in one, 1 in another.
 *  So a repository's figure needs an aggregation rule, and the two obvious ones disagree:
 *
 *      sum   rewards a repository for holding many skills, trivial ones included
 *      max   reports its best skill, and says nothing about the rest
 *
 *  Both are printed. Choosing between them is a decision for an ADR, not for a measurement.
 */
import catalogue from "../../catalogue/tools.json";
import {writeFileSync} from "node:fs";

const SITEMAPS = [
    "https://www.skills.sh/sitemap-skills-1.xml",
    "https://www.skills.sh/sitemap-skills-2.xml",
];

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));
const get = async (url: string): Promise<{status: number; body: string}> => {
    const response = await fetch(url, {
        headers: {"user-agent": "arp-measure (+https://github.com/Wieedze/ARP)"},
        signal: AbortSignal.timeout(25000),
    });
    return {status: response.status, body: await response.text()};
};

function arg(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? undefined : process.argv[index + 1];
}

const ours = new Set(
    (catalogue as {tools: {url: string; kind: string}[]}).tools
        .filter((tool) => tool.kind === "skill-repo")
        .map((tool) => tool.url.replace("https://github.com/", "")),
);

// `owner/repo/skill` → the skills of each repository we catalogue. Read from the sitemap rather
// than guessed, so a repository that renamed a skill drops out instead of 404ing one page at a time.
const skillsByRepo = new Map<string, string[]>();
let published = 0;
for (const sitemap of SITEMAPS) {
    const {body} = await get(sitemap);
    for (const match of body.matchAll(/<loc>https:\/\/www\.skills\.sh\/([^<]+)<\/loc>/g)) {
        const path = match[1];
        if (path === undefined) continue;
        published += 1;
        const parts = path.split("/");
        if (parts.length !== 3) continue;
        const repo = `${parts[0]}/${parts[1]}`;
        if (!ours.has(repo)) continue;
        const list = skillsByRepo.get(repo) ?? [];
        list.push(path);
        skillsByRepo.set(repo, list);
    }
}

console.log(`sitemap     ${published} skill pages published`);
console.log(`ours        ${skillsByRepo.size} of ${ours.size} catalogued skill repositories are indexed`);
const pages = [...skillsByRepo.values()].flat();
console.log(`to read     ${pages.length} pages, serialised\n`);

type Row = {repo: string; skill: string; installs: number | null};
const rows: Row[] = [];

for (const [repo, paths] of skillsByRepo) {
    for (const path of paths) {
        const {status, body} = await get(`https://www.skills.sh/${path}`);
        const found = /"userInteractionCount":(\d+)/.exec(body);
        // A page that answers without the figure is reported as null rather than as zero. Zero is a
        // claim about the skill; null is a claim about what we could read.
        const installs = status === 200 && found?.[1] !== undefined ? Number(found[1]) : null;
        rows.push({repo, skill: path.split("/")[2] ?? path, installs});
        await sleep(250);
    }
}

const counted = rows.filter((row): row is Row & {installs: number} => row.installs !== null);
const perRepo = [...skillsByRepo.keys()]
    .map((repo) => {
        const mine = counted.filter((row) => row.repo === repo).map((row) => row.installs);
        return {
            repo,
            skills: skillsByRepo.get(repo)?.length ?? 0,
            read: mine.length,
            sum: mine.reduce((a, b) => a + b, 0),
            max: mine.length === 0 ? 0 : Math.max(...mine),
        };
    })
    .sort((a, b) => b.max - a.max);

console.log("repository                                skills   read          sum          max");
for (const row of perRepo) {
    console.log(
        `${row.repo.padEnd(40)}  ${String(row.skills).padStart(5)}  ${String(row.read).padStart(5)}  ${String(row.sum).padStart(11)}  ${String(row.max).padStart(11)}`,
    );
}

const unreadable = rows.length - counted.length;
console.log(
    `\n${counted.length} of ${rows.length} pages carried the figure` +
        (unreadable === 0 ? "" : ` · ${unreadable} did not and are reported as null`),
);
if (counted.length > 0) {
    const sorted = [...counted].sort((a, b) => a.installs - b.installs);
    const lowest = sorted[0];
    const highest = sorted[sorted.length - 1];
    if (lowest !== undefined && highest !== undefined) {
        console.log(`range       ${lowest.installs} (${lowest.skill}) to ${highest.installs} (${highest.skill})`);
    }
}

const jsonPath = arg("json");
if (jsonPath !== undefined) {
    writeFileSync(
        jsonPath,
        JSON.stringify({measuredAt: new Date().toISOString(), source: "skills.sh", published, perRepo, rows}, null, 2),
    );
    console.log(`\nwritten to ${jsonPath}`);
}

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
