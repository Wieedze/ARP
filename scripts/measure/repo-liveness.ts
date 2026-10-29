/** Is a catalogued tool alive, when it has no endpoint to probe?
 *
 *      bun run scripts/measure/repo-liveness.ts
 *
 *  Read-only. Signs nothing. One GitHub API request per repository, serialised.
 *
 *  Every tool in `catalogue/tools.json` is a github.com URL, so `reachable` — a protocol handshake
 *  — applies to none of them. The question for a repository is different and has a better answer
 *  than the obvious one:
 *
 *    - **stars** measure human interest in *reading* a repository. Free to give, never decay, and
 *      inflatable. A signal of life, as the user put it, and a weak one.
 *    - **`pushed_at`** measures whether anybody still maintains it. It decays on its own, which is
 *      the property no popularity count has.
 *    - **`archived`** is the owner's own declaration that it is over. Binary and authoritative.
 *
 *  So this reports all three and ranks on the last two, because the first cannot fall.
 */
import catalogue from "../../catalogue/tools.json";

type Repo = {
    stargazers_count?: number;
    pushed_at?: string;
    archived?: boolean;
    open_issues_count?: number;
    message?: string;
};

const rows = (catalogue as {tools: {url: string; kind: string}[]}).tools;
const now = Date.now();
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

const out: {slug: string; kind: string; stars: number; days: number | null; archived: boolean; gone: boolean}[] =
    [];

for (const tool of rows) {
    const slug = tool.url.replace("https://github.com/", "");
    const response = await fetch(`https://api.github.com/repos/${slug}`, {
        headers: {accept: "application/vnd.github+json", "user-agent": "arp-measure"},
        signal: AbortSignal.timeout(20000),
    });
    if (response.status === 403 || response.status === 429) {
        console.error(`rate limited at ${slug} — ${out.length} read. Re-run later or authenticate.`);
        break;
    }
    const repo = (await response.json()) as Repo;
    const gone = response.status === 404;
    const days =
        repo.pushed_at === undefined ? null : Math.round((now - Date.parse(repo.pushed_at)) / 86_400_000);
    out.push({
        slug,
        kind: tool.kind,
        stars: repo.stargazers_count ?? 0,
        days,
        archived: repo.archived === true,
        gone,
    });
    await sleep(120);
}

const dead = out.filter((row) => row.gone || row.archived);
const stale = out.filter((row) => !row.gone && !row.archived && (row.days ?? 0) > 180);
const fresh = out.filter((row) => !row.gone && !row.archived && (row.days ?? 1e9) <= 30);

console.log(`read ${out.length} of ${rows.length}\n`);
console.log(`gone or archived      ${dead.length}`);
console.log(`no push in 180 days   ${stale.length}`);
console.log(`pushed within 30 days ${fresh.length}`);

const starless = out.filter((row) => row.stars === 0).length;
console.log(`zero stars            ${starless}`);

console.log(`\nthe ten least maintained:`);
for (const row of [...out].sort((a, b) => (b.days ?? 1e9) - (a.days ?? 1e9)).slice(0, 10)) {
    const age = row.gone ? "404" : row.days === null ? "?" : `${row.days}d`;
    console.log(`  ${age.padStart(6)}  ${String(row.stars).padStart(6)}★  ${row.archived ? "ARCHIVED " : "         "}${row.slug}`);
}

console.log(`\nstars against maintenance — the two do not agree:`);
for (const row of [...out].sort((a, b) => b.stars - a.stars).slice(0, 8)) {
    console.log(`  ${String(row.stars).padStart(7)}★  pushed ${row.days ?? "?"}d ago  ${row.slug}`);
}

// A module, not a global script — see the note in predicate-objects.ts.
export {};
