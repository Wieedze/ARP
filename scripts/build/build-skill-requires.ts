/** Turn the dated requirements measurement into the file the MCP server bundles.
 *
 *      bun run scripts/build/build-skill-requires.ts
 *
 *  Task 56. Reads `data/measurements/skill-requires-2026-11-04T0651.json`, writes
 *  `data/catalogue/skill-requires.json`, keyed by the skill atom's label like `skill-facts.json`.
 *  Only skills that declare a CLI, run a command or mention a login get an entry, and `read` lists
 *  every skill whose file was read, so "nothing found in its file" and "file not read" stay two
 *  answers (ADR `0132`). 141 of the catalogue were left unread (139 not located, 2 found at several
 *  paths with different content), and so is anything listed after this measurement.
 */
import {writeFileSync} from "node:fs";

import measured from "../../data/measurements/skill-requires-2026-11-04T0651.json";

type Row = {
    repo: string;
    skill: string;
    status: "read" | "unread";
    cli?: string[];
    runs?: string[];
    login?: {line: number; text: string} | null;
};

// A file can name a dozen; an agent choosing needs to see that it runs something, not the list.
const RUNS_SHOWN = 5;

const requires: Record<string, {cli?: string[]; runs?: string[]; mentions_login?: string}> = {};
const read: string[] = [];
for (const row of (measured as unknown as {rows: Row[]}).rows) {
    if (row.status !== "read") continue;
    const label = `github.com/${row.repo}?skill=${encodeURIComponent(row.skill)}`;
    read.push(label);
    const cli = row.cli ?? [];
    const runs = (row.runs ?? []).slice(0, RUNS_SHOWN);
    const login = row.login ?? null;
    if (cli.length === 0 && runs.length === 0 && login === null) continue;
    requires[label] = {
        ...(cli.length > 0 ? {cli} : {}),
        ...(runs.length > 0 ? {runs} : {}),
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
        "that says no key is needed. `runs` is what its shell instructions run beyond the common commands, " +
        "at most five: a reading of the text, which can take a stray word for a command. A skill in `read` " +
        "with no entry showed nothing. A skill not in `read` was not read.",
    requires,
    read,
};

const path = "data/catalogue/skill-requires.json";
writeFileSync(path, `${JSON.stringify(out, null, 0)}\n`);
console.log(`${Object.keys(requires).length} skills with a requirement`);
console.log(`written to ${path}`);

export {};
