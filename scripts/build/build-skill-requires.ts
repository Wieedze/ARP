/** Turn the dated requirements measurement into the file the MCP server bundles.
 *
 *      bun run scripts/build/build-skill-requires.ts
 *
 *  Task 56. Reads `data/measurements/skill-requires-2026-11-03.json`, writes
 *  `data/catalogue/skill-requires.json`, keyed by the skill atom's label like `skill-facts.json`.
 *  Only skills that declare a CLI or mention a login get an entry: absence means "nothing found in
 *  its file", or "not read" for the 139 the layout could not locate, never "needs nothing".
 */
import {writeFileSync} from "node:fs";

import measured from "../../data/measurements/skill-requires-2026-11-03.json";

type Row = {
    repo: string;
    skill: string;
    status: "read" | "unread";
    cli?: string[];
    login?: {line: number; text: string} | null;
};

const requires: Record<string, {cli?: string[]; mentions_login?: string}> = {};
for (const row of (measured as {rows: Row[]}).rows) {
    if (row.status !== "read") continue;
    const cli = row.cli ?? [];
    const login = row.login ?? null;
    if (cli.length === 0 && login === null) continue;
    requires[`github.com/${row.repo}?skill=${encodeURIComponent(row.skill)}`] = {
        ...(cli.length > 0 ? {cli} : {}),
        ...(login === null ? {} : {mentions_login: login.text}),
    };
}

const out = {
    _note:
        "What a skill's own SKILL.md says it needs. Built by scripts/build/build-skill-requires.ts from " +
        "a committed measurement; do not edit by hand. Keyed by the atom's label.",
    _measuredOn: (measured as {measuredAt: string}).measuredAt.slice(0, 10),
    _limits:
        "`cli` is what the author declared in the frontmatter. `mentions_login` is the first body line " +
        "matching login, sign up, API key or access token: a keyword match, so it can name a line " +
        "that says no key is needed. A skill with no entry declared and mentioned nothing, or was not read.",
    requires,
};

const path = "data/catalogue/skill-requires.json";
writeFileSync(path, `${JSON.stringify(out, null, 0)}\n`);
console.log(`${Object.keys(requires).length} skills with a requirement`);
console.log(`written to ${path}`);

export {};
