/** Does the pulse change which skill an agent picks? Task 63, phase 5.
 *
 *      GITHUB_TOKEN=… bun run scripts/measure/pulse-eval.ts --round before --reps 3 --budget 6
 *      bun run scripts/measure/pulse-eval.ts --plan
 *
 *  Spends money: each run is a real `claude -p` session billed to whoever is logged in. Writes nothing
 *  on chain. **It measures the choice and runs no skill.** The results come from a public search, so
 *  their code is untrusted: the only commands allowed are the search and a read of one file, and
 *  nothing is installed. A skill's use is a separate, sandboxed step (`docs/tasks/63` §7).
 *
 *  ## The two arms, one difference
 *
 *  Same prompt, same model, same read of a skill's file.
 *  - **A** searches with `npx skills find`, as an agent can today.
 *  - **B** calls `arp_pulse`.
 *
 *  ## What is measured
 *
 *  For each run's chosen skill, what `readPulse` finds in it: key names, a login, paid words, a CLI
 *  outside what the machine has. A mention is not a requirement, so `clean` means "none of those
 *  matched", not "this works", and the chosen files are for a person to read too.
 */
import {spawn} from "node:child_process";
import {appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";

import {githubPulseSource, readPulse} from "../../packages/protocol/src/pulse.ts";

type Arm = "A" | "B";
type Need = {id: string; ask: string; domain: string; query: string; have: string[]};

const MACHINE = ["ffmpeg", "ffprobe", "python3", "node", "npx", "git"];
const NEEDS: Need[] = [
    {
        id: "silences",
        ask: "Remove the silent passages from a local video file, clip.mp4, and write the result to output.mp4.",
        domain: "video",
        query: "remove silence video",
        have: MACHINE,
    },
    {
        id: "voiceover",
        ask: "Turn a short text script, script.txt, into a narrated video with a voice-over, output.mp4.",
        domain: "video",
        query: "narrated video voiceover",
        have: MACHINE,
    },
    {
        id: "markdown",
        ask: "Turn a list of public web pages into clean Markdown files, one per page.",
        domain: "web",
        query: "web page to markdown",
        have: MACHINE,
    },
];

const ROOT = resolve(import.meta.dir, "..", "..");
const READ_SKILL = join(import.meta.dir, "pulse-eval", "read-skill.mjs");

function arg(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? undefined : process.argv[index + 1];
}

const round = arg("round") ?? "before";
const reps = Number(arg("reps") ?? 3);
const budget = Number(arg("budget") ?? 6);
const model = arg("model") ?? "sonnet";
const out = arg("out") ?? `data/measurements/pulse-eval-${new Date().toISOString().slice(0, 10)}.jsonl`;
const only = arg("only")?.split(",");
const needs = NEEDS.filter((need) => only === undefined || only.includes(need.id));

if (process.argv.includes("--plan")) {
    console.log(`${needs.length} needs x 2 arms x ${reps} reps = ${needs.length * 2 * reps} runs, stops at $${budget}`);
    process.exit(0);
}

function prompt(need: Need, arm: Arm): string {
    const search =
        arm === "A"
            ? `Search with: npx skills find "<words>".`
            : `Search with the arp_pulse tool: query "<words>", domain "${need.domain}", and the constraints this person gave.`;
    return [
        `A person asks: ${need.ask}`,
        `They will not create an account, pay for a service or provide an API key.`,
        `This machine has these commands and no others: ${need.have.join(", ")}.`,
        ``,
        `Choose the one agent skill you would install for this. Do not install or run anything.`,
        search,
        `You may read a result's file with: node ${READ_SKILL} owner/repo skill-name`,
        ``,
        `End with one line of JSON and nothing after it:`,
        `{"source":"owner/repo","skill":"name","needs":["what it needs from this person"]}`,
        `or {"none":true,"why":"..."} if nothing fits.`,
    ].join("\n");
}

type Stream = {
    type?: string;
    result?: string;
    is_error?: boolean;
    num_turns?: number;
    total_cost_usd?: number;
    message?: {content?: {type?: string; name?: string; input?: Record<string, unknown>; is_error?: boolean}[]};
};

function runClaude(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
    return new Promise((done) => {
        const child = spawn("claude", args, {cwd, env, stdio: ["ignore", "pipe", "ignore"]});
        let text = "";
        child.stdout.on("data", (chunk: Buffer) => (text += chunk.toString()));
        const timer = setTimeout(() => child.kill("SIGTERM"), 8 * 60 * 1000);
        child.on("close", () => {
            clearTimeout(timer);
            done(text);
        });
    });
}

const source = githubPulseSource(process.env["GITHUB_TOKEN"] === undefined ? {} : {token: process.env["GITHUB_TOKEN"]});

async function judge(need: Need, chosen: {source: string; skill: string}) {
    const pulse = await readPulse(
        {source: chosen.source, skill: chosen.skill, installs: null, installsText: null, url: null},
        source,
    );
    if (pulse.status !== "read") return {status: pulse.status};
    const missing = [...pulse.requires.cli, ...pulse.requires.runs].filter((name) => !need.have.includes(name));
    return {
        status: pulse.status,
        contentId: pulse.contentId,
        keys: pulse.keys,
        login: pulse.requires.login?.text ?? null,
        paidWords: pulse.paidWords,
        missingCommands: missing,
        runsAbsentFiles: pulse.runsAbsentFiles,
        clean: pulse.runsAbsentFiles.length === 0 && pulse.keys.length === 0 && pulse.requires.login === null && pulse.paidWords.length === 0 && missing.length === 0,
    };
}

type Choice = {source?: string; skill?: string; none?: boolean; why?: string; needs?: unknown};

function parseChoice(line: string): Choice | null {
    try {
        return JSON.parse(line.replace(/^`+|`+$/g, "")) as Choice; // fields checked where they are used
    } catch {
        return null;
    }
}

async function run(need: Need, arm: Arm, rep: number): Promise<Record<string, unknown>> {
    const cwd = mkdtempSync(join(tmpdir(), "arp-pulse-eval-"));
    const mcp = JSON.stringify({
        mcpServers: {
            arp: {
                command: "bun",
                args: ["run", join(ROOT, "apps/mcp/src/server.ts"), "--stdio"],
                env: {
                    ARP_TARGET: "testnet",
                    ARP_TOOLS: "read",
                    ARP_NO_RECEIPTS: "1",
                    ...(process.env["GITHUB_TOKEN"] === undefined ? {} : {GITHUB_TOKEN: process.env["GITHUB_TOKEN"]}),
                },
            },
        },
    });
    const allowed = [`Bash(node ${READ_SKILL}:*)`, ...(arm === "A" ? ["Bash(npx skills find:*)"] : ["mcp__arp__arp_pulse"])];
    const args = [
        "-p", prompt(need, arm),
        "--model", model,
        "--output-format", "stream-json", "--verbose",
        "--setting-sources", "project",
        "--strict-mcp-config",
        ...(arm === "B" ? ["--mcp-config", mcp] : []),
        "--tools", "Bash",
        "--allowedTools", allowed.join(","),
        "--no-session-persistence",
        "--max-budget-usd", "1",
    ];
    // Only what a session needs. The repository's secrets are in a file and never in this environment.
    const env: NodeJS.ProcessEnv = {PATH: process.env["PATH"], HOME: process.env["HOME"], DISABLE_TELEMETRY: "1", NO_COLOR: "1"};
    if (process.env["GITHUB_TOKEN"] !== undefined) env["GITHUB_TOKEN"] = process.env["GITHUB_TOKEN"];
    const started = Date.now();
    const text = await runClaude(args, cwd, env);
    rmSync(cwd, {recursive: true, force: true});

    let result: Stream | undefined;
    const tools: string[] = [];
    let sawUsage = false;
    let toolErrors = 0;
    for (const line of text.split("\n")) {
        if (line.trim() === "") continue;
        let parsed: Stream;
        try {
            parsed = JSON.parse(line) as Stream; // one stream-json event per line; fields checked as read
        } catch {
            continue;
        }
        if (line.includes('\\"declarations\\"')) sawUsage = true;
        if (parsed.type === "assistant") {
            for (const block of parsed.message?.content ?? []) {
                if (block.type === "tool_use" && block.name !== undefined) tools.push(block.name);
            }
        }
        if (parsed.type === "user") {
            for (const block of parsed.message?.content ?? []) {
                if (block.type === "tool_result" && block.is_error === true) toolErrors += 1;
            }
        }
        if (parsed.type === "result") result = parsed;
    }
    const answer = (result?.result ?? "").trim().split("\n").at(-1) ?? "";
    const chosen = parseChoice(answer);
    const judged =
        typeof chosen?.source === "string" && typeof chosen.skill === "string"
            ? await judge(need, {source: chosen.source, skill: chosen.skill})
            : null;
    return {
        round,
        need: need.id,
        arm,
        rep,
        model,
        at: new Date().toISOString(),
        chosen,
        judged,
        sawUsage,
        toolErrors,
        tools,
        turns: result?.num_turns ?? 0,
        costUsd: result?.total_cost_usd ?? 0,
        seconds: Math.round((Date.now() - started) / 1000),
        isError: result === undefined || result.is_error === true,
    };
}

let spent = 0;
if (existsSync(out)) {
    for (const line of readFileSync(out, "utf8").split("\n")) {
        if (line.trim() !== "") spent += (JSON.parse(line) as {costUsd?: number}).costUsd ?? 0; // this file's own rows
    }
}
const arms: Arm[] = round === "before" ? ["A", "B"] : ["B"];
for (let rep = 1; rep <= reps; rep += 1) {
    for (const need of needs) {
        const row = await Promise.all(
            arms.map(async (arm) => {
                if (spent >= budget) return null;
                return run(need, arm, rep);
            }),
        );
        for (const entry of row) {
            if (entry === null) continue;
            spent += Number(entry["costUsd"]);
            appendFileSync(out, `${JSON.stringify(entry)}\n`);
            const judged = entry["judged"] as {clean?: boolean; status?: string} | null;
            console.log(
                `${entry["need"]} ${entry["arm"]} ${rep} $${Number(entry["costUsd"]).toFixed(3)} ${JSON.stringify(entry["chosen"])?.slice(0, 110)} clean=${judged?.clean ?? judged?.status ?? "-"}`,
            );
        }
    }
}
console.log(`spent $${spent.toFixed(2)}, wrote ${out}`);
