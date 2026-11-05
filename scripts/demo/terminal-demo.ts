#!/usr/bin/env bun
/** ARP in a terminal, about three minutes, for someone who has never heard of it. `docs/26` §6 says what to say.
 *
 *      bun install && bun run --cwd apps/cli build     once, from a clean checkout
 *      bun run scripts/demo/terminal-demo.ts           Enter moves to the next step
 *      bun run scripts/demo/terminal-demo.ts --no-pause
 *
 *  Reads only. No key, no sponsor, no transaction, nothing written on any chain: `arp share send` runs only while
 *  sharing is off, where it stops before loading a writer, and each program gets an environment of six variables, with
 *  a throwaway folder as its home. A step that cannot run says so and the next one runs. The folder is removed at the end.
 */
import {spawn, spawnSync, type ChildProcessWithoutNullStreams} from "node:child_process";
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createInterface} from "node:readline/promises";

import deployment from "../../data/deployments/13579.json";

const ROOT = join(import.meta.dir, "..", "..");
const CLI = join(ROOT, "apps", "cli", "dist", "cli.js");
const PAUSE = !process.argv.includes("--no-pause") && process.stdin.isTTY === true;
const WIDTH = 78;
const SKILL = "web-to-markdown";
const SOURCE = "softaworks/agent-toolkit";
const SEARCH = {queries: ["web to markdown"], domain: "document", limit: 5};
const MISSING_COMMAND = "web2md https://example.com --print";
const SESSION = "terminal-demo";

const home = mkdtempSync(join(tmpdir(), "arp-demo-"));
const project = join(home, "project");
mkdirSync(project);
const arpHome = join(home, ".arp");
/** Nothing of the person's reaches these programs: no key, no token, and not their real home. */
const childEnv = {PATH: process.env["PATH"] ?? "", HOME: home, ARP_HOME: arpHome, ARP_TARGET: "testnet", ARP_TOOLS: "read", ARP_NO_RECEIPTS: "1"};

/** A skill's file and a graph label are somebody else's words, so no escape sequence of theirs reaches the terminal. */
const say = (text = "") => console.log(text.replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, " "));
function wrapped(text: string, indent = ""): void {
    if (text.startsWith("\n")) say();
    let line = indent;
    for (const word of text.trim().split(/\s+/)) {
        if (line.length + word.length + 1 > WIDTH && line.trim() !== "") {
            say(line.trimEnd());
            line = indent;
        }
        line += `${word} `;
    }
    say(line.trimEnd());
}
const field = (label: string, value: string) => wrapped(`${label}: ${value}`, "    ");

let readline: ReturnType<typeof createInterface> | null = null;
function pause(prompt: string): Promise<string> {
    if (readline === null) {
        readline = createInterface({input: process.stdin, output: process.stdout});
        // Without this, Ctrl-C closes the prompt, the question never returns, and the folder stays.
        readline.on("SIGINT", () => stopNow());
    }
    return readline.question(prompt);
}
async function step(at: number, title: string, kind: string): Promise<void> {
    if (PAUSE) {
        await pause("\n[Enter]");
    }
    say(`\n${"=".repeat(WIDTH)}\n${at}. ${title}\n   ${kind}\n${"=".repeat(WIDTH)}`);
}
const LOCAL = "LOCAL TEST: on this machine, in a throwaway folder. Nothing about it leaves.";
const LOCAL_NOTE = "LOCAL NOTE, on a public search: the note is read from this machine only.";
const READ = "PUBLIC READ: asks public services. Nothing is written anywhere.";
const CHAIN = "ON CHAIN: read back from Intuition testnet 13579. Test money, not mainnet.";
const FIGURES = "READ: testnet 13579, its explorer and this repository. Nothing is written.";

/** The real MCP server, as a client launches it: JSON-RPC, one message a line, over stdio. */
class Server {
    private readonly process: ChildProcessWithoutNullStreams;
    private buffer = "";
    private next = 1;
    private readonly waiting = new Map<number, (answer: {result?: unknown; error?: {message: string}}) => void>();

    constructor() {
        this.process = spawn("node", [CLI, "mcp"], {cwd: project, env: childEnv});
        this.process.stderr.resume();
        this.process.stdout.setEncoding("utf8");
        this.process.stdout.on("data", (chunk: string) => {
            this.buffer += chunk;
            for (let end = this.buffer.indexOf("\n"); end !== -1; end = this.buffer.indexOf("\n")) {
                const line = this.buffer.slice(0, end);
                this.buffer = this.buffer.slice(end + 1);
                if (line.trim() === "") continue;
                const answer = JSON.parse(line) as {id?: number; result?: unknown; error?: {message: string}}; // a JSON-RPC message
                if (answer.id !== undefined) this.waiting.get(answer.id)?.(answer);
            }
        });
    }

    private call(method: string, params: unknown, timeoutMs: number): Promise<{result?: unknown; error?: {message: string}}> {
        const id = this.next++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`no answer to ${method} in ${timeoutMs / 1000} s`)), timeoutMs);
            this.waiting.set(id, (answer) => {
                clearTimeout(timer);
                resolve(answer);
            });
            this.process.stdin.write(`${JSON.stringify({jsonrpc: "2.0", id, method, params})}\n`);
        });
    }

    async start(): Promise<void> {
        await this.call("initialize", {protocolVersion: "2025-06-18", capabilities: {}, clientInfo: {name: "terminal-demo", version: "1"}}, 20_000);
        this.process.stdin.write(`${JSON.stringify({jsonrpc: "2.0", method: "notifications/initialized"})}\n`);
    }

    /** The answer as the tool wrote it, and the text a runtime hands the hook. */
    async pulse(args: Record<string, unknown>): Promise<{text: string; answer: PulseAnswer}> {
        const reply = await this.call("tools/call", {name: "arp_pulse", arguments: args}, 70_000);
        if (reply.error !== undefined) throw new Error(reply.error.message);
        const text = (reply.result as {content?: {text?: string}[]}).content?.[0]?.text ?? ""; // an MCP tool result
        return {text, answer: JSON.parse(text) as PulseAnswer}; // the tool's own JSON, read field by field
    }

    stop(): void {
        this.process.kill();
    }
}

type Skill = {
    name: string;
    source: string;
    status: string;
    path?: string;
    installs_on_skills_sh?: string;
    size?: {files: number; scripts: number};
    its_file_mentions?: {keys?: string[]; login?: {line: number; text: string}; paid_words?: string[]; hosts?: string[]};
    declares_cli?: string[];
    runs?: string[];
    failed_on_this_machine?: {reasons: Record<string, number>; last: string; matched_by_name_only?: boolean};
    unconfirmed?: unknown;
    usage?: {written_by_agents?: string; wallets?: number; by_outcome?: Record<string, number>; by_reason?: Record<string, number>; by_domain?: Record<string, number>};
};
type PulseAnswer = {search?: string; detail?: string; domain?: string; results_found?: number; skills?: Skill[]; agents?: {used_here?: {label?: string}[]; offers_matching_need?: unknown[]} | null;};

const counts = (of: Record<string, number>) => Object.entries(of).map(([word, count]) => `${word} ${count}`).join(", ");
const shortened = (text: string) => (text.length > 70 ? `${text.slice(0, 67)}...` : text);

function describeWritten(skill: Skill): void {
    const usage = skill.usage;
    if (usage?.by_outcome === undefined) {
        field("what agents wrote", "nobody yet");
        return;
    }
    const why = usage.by_reason === undefined ? "" : `, because ${counts(usage.by_reason)}`;
    field("what agents wrote", `${counts(usage.by_outcome)}${why}, from ${usage.wallets ?? 0} wallet(s)`);
}

function describeNote(skill: Skill): void {
    if (skill.failed_on_this_machine === undefined) return;
    field(">>> failed on this machine", `${counts(skill.failed_on_this_machine.reasons)}, last ${skill.failed_on_this_machine.last}`);
}

function describeSkill(skill: Skill): void {
    say(`\n  ${skill.name}  (${skill.source})`);
    if (skill.installs_on_skills_sh !== undefined) field("installs, the search's figure, not a count of use", skill.installs_on_skills_sh);
    if (skill.status !== "read" && skill.status !== "read_file_only") {
        field("its files", "could not be read here, so what it asks for is unknown");
    } else {
        if (skill.size !== undefined) field("it ships", `${skill.size.files} files, ${skill.size.scripts} scripts`);
        const mentions = skill.its_file_mentions ?? {};
        const commands = [...new Set([...(skill.declares_cli ?? []), ...(skill.runs ?? [])])];
        field("commands it names", commands.length === 0 ? "none found" : commands.join(", "));
        field("keys it names", mentions.keys?.join(", ") ?? "none found");
        field("a login", mentions.login === undefined ? "none found" : `line ${mentions.login.line}: ${shortened(mentions.login.text)}`);
        field("hosts it names", mentions.hosts?.slice(0, 5).join(", ") ?? "none found");
        field("words suggesting a paid service", mentions.paid_words?.join(", ") ?? "none found");
    }
    describeWritten(skill);
    describeNote(skill);
}

/** One payload to the real hook, as a runtime sends it. */
function hook(payload: Record<string, unknown>): void {
    const run = spawnSync("node", [CLI, "hook"], {cwd: project, env: childEnv, input: JSON.stringify({session_id: SESSION, cwd: project, ...payload}), encoding: "utf8", timeout: 20_000});
    if (run.status !== 0) throw new Error(`the hook exited with ${String(run.status)}: ${run.stderr}`);
}

function arp(...args: string[]): string {
    const run = spawnSync("node", [CLI, ...args], {cwd: project, env: childEnv, encoding: "utf8", timeout: 20_000});
    return `${run.stdout}${run.stderr}`.trimEnd();
}
function showArp(...args: string[]): void {
    say(`\n$ arp ${args.join(" ")}`);
    for (const line of arp(...args).split("\n")) say(`  ${line}`);
}

const failuresFile = join(arpHome, "failures.jsonl");
const failureLines = () => (existsSync(failuresFile) ? readFileSync(failuresFile, "utf8").trim().split("\n").filter((line) => line !== "") : []);

function failingCall(command: string): {error: string; code: number | null} {
    const run = spawnSync("bash", ["-c", command], {cwd: project, env: childEnv, encoding: "utf8", timeout: 20_000});
    return {error: `Exit code ${String(run.status)}\n${run.stderr}`, code: run.status};
}

let server: Server | null = null;
let firstAnswer: {text: string; answer: PulseAnswer} | null = null;

async function stepSearch(): Promise<void> {
    await step(1, "A real search, before anything is installed", READ);
    wrapped(`An agent needs to turn a web page into markdown. It calls arp_pulse on ARP's MCP server: the built program, spoken to over stdio as Claude Code would. The first run downloads the search package, about 20 seconds.`);
    say(`\n  query: ${JSON.stringify(SEARCH.queries[0])}  domain: ${SEARCH.domain}`);
    server = new Server();
    await server.start();
    firstAnswer = await server.pulse(SEARCH);
    const {answer} = firstAnswer;
    if (answer.search === "unavailable") {
        wrapped(`\nThe search did not run: ${answer.detail ?? "no reason given"}. The next steps go on without it.`, "  ");
        return;
    }
    say(`\n  ${answer.results_found ?? 0} results from the search. What the files of the first ones ask for:`);
    wrapped("These are matches in the files, not proven requirements.", "  ");
    const skills = answer.skills ?? [];
    for (const skill of skills.slice(0, 3)) describeSkill(skill);
    const own = skills.find((skill) => skill.name === SKILL && skill.source === SOURCE);
    if (own !== undefined && !skills.slice(0, 3).includes(own)) describeSkill(own);
    if (own === undefined) wrapped(`\n${SOURCE}@${SKILL}, which the next steps use, is not in this answer today. They go on with it anyway.`, "  ");
    const agents = (answer.agents?.used_here?.length ?? 0) + (answer.agents?.offers_matching_need?.length ?? 0);
    wrapped(`\nThe same search also returns agents: ${agents} here. Whether one answers, and what it asks, is a separate check this demo does not run.`, "  ");
}

async function realSkillFile(): Promise<{markdown: string; real: boolean}> {
    const path = firstAnswer?.answer.skills?.find((skill) => skill.name === SKILL)?.path ?? `skills/${SKILL}/SKILL.md`;
    try {
        const response = await fetch(`https://raw.githubusercontent.com/${SOURCE}/HEAD/${path}`, {signal: AbortSignal.timeout(10_000)});
        if (response.ok) return {markdown: await response.text(), real: true};
    } catch {
        // Said on screen by the caller, from `real`.
    }
    return {markdown: `---\nname: ${SKILL}\n---\n\n\`\`\`bash\nweb2md <url>\n\`\`\`\n`, real: false};
}

async function stepFailure(): Promise<void> {
    await step(2, "The skill fails, and the hook notes it", LOCAL);
    const {markdown, real} = await realSkillFile();
    const directory = join(project, ".claude", "skills", SKILL);
    mkdirSync(directory, {recursive: true});
    writeFileSync(join(directory, "SKILL.md"), markdown);
    wrapped(real
        ? `The skill's real file is put in a throwaway project. Its instructions call a program, web2md.`
        : `GitHub did not answer, so a one-line stand-in for the skill's file is used here. Everything else in this step is real.`);
    if (firstAnswer !== null) {
        hook({hook_event_name: "PostToolUse", tool_name: "mcp__arp__arp_pulse", tool_use_id: "demo-1", tool_input: SEARCH, tool_response: [{type: "text", text: firstAnswer.text}]});
    }
    hook({hook_event_name: "PostToolUse", tool_name: "Skill", tool_use_id: "demo-2", tool_input: {skill: SKILL}, tool_response: {success: true}});

    if (spawnSync("bash", ["-c", "command -v web2md"], {env: childEnv}).status === 0) {
        wrapped("web2md is installed on this machine, so this skill does not fail here and this step has nothing true to show. Going on.");
        return;
    }
    say(`\n$ ${MISSING_COMMAND}`);
    const failure = failingCall(MISSING_COMMAND);
    say(`  ${failure.error.trim().split("\n").join("\n  ")}`);
    hook({hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_use_id: "demo-3", tool_input: {command: MISSING_COMMAND}, error: failure.error});

    const lines = failureLines();
    if (lines.length === 0) {
        wrapped("\nThe hook wrote no line for this failure. Going on.");
        return;
    }
    wrapped(`\nThe real hook got that failure, the way a runtime hands it over. What it wrote in the throwaway ~/.arp/failures.jsonl:`);
    for (const line of lines) wrapped(line, "  ");
    const leaked = lines.some((line) => line.includes("example.com") || line.includes("web2md"));
    wrapped(`\nThe URL and the command in that line: ${leaked ? "PRESENT, which is a defect" : "absent, checked just now"}. The hook keeps a closed reason and never the command or its output.`);

    const before = lines.length;
    const unrelated = "arp-demo-nothing-asked-for-this --help";
    hook({hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_use_id: "demo-4", tool_input: {command: unrelated}, error: failingCall(unrelated).error});
    wrapped(`A failure no skill asked for was also handed to the hook: lines added, ${failureLines().length - before}.`);
}

async function stepNextSearch(): Promise<void> {
    await step(3, "The next search reports it", LOCAL_NOTE);
    if (server === null) throw new Error("the server did not start in step 1");
    wrapped("The same search again, on the same machine. This line comes from the local file, and nobody else can see it.");
    const {answer} = await server.pulse(SEARCH);
    if (answer.search === "unavailable") {
        wrapped(`\nThe search did not run, so it has nothing to attach the note to: ${answer.detail ?? "no reason given"}.`);
        return;
    }
    const skills = answer.skills ?? [];
    const own = skills.find((skill) => skill.failed_on_this_machine !== undefined);
    if (own === undefined) {
        wrapped(`No result in this answer carries the note. ${skills.some((skill) => skill.name === SKILL) ? "The skill is there, so the note is what is missing." : `${SKILL} is not in the answer today.`}`);
        return;
    }
    say(`\n  ${own.name}  (${own.source})`);
    describeWritten(own);
    describeNote(own);
}

function stepShare(): Promise<void> {
    return step(4, "What would be public, with sharing off by default", LOCAL).then(() => {
        showArp("share");
        showArp("share", "send");
        wrapped("\nSharing is off until the person turns it on. Turned on here, in the throwaway folder only, to read what it would say:");
        showArp("share", "on");
        wrapped(arp("share").includes("would be public")
            ? "\nThat line is all that would leave: the skill's public URL, a domain, `failed`, and a reason from a closed list. No session, date, path, command or output. A skill with no known public source stays on the machine."
            : "\nNothing would leave: this failure has no known public source, so it stays on the machine.");
        wrapped("This demo stops here and does not run `arp share send` with sharing on: that writes a permanent line on testnet, through a sponsoring service that runs only on our own machine.");
    });
}

async function stepChain(): Promise<void> {
    await step(5, "A real public line, read back from the chain", CHAIN);
    const {aboutASkill, hasOutcomeAtom, OURS, readResultLines} = await import("../helpers/line-writers.ts");
    const {WALLETS_TO_MOVE} = await import("../../packages/protocol/src/pulse-score.ts");
    const lines = (await readResultLines(await hasOutcomeAtom())).filter(aboutASkill);
    const line = lines.filter((entry) => entry.tool?.includes(`?skill=${SKILL}`)).at(-1) ?? lines.at(-1);
    if (line === undefined) {
        say("No result line about a skill was found on the graph.");
        return;
    }
    const ours = OURS.has(line.creator.toLowerCase());
    const payer = line.creator.toLowerCase() === deployment.arp.sponsor.toLowerCase() ? "our treasury, the sponsoring service's wallet" : ours ? "our own key" : "a wallet that is not ours";
    wrapped(ours
        ? "This is a real transaction, and it is ours: a test line, not a report from a third party. No third party has reported a result on a skill yet."
        : "This is a real transaction, written by a wallet that is not ours.");
    say(`\n  the sentence:`);
    say(`    T1  ${line.agent ?? "?"}  uses  ${line.tool ?? "?"}`);
    if (line.domain !== null) say(`    T2  (T1)  in context of  ${line.domain}`);
    say(`    T3  (${line.domain === null ? "T1" : "T2"})  has outcome  ${line.outcome}`);
    if (line.reason !== null) say(`    T4  (T3)  because  ${line.reason}`);
    say(`\n  written   ${line.at}`);
    say(`  T3 id     ${line.termId}`);
    say(`  who paid  ${line.creator}, ${payer}`);
    say(`  behind it ${line.holders.join(", ")}`);
    say(`  explorer  ${deployment.chain.explorerUrl}/tx/${line.transaction}`);
    try {
        const response = await fetch(deployment.chain.rpcUrl, {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify({jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [line.transaction]}),
            signal: AbortSignal.timeout(15_000),
        });
        const {result} = (await response.json()) as {result?: {status?: string; blockNumber?: string}}; // a JSON-RPC receipt, read field by field
        const mined = result?.status === "0x1" && result.blockNumber !== undefined;
        say(`  the chain ${mined ? `says: mined and successful, block ${BigInt(result.blockNumber ?? "0").toString()}` : "gave no successful receipt for it"}`);
        say(`            (asked of the node itself, not of the index)`);
    } catch (error) {
        say(`  the chain could not be asked directly: ${error instanceof Error ? error.message : String(error)}`);
    }
    wrapped(`\nBelow ${WALLETS_TO_MOVE} wallets saying the same thing, a line is shown to the next search and does not move its order. The amount deposited is never read.`);
}

async function stepMetrics(): Promise<void> {
    await step(6, "The figures, computed now", FIGURES);
    const run = spawnSync(process.execPath, ["--no-env-file", "run", join(ROOT, "scripts", "measure", "proof-of-work.ts"), "--no-file"], {cwd: ROOT, env: {PATH: process.env["PATH"] ?? "", HOME: process.env["HOME"] ?? home}, encoding: "utf8", timeout: 90_000});
    if (run.status !== 0) throw new Error(run.stderr.trim().split("\n").at(-1) ?? "the script failed");
    for (const line of run.stdout.trimEnd().split("\n")) {
        if (line.length > WIDTH && !line.includes("  ")) wrapped(line);
        else say(line);
    }
}

function cleanUp(): void {
    server?.stop();
    readline?.close();
    rmSync(home, {recursive: true, force: true});
}
function stopNow(): void {
    cleanUp();
    say("\nStopped. The throwaway folder is removed.");
    process.exit(130);
}
process.on("SIGINT", stopNow);

function preflight(): boolean {
    const major = /^v(\d+)/.exec(spawnSync("node", ["--version"], {encoding: "utf8"}).stdout ?? "")?.[1];
    if (major === undefined || Number(major) < 22) {
        say("The MCP server and the hook need Node 22 or later, and `node --version` says otherwise. Steps 1 to 4 cannot run.");
        return false;
    }
    if (existsSync(CLI)) return true;
    say("The CLI is not built. Building it: bun run --cwd apps/cli build");
    const built = spawnSync("bun", ["run", "--cwd", "apps/cli", "build"], {cwd: ROOT, stdio: "inherit"});
    if (built.status === 0 && existsSync(CLI)) return true;
    say("The build failed. From a clean checkout, run `bun install` first. Steps 1 to 4 cannot run.");
    return false;
}

async function guarded(name: string, run: () => Promise<void>): Promise<void> {
    try {
        await run();
    } catch (error) {
        const why = error instanceof Error ? (error.message.split("\n")[0] ?? "failed") : String(error);
        wrapped(`\n${name} could not run: ${why}. Going on with the next step.`);
    }
}

say(`ARP, in a terminal. Search, check, note a failure, read what is public.
Every program here runs for real. Each step says whether it is a local test or a
read of the chain. No key, no payment, no transaction.
Throwaway folder: ${home}`);

const ready = preflight();
if (ready) {
    await guarded("Step 1", stepSearch);
    await guarded("Step 2", stepFailure);
    await guarded("Step 3", stepNextSearch);
    await guarded("Step 4", stepShare);
}
await guarded("Step 5", stepChain);
await guarded("Step 6", stepMetrics);
if (PAUSE) await pause("\n[Enter] to remove the throwaway folder and finish.");
cleanUp();
say(`\nThe throwaway folder is ${existsSync(home) ? "STILL THERE" : "removed"}. Nothing was signed, paid or written on a chain.`);
process.exit(0);
