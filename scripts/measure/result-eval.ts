/** What does Claude produce, alone, with ARP, and after a manual skills.sh search? Task 54.
 *
 *      (cd apps/cli && bun run build)
 *      bun run scripts/measure/result-eval.ts --plan                 runs and cost bound, spends nothing
 *      bun run scripts/measure/result-eval.ts --only slides --reps 1 a smoke test
 *      bun run scripts/measure/result-eval.ts                        run, check, judge, summarise
 *      bun run scripts/measure/result-eval.ts --summarise <file>     summarise a past run only
 *
 *  Flags: `--reps 3`, `--model sonnet`, `--judge-model opus`, `--jobs 3`, `--out <file.jsonl>`,
 *  `--only id,id`, `--keep <dir>` to keep each run's directory, `--budget <usd>` to start no run
 *  once the runs so far (this file, resumed ones included) cost that much. An interrupted run resumes.
 *
 *  Spends money: every run is a real `claude -p` session that writes files, billed to whoever is
 *  logged in. Writes nothing on chain: arm B's server runs in sponsored mode, whose `arp_get_skill`
 *  signs a content request with a throwaway key, and its declare tools are not allowed.
 *
 *  ## The three arms (`docs/tasks/54` §2), one difference each
 *
 *  Every run starts in an empty directory holding the need's inputs, with the same prompt, the same
 *  model and the same built-in tools: Bash, Read, Write, Edit, Glob, Grep, Skill. No web tools in
 *  any arm, so A is Claude from memory.
 *
 *  - **A** adds nothing.
 *  - **B** adds ARP's MCP server, `arp_find_tools` and `arp_get_skill` only, with `ARP_SKILLS_DIR`
 *    set so a fetched skill lands under `.claude/skills/` with its whole directory (task 57).
 *  - **C** has a skill installed before the session, the way a user would after searching
 *    skills.sh. The procedure is fixed here, before any run (§3 point 2): search skills.sh for the
 *    need's phrase, take the first result whose name says it makes the thing, and run `npx skills
 *    add <repo> --skill <name> -a claude-code -y`. The choices it gives are in `C_SKILLS`.
 *
 *  Isolation: `PIP_REQUIRE_VIRTUALENV` and a per-run `NPM_CONFIG_PREFIX`, so a run that installs a
 *  package cannot leave it for the next one; `--setting-sources project` over a directory with no
 *  settings, so the user's CLAUDE.md and hooks are not read and a project skill is.
 *
 *  ## What is measured (§3)
 *
 *  1. An **objective check** per need, on the file produced (`check` in `NEEDS`).
 *  2. A **blind judge** ranks the three results of one need and rep, labelled X, Y, Z at random. It
 *     sees a text rendering of each file, not the arm; "ARP" is replaced by "a registry".
 *  3. **Cost** in dollars per run, from `total_cost_usd`, and cost per passing result.
 *  4. **User effort**: 0 actions in A and B; in C the three steps above, and the install's time.
 */
import {spawn, spawnSync} from "node:child_process";
import {
    appendFileSync,
    copyFileSync,
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {inflateSync} from "node:zlib";

type Arm = "A" | "B" | "C";
const ARMS: Arm[] = ["A", "B", "C"];

type Check = {pass: boolean; facts: string[]; render: string};
type Need = {id: string; prompt: string; inputs: string[]; output: string; check: (dir: string) => Check};

const ROOT = resolve(import.meta.dir, "..", "..");
const FIXTURES = join(import.meta.dir, "result-eval");
const CLI = join(ROOT, "apps", "cli", "dist", "cli.js");
const RUN_TIMEOUT_MS = 20 * 60 * 1000;

function arg(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? undefined : process.argv[index + 1];
}

function sh(command: string, args: string[], cwd?: string): string {
    const out = spawnSync(command, args, {cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
    return out.status === 0 ? out.stdout : "";
}

// ---- the checks ---------------------------------------------------------------------------------

function checkSlides(dir: string): Check {
    const file = join(dir, "deck.pptx");
    if (!existsSync(file)) return {pass: false, facts: ["no deck.pptx"], render: "(no file)"};
    const names = sh("unzip", ["-Z1", file]).split("\n");
    const slides = names
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
    const media = names.filter((name) => name.startsWith("ppt/media/")).length;
    const texts = slides.map((slide) =>
        [...sh("unzip", ["-p", file, slide]).matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(" | "),
    );
    const all = texts.join(" ").toLowerCase();
    const covered = ["3.2", "85th", "throughput", "30 minutes", "range"].filter((fact) => all.includes(fact));
    return {
        pass: names.includes("ppt/presentation.xml") && slides.length >= 5,
        facts: [`${slides.length} slides`, `${media} media files`, `notes covered: ${covered.length}/5`],
        render: texts.map((text, index) => `Slide ${index + 1}: ${text}`).join("\n"),
    };
}

const DETAILS = [
    "Camille Durand",
    "1990-04-17",
    "camille.durand@example.org",
    "+33 6 12 34 56 78",
    "14 rue des Lilas",
    "Jean Durand",
    "yes",
    "2026-11-03",
];

/** Text a reader of the PDF can get at: the page text, and field values, inflated where compressed. */
function pdfText(file: string): string {
    const bytes = readFileSync(file);
    const raw = bytes.toString("latin1");
    const parts = [sh("pdftotext", ["-layout", file, "-"]), raw];
    for (const match of raw.matchAll(/stream\r?\n/g)) {
        const start = (match.index ?? 0) + match[0].length;
        const end = raw.indexOf("endstream", start);
        if (end === -1) continue;
        try {
            parts.push(inflateSync(bytes.subarray(start, end)).toString("latin1"));
        } catch {
            // Not a Flate stream, or one with trailing bytes: its text, if any, is in `raw` already.
        }
    }
    return parts.join("\n");
}

function checkPdf(dir: string): Check {
    const file = join(dir, "filled.pdf");
    if (!existsSync(file)) return {pass: false, facts: ["no filled.pdf"], render: "(no file)"};
    const pages = Number(sh("pdfinfo", [file]).match(/Pages:\s+(\d+)/)?.[1] ?? 0);
    const text = pdfText(file);
    const found = DETAILS.filter((value) => text.includes(value));
    return {
        pass: pages === 2 && found.length === DETAILS.length,
        facts: [`${pages} pages`, `values found: ${found.length}/${DETAILS.length}`],
        render: `Pages: ${pages}\nValues found: ${found.join("; ")}\nMissing: ${DETAILS.filter((v) => !found.includes(v)).join("; ") || "none"}\nPage text:\n${sh("pdftotext", ["-layout", file, "-"]).slice(0, 4000)}`,
    };
}

function checkLanding(dir: string): Check {
    const file = join(dir, "index.html");
    if (!existsSync(file)) return {pass: false, facts: ["no index.html"], render: "(no file)"};
    const html = readFileSync(file, "utf8");
    const has = {
        title: /sourdough/i.test(html),
        price: /49/.test(html),
        checkout: html.includes("https://example.com/checkout/sourdough"),
    };
    const local = readdirSync(dir).filter((name) => /\.(css|js|png|jpe?g|svg|webp)$/i.test(name));
    return {
        pass: has.title && has.price && has.checkout,
        facts: [
            `${html.length} bytes`,
            `title ${has.title}, price ${has.price}, checkout link ${has.checkout}`,
            `${local.length} local asset(s)`,
        ],
        render: html.slice(0, 40000),
    };
}

const NEEDS: Need[] = [
    {
        id: "slides",
        prompt: "I have notes for a talk in notes.md. Turn them into a slide deck I can present, saved as deck.pptx in this folder.",
        inputs: ["notes.md"],
        output: "deck.pptx",
        check: checkSlides,
    },
    {
        id: "pdf",
        prompt: "I have two PDF forms here, registration.pdf and consent.pdf, and my details in details.md. Fill both in and merge them into one file, filled.pdf.",
        inputs: ["registration.pdf", "consent.pdf", "details.md"],
        output: "filled.pdf",
        check: checkPdf,
    },
    {
        id: "landing",
        prompt: "I need a landing page for my online course, described in course.md. Make it, as index.html in this folder.",
        inputs: ["course.md"],
        output: "index.html",
        check: checkLanding,
    },
];

/** Arm C's skills: skills.sh search, 2026-11-03, the first result whose name says it makes the thing
 *  (`docs/tasks/54` §4b point 3). For `landing` the first result is an audit, `autonnel`
 *  landing-page-conversion-audit, which a user wanting a page skips. */
const C_SKILLS: Record<string, {query: string; repo: string; skill: string}> = {
    slides: {query: "slide deck from notes", repo: "anthropics/skills", skill: "pptx"},
    pdf: {query: "fill pdf form", repo: "claude-office-skills/skills", skill: "pdf-form-filler"},
    landing: {query: "landing page", repo: "101-skills/superpowers", skill: "landing-page-design"},
};

// ---- running ------------------------------------------------------------------------------------

type RunRecord = {
    kind: "run";
    need: string;
    arm: Arm;
    rep: number;
    pass: boolean;
    facts: string[];
    render: string;
    costUsd: number;
    seconds: number;
    turns: number;
    isError: boolean;
    toolCalls: string[];
    /** Arm B: what `arp_find_tools` was asked and which skill was fetched. */
    arp: {queries: string[]; fetched: string[]};
    /** Arm C: the user's steps, and the install's wall-clock time. */
    effort: {actions: number; installSeconds: number};
    answer: string;
};
type JudgeRecord = {
    kind: "judge";
    need: string;
    rep: number;
    labels: Record<string, Arm>;
    ranking: Arm[];
    raw: string;
};

function claude(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
    return new Promise((done) => {
        const child = spawn("claude", args, {cwd, env, stdio: ["ignore", "pipe", "pipe"]});
        let out = "";
        child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
        const timer = setTimeout(() => child.kill("SIGTERM"), RUN_TIMEOUT_MS);
        child.on("close", () => {
            clearTimeout(timer);
            done(out);
        });
    });
}

type StreamLine = {
    type?: string;
    message?: {content?: {type?: string; name?: string; input?: Record<string, unknown>}[]};
    result?: string;
    is_error?: boolean;
    num_turns?: number;
    total_cost_usd?: number;
};

const SKILL_CACHE = mkdtempSync(join(tmpdir(), "arp-result-skills-"));

/** Install arm C's skill once into a cache, timed; each run copies it. */
const installed = new Map<string, number>();
function installC(need: string): number {
    const cached = installed.get(need);
    if (cached !== undefined) return cached;
    const choice = C_SKILLS[need];
    if (choice === undefined) throw new Error(`no arm C skill for ${need}`);
    const dir = join(SKILL_CACHE, need);
    mkdirSync(dir, {recursive: true});
    const started = Date.now();
    const out = spawnSync(
        "npx",
        ["-y", "skills", "add", choice.repo, "--skill", choice.skill, "-a", "claude-code", "-y", "--copy"],
        {cwd: dir, encoding: "utf8"},
    );
    if (out.status !== 0 || !existsSync(join(dir, ".claude", "skills", choice.skill, "SKILL.md"))) {
        throw new Error(`arm C install failed for ${need}: ${out.stderr.slice(-400)}`);
    }
    const seconds = (Date.now() - started) / 1000;
    installed.set(need, seconds);
    return seconds;
}

async function runOne(need: Need, arm: Arm, rep: number, model: string, keep: string | undefined): Promise<RunRecord> {
    const cwd = mkdtempSync(join(tmpdir(), `arp-result-${need.id}-${arm}-`));
    for (const input of need.inputs) copyFileSync(join(FIXTURES, input), join(cwd, input));
    let installSeconds = 0;
    if (arm === "C") {
        installSeconds = installC(need.id);
        cpSync(join(SKILL_CACHE, need.id, ".claude"), join(cwd, ".claude"), {recursive: true});
    }
    const scratch = mkdtempSync(join(tmpdir(), "arp-result-env-"));
    const env = {
        ...process.env,
        PIP_REQUIRE_VIRTUALENV: "true",
        NPM_CONFIG_PREFIX: join(scratch, "npm"),
    };
    const builtins = "Bash,Read,Write,Edit,Glob,Grep,Skill";
    const arpTools = "mcp__arp__arp_find_tools,mcp__arp__arp_get_skill";
    const mcpConfig = JSON.stringify({
        mcpServers: {
            arp: {
                command: "node",
                args: [CLI, "mcp"],
                env: {
                    ARP_TARGET: "testnet",
                    ARP_TOOLS: "sponsored",
                    ARP_SKILLS_DIR: ".claude/skills",
                    ARP_HOME: join(scratch, "arp"),
                },
            },
        },
    });
    const args = [
        "-p", need.prompt,
        "--model", model,
        "--output-format", "stream-json", "--verbose",
        "--setting-sources", "project",
        "--strict-mcp-config",
        ...(arm === "B" ? ["--mcp-config", mcpConfig] : []),
        "--tools", builtins,
        "--allowedTools", arm === "B" ? `${builtins},${arpTools}` : builtins,
        "--no-session-persistence",
    ];
    const started = Date.now();
    const out = await claude(args, cwd, env);
    const seconds = (Date.now() - started) / 1000;

    const toolCalls: string[] = [];
    const queries: string[] = [];
    const fetched: string[] = [];
    let result: StreamLine | undefined;
    for (const line of out.split("\n")) {
        if (line.trim() === "") continue;
        let parsed: StreamLine;
        try {
            parsed = JSON.parse(line) as StreamLine; // one stream-json event per line; fields checked as read
        } catch {
            continue;
        }
        if (parsed.type === "assistant")
            for (const block of parsed.message?.content ?? []) {
                if (block.type !== "tool_use" || block.name === undefined) continue;
                toolCalls.push(block.name);
                if (block.name === "mcp__arp__arp_find_tools") queries.push(JSON.stringify(block.input ?? {}));
                if (block.name === "mcp__arp__arp_get_skill") fetched.push(String(block.input?.["id"] ?? ""));
            }
        if (parsed.type === "result") result = parsed;
    }
    const check = need.check(cwd);
    if (keep !== undefined) cpSync(cwd, join(keep, `${need.id}-${arm}-${rep}`), {recursive: true});
    rmSync(cwd, {recursive: true, force: true});
    rmSync(scratch, {recursive: true, force: true});
    return {
        kind: "run",
        need: need.id,
        arm,
        rep,
        pass: check.pass,
        facts: check.facts,
        render: check.render,
        costUsd: result?.total_cost_usd ?? 0,
        seconds,
        turns: result?.num_turns ?? 0,
        isError: result === undefined || result.is_error === true,
        toolCalls,
        arp: {queries, fetched},
        effort: {actions: arm === "C" ? 3 : 0, installSeconds},
        answer: (result?.result ?? "").slice(0, 4000),
    };
}

function shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j] as T, items[i] as T]; // i and j are both below items.length
    }
    return items;
}

async function judgeOne(need: Need, runs: RunRecord[], model: string): Promise<JudgeRecord> {
    const order = shuffle([...runs]);
    const labels: Record<string, Arm> = {};
    const blind = (text: string) => text.replace(/\bARP\b/gi, "a registry");
    const sections = order.map((run, index) => {
        const label = ["X", "Y", "Z"][index] as string;
        labels[label] = run.arm;
        return `RESULT ${label}\nChecks: ${run.facts.join("; ")}\nContent:\n${blind(run.render)}`;
    });
    const question = [
        "Three assistants were each given the same request and the same input files, and each produced a file.",
        "Rank the files from best to worst for the person who asked: does it do what they asked, is it complete and",
        "correct, would they use it as it is. Judge the file, not how it was made.",
        "",
        `REQUEST:\n${need.prompt}`,
        "",
        ...sections.flatMap((section) => [section, ""]),
        'Reply with one line of JSON and nothing else: {"ranking": ["best label", "middle label", "worst label"]}',
    ].join("\n");
    const cwd = mkdtempSync(join(tmpdir(), "arp-result-judge-"));
    const out = await claude(
        ["-p", question, "--model", model, "--output-format", "json", "--setting-sources", "", "--strict-mcp-config", "--tools", "", "--no-session-persistence"],
        cwd,
        process.env,
    );
    rmSync(cwd, {recursive: true, force: true});
    let raw = "";
    let ranking: Arm[] = [];
    try {
        raw = String((JSON.parse(out) as {result?: unknown}).result ?? ""); // `--output-format json` returns one object
        const picked = (JSON.parse(raw.match(/\{[^}]*\}/)?.[0] ?? "{}") as {ranking?: unknown}).ranking;
        if (Array.isArray(picked)) ranking = picked.map((label) => labels[String(label)]).filter((arm): arm is Arm => arm !== undefined);
    } catch {
        ranking = [];
    }
    return {kind: "judge", need: need.id, rep: runs[0]?.rep ?? 0, labels, ranking: ranking.length === 3 ? ranking : [], raw};
}

// ---- summary ------------------------------------------------------------------------------------

function wilson(k: number, n: number): string {
    if (n === 0) return "n/a";
    const z = 1.96;
    const p = k / n;
    const centre = (p + (z * z) / (2 * n)) / (1 + (z * z) / n);
    const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
    return `${Math.round(Math.max(0, centre - half) * 100)}–${Math.round(Math.min(1, centre + half) * 100)}%`;
}

function summarise(file: string): void {
    const records = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => JSON.parse(line) as RunRecord | JudgeRecord); // this script's own output
    const runs = records.filter((r): r is RunRecord => r.kind === "run");
    const judged = records.filter((r): r is JudgeRecord => r.kind === "judge" && r.ranking.length === 3);
    console.log(`${file}: ${runs.length} runs, ${judged.length} judged triples`);
    for (const need of [...new Set(runs.map((run) => run.need)), "all"]) {
        console.log(`\n${need}`);
        for (const arm of ARMS) {
            const mine = runs.filter((run) => run.arm === arm && (need === "all" || run.need === need));
            if (mine.length === 0) continue;
            const passed = mine.filter((run) => run.pass).length;
            const cost = mine.reduce((sum, run) => sum + run.costUsd, 0);
            const ranks = judged
                .filter((j) => need === "all" || j.need === need)
                .map((j) => j.ranking.indexOf(arm) + 1);
            const meanRank = ranks.length === 0 ? "n/a" : (ranks.reduce((a, b) => a + b, 0) / ranks.length).toFixed(2);
            const firsts = ranks.filter((rank) => rank === 1).length;
            console.log(
                `  ${arm}  check ${passed}/${mine.length} (${wilson(passed, mine.length)})  ` +
                    `$${cost.toFixed(2)} total, ${passed === 0 ? "no pass" : `$${(cost / passed).toFixed(2)} per pass`}  ` +
                    `judged first ${firsts}/${ranks.length} (${wilson(firsts, ranks.length)}), mean rank ${meanRank}` +
                    (arm === "B" ? `  fetched a skill in ${mine.filter((run) => run.arp.fetched.length > 0).length}/${mine.length}` : "") +
                    (arm === "C" ? `  user: 3 actions, install ${Math.max(...mine.map((run) => run.effort.installSeconds)).toFixed(0)} s` : ""),
            );
        }
        const pairs = judged.filter((j) => need === "all" || j.need === need);
        const beats = (x: Arm, y: Arm) => pairs.filter((j) => j.ranking.indexOf(x) < j.ranking.indexOf(y)).length;
        if (pairs.length > 0) {
            console.log(`  B above A ${beats("B", "A")}/${pairs.length} (${wilson(beats("B", "A"), pairs.length)}), B above C ${beats("B", "C")}/${pairs.length} (${wilson(beats("B", "C"), pairs.length)})`);
        }
    }
}

// ---- main ---------------------------------------------------------------------------------------

const past = arg("summarise");
if (past !== undefined) {
    summarise(past);
    process.exit(0);
}

const reps = Number(arg("reps") ?? "3");
const model = arg("model") ?? "sonnet";
const judgeModel = arg("judge-model") ?? "opus";
const jobs = Number(arg("jobs") ?? "3");
const only = arg("only")?.split(",");
const keep = arg("keep");
const budget = Number(arg("budget") ?? "Infinity");
const needs = NEEDS.filter((need) => only === undefined || only.includes(need.id));
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "T");
const out = arg("out") ?? join(ROOT, "data", "measurements", `result-eval-${stamp}.jsonl`);

const plan = needs.flatMap((need) => ARMS.flatMap((arm) => Array.from({length: reps}, (_, rep) => ({need, arm, rep}))));
console.log(
    `${needs.length} need(s) × ${ARMS.length} arms × ${reps} rep(s) = ${plan.length} runs (${model}), ` +
        `${needs.length * reps} judge calls (${judgeModel}); out ${out}`,
);
if (process.argv.includes("--plan")) process.exit(0);

if (!existsSync(CLI)) {
    console.error(`${CLI} is missing: (cd apps/cli && bun run build)`);
    process.exit(1);
}
if (keep !== undefined) mkdirSync(keep, {recursive: true});

const done = existsSync(out)
    ? readFileSync(out, "utf8")
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map((line) => JSON.parse(line) as RunRecord | JudgeRecord) // this script's own output
    : [];
const has = (need: string, arm: Arm, rep: number) =>
    done.some((r) => r.kind === "run" && r.need === need && r.arm === arm && r.rep === rep);
const todo = shuffle(plan.filter((item) => !has(item.need.id, item.arm, item.rep)));
// Arm C's installs run first and once each, outside the timed sessions.
for (const need of needs) installC(need.id);

const queue = [...todo];
await Promise.all(
    Array.from({length: Math.max(1, jobs)}, async () => {
        for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
            const spent = done.reduce((sum, r) => sum + (r.kind === "run" ? r.costUsd : 0), 0);
            if (spent >= budget) {
                console.log(`  budget $${budget} reached ($${spent.toFixed(2)} spent): ${item.need.id} ${item.arm} #${item.rep} not started`);
                continue;
            }
            const record = await runOne(item.need, item.arm, item.rep, model, keep);
            appendFileSync(out, `${JSON.stringify(record)}\n`);
            done.push(record);
            console.log(`  ${item.need.id} ${item.arm} #${item.rep}  ${record.pass ? "pass" : "FAIL"}  $${record.costUsd.toFixed(3)}  ${record.seconds.toFixed(0)} s  ${record.facts.join("; ")}`);
        }
    }),
);

for (const need of needs)
    for (let rep = 0; rep < reps; rep++) {
        if (done.some((r) => r.kind === "judge" && r.need === need.id && r.rep === rep)) continue;
        const triple = ARMS.map((arm) =>
            done.find((r): r is RunRecord => r.kind === "run" && r.need === need.id && r.arm === arm && r.rep === rep),
        ).filter((r): r is RunRecord => r !== undefined);
        if (triple.length !== 3) continue;
        const verdict = await judgeOne(need, triple, judgeModel);
        appendFileSync(out, `${JSON.stringify(verdict)}\n`);
        done.push(verdict);
    }
rmSync(SKILL_CACHE, {recursive: true, force: true});
summarise(out);
