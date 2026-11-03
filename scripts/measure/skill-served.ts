/** Does ARP's content server still serve each catalogued skill?
 *
 *      bun run scripts/measure/skill-served.ts
 *      bun run scripts/measure/skill-served.ts --json data/measurements/skill-served-<date>.json
 *
 *  Read-only. Signs nothing. One `GET /content/:atomId` per skill with an atom, four at a time,
 *  against a running content server (`ARP_CONTENT_URL`, default `http://127.0.0.1:3002`).
 *
 *  `skill-layouts.ts` asks where a `SKILL.md` sits, by directory name. This asks the question an
 *  agent meets: what the server answers for the atom it was handed. A skill can be located by the
 *  first and still refused by the second, and only the second is what the search should stop
 *  offering.
 */
import {writeFileSync} from "node:fs";

import record from "../../data/catalogue/skills-13579.json";

type Row = {repo: string; skill: string; url: string; atom: string | null};
type Served = Row & {status: number; reason?: string};

const BASE = process.env.ARP_CONTENT_URL ?? "http://127.0.0.1:3002";

function arg(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? undefined : process.argv[index + 1];
}

async function ask(row: Row & {atom: string}): Promise<Served> {
    try {
        const response = await fetch(`${BASE}/content/${row.atom}`, {signal: AbortSignal.timeout(30000)});
        const body = await response.text();
        if (response.ok) return {...row, status: response.status};
        let reason = body.slice(0, 200);
        try {
            const parsed: unknown = JSON.parse(body);
            if (typeof parsed === "object" && parsed !== null && "reason" in parsed)
                reason = String(parsed.reason);
        } catch {
            // Not JSON: the raw head of the body is the reason.
        }
        return {...row, status: response.status, reason};
    } catch (error) {
        return {...row, status: 0, reason: String(error)};
    }
}

const rows = (record as {skills: Row[]}).skills.filter(
    (row): row is Row & {atom: string} => row.atom !== null,
);
const results: Served[] = [];
for (let i = 0; i < rows.length; i += 4) results.push(...(await Promise.all(rows.slice(i, i + 4).map(ask))));

const byStatus = new Map<number, number>();
for (const r of results) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
process.stdout.write(`skills with an atom  ${rows.length}\n`);
for (const [status, n] of [...byStatus].sort((a, b) => a[0] - b[0]))
    process.stdout.write(`  ${status === 0 ? "no answer" : status}  ${n}\n`);

const perRepo = new Map<string, {served: number; refused: number}>();
for (const r of results) {
    const entry = perRepo.get(r.repo) ?? {served: 0, refused: 0};
    if (r.status === 200) entry.served += 1;
    else entry.refused += 1;
    perRepo.set(r.repo, entry);
}
for (const [repo, {served, refused}] of [...perRepo].filter(([, e]) => e.refused > 0).sort((a, b) => b[1].refused - a[1].refused))
    process.stdout.write(`  ${repo}: ${refused} refused, ${served} served\n`);

const out = arg("json");
if (out !== undefined) {
    writeFileSync(
        out,
        JSON.stringify({measuredAt: new Date().toISOString(), source: BASE, rows: results}, null, 2),
    );
    process.stdout.write(`written to ${out}\n`);
}
