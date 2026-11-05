/** Which third-party tasks enter the sieve of task 67? No choice by hand, and no agent runs.
 *
 *      bun run scripts/measure/demonstration-candidates.ts
 *
 *  Reads SkillsBench's tasks at one pinned commit, keeps those a run here could do, and asks the real skills market
 *  whether at least two skills answer the task's own first two tags. If more than 20 are left, the 20 kept are the lowest
 *  sha256(task name + salt), which nobody can steer. Writes every task and why it was dropped.
 */
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdirSync, mkdtempSync, writeFileSync} from "node:fs";
import {homedir, tmpdir} from "node:os";
import {join} from "node:path";

import {arpHome} from "../../packages/protocol/src/node/local-state.ts";
import {parseSkillsFind} from "../../packages/protocol/src/pulse.ts";

const REPO = "benchflow-ai/skillsbench";
const COMMIT = "f860ecf02ef53412a030f8661c83d644b739ff01";
const SALT = "arp-task-67";
const KEEP = 20;
const MIN_SKILLS = 2;
const MAX_CPUS = 4;
const MAX_MEMORY_MB = 8192;
const NEEDS_A_KEY = /\b(api[_ -]?key|access[_ -]?token|credentials?|OPENAI_|ANTHROPIC_|HF_TOKEN)\b/i;

const clone = mkdtempSync(join(tmpdir(), "skillsbench-"));
execFileSync("git", ["clone", "--quiet", "--filter=blob:none", "--no-checkout", `https://github.com/${REPO}.git`, clone]);
const names = execFileSync("git", ["-C", clone, "ls-tree", "--name-only", COMMIT, "tasks/"], {encoding: "utf8"})
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => line.replace("tasks/", ""));

const home = join(arpHome(process.env, homedir()), "skills-cli");
mkdirSync(home, {recursive: true, mode: 0o700});

function find(query: string): string[] {
    const output = execFileSync("npx", ["--yes", "skills@1.7.6", "find", query], {
        env: {PATH: process.env["PATH"], HOME: home, DISABLE_TELEMETRY: "1", NO_COLOR: "1"},
        encoding: "utf8",
        timeout: 90_000,
    });
    return parseSkillsFind(output).map((result) => `${result.source}@${result.skill}`);
}

const field = (front: string, key: string): string | null => front.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? null;
const tagsOf = (front: string): string[] => {
    const block = front.match(/^\s*tags:\s*\n((?:\s*-\s*.+\n?)+)/m)?.[1] ?? "";
    return block.split("\n").map((line) => line.replace(/^\s*-\s*/, "").trim()).filter((line) => line !== "");
};

type Row = {task: string; category: string | null; difficulty: string | null; query: string | null; skills: string[]; dropped: string | null; lot: string};

const rows: Row[] = [];
for (const task of names) {
    const lot = createHash("sha256").update(task + SALT).digest("hex");
    const response = await fetch(`https://raw.githubusercontent.com/${REPO}/${COMMIT}/tasks/${task}/task.md`);
    const row: Row = {task, category: null, difficulty: null, query: null, skills: [], dropped: null, lot};
    rows.push(row);
    if (!response.ok) {
        row.dropped = `no task.md (${response.status})`;
        continue;
    }
    const text = await response.text();
    const front = text.split(/^---$/m)[1] ?? "";
    const body = text.split(/^---$/m).slice(2).join("---");
    row.category = field(front, "category");
    row.difficulty = field(front, "difficulty");
    const reasons: string[] = [];
    if (field(front, "network_mode") !== "public") reasons.push("no network, so no skill can be fetched");
    if (Number(field(front, "gpus") ?? 0) > 0) reasons.push("needs a GPU");
    if (Number(field(front, "cpus") ?? 1) > MAX_CPUS) reasons.push(`more than ${MAX_CPUS} CPUs`);
    if (Number(field(front, "memory_mb") ?? 0) > MAX_MEMORY_MB) reasons.push(`more than ${MAX_MEMORY_MB} MB`);
    if (NEEDS_A_KEY.test(body)) reasons.push("its text mentions a key or a credential");
    const tags = tagsOf(front);
    if (tags.length === 0) reasons.push("no tags to search with");
    if (reasons.length > 0) {
        row.dropped = reasons.join("; ");
        continue;
    }
    row.query = tags.slice(0, 2).join(" ");
    try {
        row.skills = find(row.query);
    } catch (error) {
        row.dropped = `search failed: ${error instanceof Error ? error.message.slice(0, 120) : "unknown"}`;
        continue;
    }
    if (row.skills.length < MIN_SKILLS) row.dropped = `fewer than ${MIN_SKILLS} skills on the market`;
}

const eligible = rows.filter((row) => row.dropped === null).sort((a, b) => a.lot.localeCompare(b.lot));
const kept = eligible.slice(0, KEEP).map((row) => row.task);
const out = {
    measuredAt: new Date().toISOString(),
    source: {repo: REPO, commit: COMMIT},
    rules: {MIN_SKILLS, MAX_CPUS, MAX_MEMORY_MB, KEEP, SALT, search: "skills@1.7.6 find, the task's first two tags"},
    counts: {tasks: rows.length, eligible: eligible.length, kept: kept.length},
    kept,
    rows,
};
const path = `data/measurements/demonstration-candidates-${out.measuredAt.slice(0, 10)}.json`;
writeFileSync(path, JSON.stringify(out, null, 1) + "\n");
console.log(path, JSON.stringify(out.counts));
const dropped = new Map<string, number>();
for (const row of rows) if (row.dropped !== null) dropped.set(row.dropped, (dropped.get(row.dropped) ?? 0) + 1);
console.log([...dropped.entries()].sort((a, b) => b[1] - a[1]));
for (const task of kept) {
    const row = rows.find((candidate) => candidate.task === task);
    console.log(task, "|", row?.category, "|", row?.difficulty, "|", row?.query, "|", row?.skills.length);
}
