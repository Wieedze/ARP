/** What a search returns, and what ARP can read of each result without writing anything anywhere.
 *
 *      GITHUB_TOKEN=… bun run scripts/measure/pulse-read.ts "video editing" "video editing ffmpeg"
 *
 *  Task 63. Runs the official `npx skills find` with its telemetry off, then reads each result from
 *  GitHub through `readPulse`. It calls no `/api/` route of skills.sh, which its `robots.txt`
 *  disallows. Writes one dated file under `data/measurements/` and prints the counts. Nothing signed.
 *
 *  The figures describe these searches on this date, not skills in general.
 */
import {execFileSync} from "node:child_process";
import {writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {
    githubPulseSource,
    groupByContent,
    parseSkillsFind,
    readPulse,
    type SkillPulse,
    type SkillSearchResult,
} from "../../packages/protocol/src/pulse.ts";

const queries = process.argv.slice(2);
if (queries.length === 0) {
    console.error('usage: bun run scripts/measure/pulse-read.ts "<search>" ["<search>" …]');
    process.exit(1);
}

const found = new Map<string, SkillSearchResult & {queries: string[]}>();
for (const query of queries) {
    const output = execFileSync("npx", ["--yes", "skills@1.7.4", "find", query], {
        env: {PATH: process.env["PATH"], HOME: join(tmpdir(), "arp-skills-cli"), DISABLE_TELEMETRY: "1", NO_COLOR: "1"},
        encoding: "utf8",
        timeout: 90_000,
    });
    for (const row of parseSkillsFind(output)) {
        const key = `${row.source}@${row.skill}`;
        const seen = found.get(key);
        if (seen === undefined) found.set(key, {...row, queries: [query]});
        else seen.queries.push(query);
    }
}

const token = process.env["GITHUB_TOKEN"];
const source = githubPulseSource(token === undefined ? {} : {token});
const rows = [...found.values()];
const pulses: SkillPulse[] = [];
for (let at = 0; at < rows.length; at += 8) {
    pulses.push(...(await Promise.all(rows.slice(at, at + 8).map((row) => readPulse(row, source)))));
}

const read = pulses.filter((pulse) => pulse.status === "read");
const status: Record<string, number> = {};
for (const pulse of pulses) status[pulse.status] = (status[pulse.status] ?? 0) + 1;
const groups = groupByContent(pulses);
const count = (test: (pulse: (typeof read)[number]) => boolean) => read.filter(test).length;
const summary = {
    results: pulses.length,
    status,
    distinctContents: groups.length,
    contentsInSeveralRepositories: groups.filter(
        (group) => new Set(group.members.map((member) => member.source)).size > 1,
    ).length,
    ofRead: {
        read: read.length,
        mentionsKey: count((pulse) => pulse.keys.length > 0),
        mentionsLogin: count((pulse) => pulse.requires.login !== null),
        mentionsPaid: count((pulse) => pulse.paidWords.length > 0),
        declaresOrRunsCli: count((pulse) => pulse.requires.cli.length + pulse.requires.runs.length > 0),
        hasScripts: count((pulse) => pulse.scripts > 0),
        namesHost: count((pulse) => pulse.hosts.length > 0),
    },
};

const date = new Date().toISOString().slice(0, 10);
const path = `data/measurements/pulse-read-${date}.json`;
writeFileSync(path, `${JSON.stringify({date, queries, summary, pulses}, null, 1)}\n`);
console.log(JSON.stringify(summary, null, 2));
for (const group of groups.filter((entry) => new Set(entry.members.map((member) => member.source)).size > 1)) {
    const members = group.members.map((member) => `${member.source} (${member.installsText ?? "?"})`);
    console.log(`same content ${group.contentId.slice(0, 12)} ${group.members[0]?.skill}: ${members.join(", ")}`);
}
console.log(`wrote ${path}`);
