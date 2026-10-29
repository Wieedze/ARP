/** Do the domains ARP seeded cover the 662 skills it catalogued?
 *
 *      bun run scripts/measure/skill-domains.ts
 *      bun run scripts/measure/skill-domains.ts --json measurements/skill-domains-<date>.json
 *
 *  Read-only. Signs nothing, and touches no RPC — skills.sh and the Intuition **indexer** are
 *  different hosts from the chain's RPC, whose byte quota the seed is currently spending.
 *
 *  ## Why this has to be measured before a single tag is written
 *
 *  662 skill atoms are on chain and nothing can find them: `arp_find_tools` narrows by walking the
 *  `has tag` hierarchy, and a skill carries only its `source` edge. The fix is a tag each — and a
 *  tag is permanent, so the question "is there a domain for this skill" comes before the writing,
 *  not after.
 *
 *  The two wrong answers, both cheap and both lasting for ever:
 *
 *    - **Inherit the repository's domain.** Free, and false: `coreyhaines31/marketingskills` holds
 *      71 skills, and one tag over all of them says nothing a reader can use.
 *    - **Invent a domain per skill.** 517 distinct names would grow a tree nobody can walk, and the
 *      user's rule is one word, never hyphenated, and a new term only when something is off.
 *
 *  ## How a skill is classified here
 *
 *  By keyword, against a table written down in this file. Crude on purpose: a third party can
 *  re-run it and get the same answer, which an LLM's judgement would not give. `docs/14`'s test.
 *
 *  A skill matching nothing is reported as **unclassified** rather than forced into the nearest
 *  domain. That list is the output that matters — it is the evidence for which terms are missing,
 *  and it is what a human reads before agreeing to mint one.
 */
import {writeFileSync} from "node:fs";

import installs from "../../measurements/skills-installs-2026-10-29.json";

/**
 * The domains ARP seeded under `tool`, read from the chain on 2026-10-29, and the words that land
 * a skill in each.
 *
 * `card` is `payment`'s only child and is matched through it. `card-payment` exists on chain from
 * the smoke test and breaks the one-word rule, so nothing here routes to it.
 *
 * Order matters: the first domain whose keyword appears wins, so the specific ones come first.
 * A keyword is matched against the skill's name and its description, lowercased.
 */
const DOMAINS: readonly {domain: string; words: readonly string[]}[] = [
    {domain: "payment", words: ["payment", "stripe", "paypal", "invoice", "checkout", "billing", "subscription"]},
    {domain: "video", words: ["video", "remotion", "render", "animation", "avatar", "footage", "youtube"]},
    {domain: "blockchain", words: ["blockchain", "onchain", "ethereum", "solidity", "wallet", "token", "web3", "contract", "crypto"]},
    {domain: "scraping", words: ["scrap", "crawl", "extract", "parse html", "firecrawl", "apify"]},
    {domain: "browser", words: ["browser", "playwright", "puppeteer", "chrome", "headless", "selenium"]},
    {domain: "database", words: ["database", "sql", "postgres", "prisma", "supabase", "mongo", "schema", "migration", "query"]},
    {domain: "observability", words: ["observab", "monitor", "logging", "metric", "trace", "grafana", "alert", "sentry"]},
    {domain: "marketing", words: ["marketing", "seo", "campaign", "copywriting", "ads", "audience", "newsletter", "growth", "brand"]},
    {domain: "design", words: ["design", "figma", "ui ", "ux", "typograph", "colou", "color", "layout", "logo", "icon"]},
    {domain: "quality", words: ["test", "lint", "review", "debug", "audit", "coverage", "qualit", "refactor"]},
    {domain: "infrastructure", words: ["deploy", "docker", "kubernetes", "terraform", "cloudflare", "aws", "azure", "serverless", "infra", "ci/cd"]},
    {domain: "collaboration", words: ["slack", "notion", "jira", "linear", "github issue", "pull request", "team", "atlassian", "monday"]},
    {domain: "automation", words: ["automat", "workflow", "zapier", "schedul", "cron", "pipeline", "orchestrat"]},
    {domain: "website", words: ["website", "landing", "html", "css", "static site", "next.js", "nextjs", "react", "frontend"]},
    {domain: "api", words: ["api", "rest", "graphql", "endpoint", "webhook", "openapi", "postman"]},
    {domain: "development", words: ["code", "typescript", "python", "rust", "compil", "sdk", "library", "framework", "git "]},
];

function arg(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? undefined : process.argv[index + 1];
}

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

type Row = {repo: string; skill: string; installs: number | null};
const rows = (installs as {rows: Row[]}).rows;

console.log(`skills      ${rows.length}`);
// `DOMAINS.length` is how many this table can route to — NOT how many are on chain, which is
// what the label used to say. Measured on 13579, 2026-10-29: 18 hierarchy edges under `tool` in
// ARP's index, against 16 before `method` and `writing`. An array length is never a chain fact.
console.log(`domains     ${DOMAINS.length} routable by this table\n`);

type Classified = Row & {description: string; domain: string | null};
const out: Classified[] = [];

for (const row of rows) {
    const response = await fetch(`https://www.skills.sh/${row.repo}/${row.skill}`, {
        headers: {"user-agent": "arp-measure (+https://github.com/Wieedze/ARP)"},
        signal: AbortSignal.timeout(25000),
    });
    const body = await response.text();
    // The same JSON-LD the install count comes from. `description` is the author's own sentence.
    const found = /"description":"((?:[^"\\]|\\.)*)"/.exec(body);
    // Unescaping a JSON string literal by re-parsing it. Guarded because one malformed page would
    // otherwise throw and discard every fetch completed before it — 600 requests for nothing.
    let description = "";
    if (found?.[1] !== undefined) {
        try {
            const parsed: unknown = JSON.parse(`"${found[1]}"`);
            if (typeof parsed === "string") description = parsed;
        } catch {
            description = "";
        }
    }
    const haystack = `${row.skill.replace(/-/g, " ")} ${description}`.toLowerCase();
    const hit = DOMAINS.find((entry) => entry.words.some((word) => haystack.includes(word)));
    out.push({...row, description, domain: hit?.domain ?? null});
    await sleep(200);
}

const counts = new Map<string, number>();
for (const row of out) counts.set(row.domain ?? "—", (counts.get(row.domain ?? "—") ?? 0) + 1);

console.log("domain            skills");
for (const [domain, count] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`${domain.padEnd(18)}${String(count).padStart(5)}`);
}

const unclassified = out.filter((row) => row.domain === null);
const noDescription = out.filter((row) => row.description === "").length;
console.log(
    `\n${out.length - unclassified.length} of ${out.length} classified · ${unclassified.length} not · ${noDescription} pages carried no description`,
);

if (unclassified.length > 0) {
    console.log("\nunclassified — the evidence for which terms are missing:");
    for (const row of unclassified.slice(0, 40)) {
        console.log(`  ${row.skill.padEnd(32)} ${row.description.slice(0, 70)}`);
    }
    if (unclassified.length > 40) console.log(`  … and ${unclassified.length - 40} more`);
}

const jsonPath = arg("json");
if (jsonPath !== undefined) {
    writeFileSync(
        jsonPath,
        JSON.stringify({measuredAt: new Date().toISOString(), domains: DOMAINS, rows: out}, null, 2),
    );
    console.log(`\nwritten to ${jsonPath}`);
}

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
