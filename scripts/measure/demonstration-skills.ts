/** Which real skills enter step 1 of task 67? Selected before any run, by a reader with no tools. Nothing here runs a skill.
 *
 *      bun run scripts/measure/demonstration-skills.ts
 *
 *  Skills are copied as files into ~/arp-bench/skills, read as text and never executed here. Each reader call is `claude -p`.
 */
import {execFileSync, spawn} from "node:child_process";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {homedir, tmpdir} from "node:os";
import {dirname, join} from "node:path";

import {frontmatterName} from "../../packages/protocol/src/pulse.ts";

type Candidates = {kept: string[]; rows: {task: string; difficulty: string | null; skills: string[]}[]}; // this repo's own measurement
const list = JSON.parse(readFileSync("data/measurements/demonstration-candidates-2026-11-05.json", "utf8")) as Candidates;
const BENCH = join(homedir(), "arp-bench");
const MAX_READ = 20;
const KEEP = 5;
const MIN_KEEP = 3;

let cost = 0;
function ask(prompt: string): Promise<string> {
    return new Promise((done) => {
        const child = spawn(
            "claude",
            ["-p", prompt, "--model", "haiku", "--output-format", "json", "--tools", "", "--setting-sources", "project", "--strict-mcp-config", "--no-session-persistence", "--max-budget-usd", "0.5"],
            {cwd: tmpdir(), env: {PATH: process.env["PATH"], HOME: process.env["HOME"]}, stdio: ["ignore", "pipe", "ignore"]},
        );
        let text = "";
        child.stdout.on("data", (chunk: Buffer) => (text += chunk.toString()));
        child.on("close", () => {
            try {
                const answer = JSON.parse(text) as {result?: string; total_cost_usd?: number}; // the CLI's envelope
                cost += answer.total_cost_usd ?? 0;
                done((answer.result ?? "").trim());
            } catch {
                done("");
            }
        });
    });
}

const descriptionOf = (markdown: string): string => {
    const front = markdown.split(/^---$/m)[1] ?? "";
    const folded = front.match(/^description:\s*[>|][-+]?\s*\n((?:[ \t]+.*\n?)+)/m)?.[1];
    return (folded ?? front.match(/^description:\s*(.+)$/m)?.[1] ?? "").replace(/\s+/g, " ").trim();
};

const git = (dir: string, ...args: string[]) => execFileSync("git", ["-C", dir, ...args], {encoding: "utf8", maxBuffer: 64 * 1024 * 1024});

function locate(ref: string): {dir: string; commit: string; path: string; markdown: string} | null {
    const at = ref.lastIndexOf("@");
    const repo = ref.slice(0, at);
    const skill = ref.slice(at + 1);
    const dir = join(BENCH, "skills-src", repo.replace("/", "__"));
    try {
        if (!existsSync(dir)) {
            mkdirSync(dirname(dir), {recursive: true});
            execFileSync("git", ["clone", "--quiet", "--filter=blob:none", "--no-checkout", `https://github.com/${repo}.git`, dir], {timeout: 120_000, env: {...process.env, GIT_TERMINAL_PROMPT: "0"}});
        }
        const commit = git(dir, "rev-parse", "HEAD").trim();
        const paths = git(dir, "ls-tree", "-r", "--name-only", commit).split("\n").filter((path) => /(^|\/)SKILL\.md$/.test(path));
        for (const path of paths) {
            const markdown = git(dir, "show", `${commit}:${path}`);
            if (frontmatterName(markdown) === skill || path.split("/").at(-2) === skill) return {dir, commit, path, markdown};
        }
    } catch {
        return null;
    }
    return null;
}

const isGithub = (ref: string) => /^[^/.]+\/[^/]+@/.test(ref);
const out: Record<string, unknown>[] = [];
type Kept = {ref: string; commit: string; path: string; folder: string; markdown: string};
const pick = async (): Promise<{task: string; kept: Kept[]} | null> => {

for (const task of list.kept) {
    const row = list.rows.find((candidate) => candidate.task === task);
    if (row?.difficulty !== "hard") continue;
    const taskText = readFileSync(join(BENCH, "skillsbench/tasks", task, "task.md"), "utf8").split(/^---$/m).slice(2).join("---").trim().slice(0, 3000);
    const seen: Record<string, unknown>[] = [];
    const kept: Kept[] = [];
    let read = 0;
    for (const ref of row.skills.filter(isGithub)) {
        if (read >= MAX_READ || kept.length >= KEEP) break;
        const found = locate(ref);
        if (found === null) {
            seen.push({ref, status: "not readable"});
            continue;
        }
        read += 1;
        const description = descriptionOf(found.markdown);
        const question = `An agent has this task:\n\n${taskText}\n\nThis skill is available.\nName: ${ref.slice(ref.lastIndexOf("@") + 1)}\nDescription: ${description}\n\nWould a reasonable agent load this skill for this task? Answer with one word: yes or no.`;
        const answers = [await ask(question), await ask(question)].map((answer) => answer.toLowerCase().replace(/[^a-z]/g, ""));
        const qualifies = answers.every((answer) => answer === "yes");
        seen.push({ref, commit: found.commit, path: found.path, description, answers, qualifies});
        if (qualifies) kept.push({ref, commit: found.commit, path: found.path, folder: dirname(found.path), markdown: found.markdown});
        if (qualifies) {
            const id = ref.replace(/[^a-zA-Z0-9]+/g, "-");
            const target = join(BENCH, "skills", task, id, ref.slice(ref.lastIndexOf("@") + 1));
            mkdirSync(target, {recursive: true});
            const dir = found.dir;
            const files = git(dir, "ls-tree", "-r", "--name-only", found.commit, `${dirname(found.path)}/`).split("\n").filter((file) => file !== "");
            for (const file of files) {
                const to = join(target, file.slice(dirname(found.path).length + 1));
                mkdirSync(dirname(to), {recursive: true});
                writeFileSync(to, execFileSync("git", ["-C", dir, "show", `${found.commit}:${file}`], {maxBuffer: 512 * 1024 * 1024}));
            }
        }
    }
    out.push({task, read, qualified: kept.map((skill) => skill.ref), seen});
    if (kept.length >= MIN_KEEP) return {task, kept};
}
return null;
};
const chosen = await pick();

const ranking =
    chosen === null
        ? null
        : await ask(
              `An agent has this task:\n\n${readFileSync(join(BENCH, "skillsbench/tasks", chosen.task, "task.md"), "utf8").split(/^---$/m).slice(2).join("---").trim().slice(0, 3000)}\n\nHere are the full files of ${chosen.kept.length} skills.\n\n${chosen.kept.map((skill) => `=== ${skill.ref}\n${skill.markdown.slice(0, 6000)}`).join("\n\n")}\n\nRank them from most to least likely to get this task done, and for each say in a few words what it needs that the agent may not have. One line per skill, the best first, starting with its name as given after ===.`,
          );

const result = {at: new Date().toISOString(), chosen: chosen === null ? null : {task: chosen.task, skills: chosen.kept.map(({markdown: _markdown, ...skill}) => skill)}, ranking, readerCostUsd: cost, tasks: out};
const path = `data/measurements/demonstration-skills-${result.at.slice(0, 16).replace(":", "")}.json`;
writeFileSync(path, `${JSON.stringify(result, null, 1)}\n`);
console.log(path, chosen?.task ?? "no task qualifies", chosen?.kept.map((skill) => skill.ref), `reader $${cost.toFixed(3)}`);
console.log(ranking);
