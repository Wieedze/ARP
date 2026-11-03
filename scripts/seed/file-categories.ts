/** File each skill in a first-run list under its category, through the sponsor (task 59, item 6).
 *
 *      bun run scripts/seed/file-categories.ts                     # dry: prints the plan and the cost
 *      bun run scripts/seed/file-categories.ts --send              # posts to the local sponsor
 *      SPONSOR_URL=http://127.0.0.1:3200 bun run scripts/seed/file-categories.ts --send
 *
 *  Signs nothing and holds no key: the sponsor writes, as the attestor, under the same rules and
 *  daily caps as any proposal (ADR `0124`), so this is one more client of `/propose-category`, not
 *  a seed with its own authority. It stops at the first `limit` and can be re-run the next day:
 *  a filing that is already there comes back `created: false` and costs nothing.
 *
 *  A new category is filed once with its parent and reason; every later skill under it is a plain
 *  tag, as the web and `arp_file_category` send it.
 */
import {readFileSync} from "node:fs";

type Filing = {url: string; atom: string; category: string; parent?: string; reason?: string};

const file = process.argv.find((value) => value.endsWith(".json")) ?? "data/catalogue/category-first-run-13579.json";
const {chainId, filings} = JSON.parse(readFileSync(file, "utf8")) as {chainId: number; filings: Filing[]};
if (chainId !== 13579) {
    console.error(`${file} is for chain ${chainId}; the sponsor files on testnet 13579 only (ADR 0124)`);
    process.exit(1);
}
const send = process.argv.includes("--send");
const sponsor = process.env["SPONSOR_URL"]?.trim() || "http://127.0.0.1:3200";

const newCategories = [...new Set(filings.filter((f) => f.parent !== undefined).map((f) => f.category))];
const counts = new Map<string, number>();
for (const filing of filings) counts.set(filing.category, (counts.get(filing.category) ?? 0) + 1);

console.log(`${file}: ${filings.length} skills, ${counts.size} categories, ${newCategories.length} new (${newCategories.join(", ") || "none"})`);
for (const [category, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${category.padEnd(14)} ${count}`);
}
// Each write is cost + minDeposit, read off testnet 13579 on 2026-11-03 by
// `scripts/measure/domain-seed-costs.ts`: 0.002 per atom, 0.002 per triple. An upper bound: a
// filing already on chain writes nothing.
const triples = filings.length + newCategories.length;
console.log(
    `at most ${newCategories.length} atom(s) + ${triples} triple(s) ≈ ${((newCategories.length + triples) * 0.002).toFixed(3)} tTRUST of ARP's testnet treasury, plus gas`,
);
if (!send) {
    console.log("\ndry run. --send posts each filing to the sponsor.");
    process.exit(0);
}

const filed = new Set<string>();
let done = 0;
for (const filing of filings) {
    const first = filing.parent !== undefined && !filed.has(filing.category);
    const body = first
        ? {label: filing.category, parent: filing.parent, reason: filing.reason, subjectId: filing.atom}
        : {label: filing.category, subjectId: filing.atom};
    const response = await fetch(`${sponsor}/propose-category`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180000),
    });
    const answer = (await response.json().catch(() => null)) as {rule?: string; error?: string; created?: boolean} | null;
    if (!response.ok) {
        console.log(`  REFUSED ${filing.url} → ${filing.category}: ${answer?.rule ?? response.status} ${answer?.error ?? ""}`);
        if (answer?.rule === "limit") {
            console.log(`stopped at the daily limit after ${done}; re-run tomorrow`);
            break;
        }
        continue;
    }
    filed.add(filing.category);
    done += 1;
    console.log(`  ${answer?.created === false ? "already" : "filed  "} ${filing.category.padEnd(14)} ${filing.url}`);
}
console.log(`${done} of ${filings.length} answered`);
