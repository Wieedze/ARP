/** What each catalogued skill says it needs: a declared CLI, and the first login it mentions.
 *
 *      bun run scripts/measure/skill-requires.ts
 *
 *  Task 56. Reads each located SKILL.md from `raw.githubusercontent.com`, at the paths the layout
 *  measurement found (`data/measurements/skill-layouts-2026-10-29T2200.json`, located plus
 *  ambiguous-with-the-same-content, first path), and ARP's own from this repository. Writes one
 *  dated file under `data/measurements/` and prints the counts. No credential, nothing signed.
 *
 *  A skill the layout could not locate is reported as `unread`, never as needing nothing.
 */
import {readFileSync, writeFileSync} from "node:fs";

import layouts from "../../data/measurements/skill-layouts-2026-10-29T2200.json";
import {readRequires, type SkillRequires} from "../helpers/skill-requires.js";

type Located = {repo: string; skill: string; path: string};

const located: Located[] = [
    ...(layouts as {located: Located[]}).located,
    ...(layouts as {ambiguous: {repo: string; skill: string; paths: string[]; sameContent: boolean}[]}).ambiguous
        .filter((row) => row.sameContent && row.paths[0] !== undefined)
        .map((row) => ({repo: row.repo, skill: row.skill, path: row.paths[0] ?? ""})),
];

type Row = {repo: string; skill: string; path: string} & ({status: "read"} & SkillRequires | {status: "unread"; httpStatus: number});

async function read(entry: Located): Promise<Row> {
    const response = await fetch(`https://raw.githubusercontent.com/${entry.repo}/HEAD/${entry.path}`);
    if (!response.ok) return {...entry, status: "unread", httpStatus: response.status};
    return {...entry, status: "read", ...readRequires(await response.text())};
}

const rows: Row[] = [];
for (let at = 0; at < located.length; at += 8) {
    rows.push(...(await Promise.all(located.slice(at, at + 8).map(read))));
}
rows.push({
    repo: "Wieedze/ARP",
    skill: "arp",
    path: "skills/arp/SKILL.md",
    status: "read",
    ...readRequires(readFileSync("skills/arp/SKILL.md", "utf8")),
});

const readRows = rows.filter((row): row is Extract<Row, {status: "read"}> => row.status === "read");
const counts = {
    skillsCatalogued: (layouts as {skillsCatalogued: number}).skillsCatalogued + 1,
    read: readRows.length,
    unread: rows.length - readRows.length,
    notLocated: (layouts as {counts: {unlocated: number}}).counts.unlocated,
    declaresCli: readRows.filter((row) => row.cli.length > 0).length,
    mentionsLogin: readRows.filter((row) => row.login !== null).length,
    either: readRows.filter((row) => row.cli.length > 0 || row.login !== null).length,
};

const measuredAt = new Date().toISOString();
const path = `data/measurements/skill-requires-${measuredAt.slice(0, 10)}.json`;
writeFileSync(
    path,
    `${JSON.stringify(
        {
            measuredAt,
            source: "raw.githubusercontent.com/{repo}/HEAD/{path}, paths from skill-layouts-2026-10-29T2200.json",
            question:
                "Which skills declare a CLI in their frontmatter, and which mention a login, a key or a sign-up in their body.",
            counts,
            rows,
        },
        null,
        1,
    )}\n`,
);
console.log(counts);
console.log(`written to ${path}`);

export {};
