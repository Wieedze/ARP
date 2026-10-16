/** Regenerate the ADR and post-mortem indexes from the files themselves.
 *
 *  An index written by hand drifts from what it indexes, and a drifted index is worse than none —
 *  an agent trusts it. So it is generated, and regenerating it is one command:
 *
 *      bun run scripts/build-claude-index.ts
 *
 *  Run it after adding an ADR or a post-mortem. It is read-only over the repo except for the two
 *  INDEX.md files it writes, touches no network, and signs nothing.
 *
 *  It also reports what it cannot parse rather than silently omitting it, because a file missing
 *  from an index is exactly the failure an index is supposed to prevent.
 */

import {readdirSync, readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const CHOICES = join(ROOT, ".claude/choices");
const LEARNING = join(ROOT, ".claude/learning");

type Adr = {
    n: string;
    file: string;
    title: string;
    date: string | null;
    status: string | null;
};

function field(body: string, name: string): string | null {
    const m = new RegExp(`^\\*\\*${name}:\\*\\*\\s*(.+)$`, "m").exec(body);
    return m ? m[1].trim() : null;
}

function readAdrs(): {rows: Adr[]; unparsed: string[]} {
    const rows: Adr[] = [];
    const unparsed: string[] = [];
    for (const file of readdirSync(CHOICES).sort()) {
        if (!/^\d{4}-.*\.md$/.test(file)) continue;
        const body = readFileSync(join(CHOICES, file), "utf8");
        const heading = /^#\s*(?:\d{4}\s*—\s*)?(.+)$/m.exec(body);
        if (!heading) {
            unparsed.push(`${file} — no H1`);
            continue;
        }
        const date = field(body, "Date");
        const status = field(body, "Status");
        if (!date) unparsed.push(`${file} — no **Date:** field`);
        if (!status) unparsed.push(`${file} — no **Status:** field`);
        rows.push({
            n: file.slice(0, 4),
            file,
            title: heading[1].trim(),
            date,
            status: status ? status.split(/\s*\|\s*/)[0] : null,
        });
    }
    return {rows, unparsed};
}

function readPostMortems(): {rows: {n: string; file: string; title: string; task: string | null; verdict: string | null}[]; unparsed: string[]} {
    const rows: {n: string; file: string; title: string; task: string | null; verdict: string | null}[] = [];
    const unparsed: string[] = [];
    for (const file of readdirSync(LEARNING).sort()) {
        if (!/^\d{2}-.*\.md$/.test(file)) continue;
        const body = readFileSync(join(LEARNING, file), "utf8");
        const heading = /^#\s*(?:\d{2}\s*—\s*)?(.+)$/m.exec(body);
        if (!heading) {
            unparsed.push(`${file} — no H1`);
            continue;
        }
        const task = /^\*\*Task:\*\*\s*(.+)$/m.exec(body);
        const verdict = /^\*\*Verifier verdict:\*\*\s*(.+)$/m.exec(body);
        rows.push({
            n: file.slice(0, 2),
            file,
            title: heading[1].trim(),
            task: task ? task[1].trim() : null,
            verdict: verdict ? verdict[1].trim().split(/[.—]/)[0].trim() : null,
        });
    }
    return {rows, unparsed};
}

const today = new Date().toISOString().slice(0, 10);
const {rows: adrs, unparsed: adrProblems} = readAdrs();
const {rows: pms, unparsed: pmProblems} = readPostMortems();

// ---------------------------------------------------------------- ADR index --
const notAccepted = adrs.filter((a) => a.status && a.status !== "Accepted");

const adrIndex = `# ADR index

**Generated** ${today} by \`scripts/build-claude-index.ts\`. Do not edit by hand — rerun the script.

${adrs.length} decisions. Newest last. \`choices/README.md\` says when to write one.

${
    notAccepted.length
        ? `## Not accepted\n\nRead these before relying on them.\n\n${notAccepted
              .map((a) => `- **${a.n}** (${a.status}) — ${a.title}`)
              .join("\n")}\n`
        : ""
}
## All

| # | date | status | decision |
| --- | --- | --- | --- |
${adrs
    .map((a) => `| [${a.n}](${a.file}) | ${a.date ?? "—"} | ${a.status ?? "—"} | ${a.title} |`)
    .join("\n")}
${
    adrProblems.length
        ? `\n## Could not be parsed\n\n${adrProblems.map((p) => `- ${p}`).join("\n")}\n`
        : ""
}`;

writeFileSync(join(CHOICES, "INDEX.md"), adrIndex);

// ------------------------------------------------------- post-mortem index --
const pmIndex = `# Post-mortem index

**Generated** ${today} by \`scripts/build-claude-index.ts\`. Do not edit by hand — rerun the script.

${pms.length} entries, one per completed task. Written by \`task-verifier\` on a pass.

| # | task | verdict | entry |
| --- | --- | --- | --- |
${pms
    .map((p) => `| [${p.n}](${p.file}) | ${p.task ?? "—"} | ${p.verdict ?? "—"} | ${p.title} |`)
    .join("\n")}
${
    pmProblems.length
        ? `\n## Could not be parsed\n\n${pmProblems.map((p) => `- ${p}`).join("\n")}\n`
        : ""
}`;

writeFileSync(join(LEARNING, "INDEX.md"), pmIndex);

console.log(`ADRs indexed:         ${adrs.length}`);
console.log(`post-mortems indexed: ${pms.length}`);
if (notAccepted.length) {
    console.log(`\nnot Accepted (${notAccepted.length}):`);
    for (const a of notAccepted) console.log(`  ${a.n} ${a.status} — ${a.title}`);
}
const problems = [...adrProblems, ...pmProblems];
if (problems.length) {
    console.log(`\ncould not parse (${problems.length}):`);
    for (const p of problems) console.log(`  ${p}`);
}
