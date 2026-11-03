/** Turn the dated served-skills measurement into the file the MCP server bundles.
 *
 *      bun run scripts/build/build-skill-gone.ts
 *
 *  Reads `data/measurements/skill-served-2026-11-03T2110.json` (`scripts/measure/skill-served.ts`),
 *  writes `data/catalogue/skill-gone.json`: every catalogued skill the content server refused, keyed
 *  by the atom's label like `skill-requires.json`. `arp_find_tools` stops offering them. A skill that
 *  came back at HEAD returns with the next measurement, not before.
 */
import {writeFileSync} from "node:fs";

import measured from "../../data/measurements/skill-served-2026-11-03T2110.json";

type Row = {repo: string; skill: string; status: number; reason?: string};

const gone: Record<string, {status: number; reason: string}> = {};
for (const row of (measured as {rows: Row[]}).rows) {
    // A server that did not answer says nothing about the skill: kept, not hidden.
    if (row.status === 200 || row.status === 0) continue;
    gone[`github.com/${row.repo}?skill=${encodeURIComponent(row.skill)}`] = {
        status: row.status,
        reason: row.reason ?? "",
    };
}

const out = {
    _note:
        "Catalogued skills ARP's content server refused: 404 gone at HEAD, 409 found at several paths with " +
        "different content. Built by scripts/build/build-skill-gone.ts from a committed measurement; do " +
        "not edit by hand. Keyed by the atom's label. arp_find_tools does not offer these.",
    _measuredOn: (measured as {measuredAt: string}).measuredAt.slice(0, 10),
    gone,
};
writeFileSync("data/catalogue/skill-gone.json", JSON.stringify(out) + "\n");
process.stdout.write(`${Object.keys(gone).length} skills written to data/catalogue/skill-gone.json\n`);
