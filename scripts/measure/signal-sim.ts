/** Is each detail of a line worth reading? A simulation with invented skills. `docs/tasks/66` §3 holds the reading rules.
 *
 *      bun run scripts/measure/signal-sim.ts [--worlds 300]
 *
 *  No agent, no network, no chain. It calls the `lineWeight` and `scoreFrom` the tool calls, and says nothing about real
 *  skills or real agents. Nothing it produces may reach a real graph or a real result.
 */
import {mkdirSync, writeFileSync} from "node:fs";

import {lineWeight, scoreFrom, type Capability, type SignalContext, type WeighedLine} from "../../packages/protocol/src/pulse-score.ts";
import {USAGE_REASONS, type UsageOutcome, type UsageReason} from "../../packages/protocol/src/declare/usage-context.ts";

const DOMAINS = ["video", "audio", "video-editing", "media"] as const;
type Domain = (typeof DOMAINS)[number];
const NEED_DOMAINS: Domain[] = ["video", "audio", "video-editing"];
const SUB: Record<Domain, Domain[]> = {media: ["video", "audio", "video-editing"], video: ["video-editing"], audio: [], "video-editing": []};
const ABOVE: Record<Domain, Domain[]> = {media: [], video: ["media"], audio: ["media"], "video-editing": ["video", "media"]};
const CAPS: Capability[] = ["key", "program", "file"];
const REASON_OF: Record<Capability, UsageReason> = {key: "missing-key", program: "missing-program", file: "missing-file"};

function rng(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const gaussian = (random: () => number) => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
const clamp = (value: number) => Math.min(0.95, Math.max(0.05, value));

type Scenario = {
    name: string;
    declareShare: number;
    provenShare: number;
    needShare: number;
    flatDomains: boolean;
    liars: number;
    liarsProven: boolean;
    wrongReasons: number;
    filter: number;
    skills?: number;
    goodNeed?: boolean;
};
const BASE: Scenario = {name: "base", declareShare: 0.2, provenShare: 0.3, needShare: 0.4, flatDomains: false, liars: 0, liarsProven: false, wrongReasons: 0, filter: 0.7};
const SCENARIOS: Scenario[] = [
    BASE,
    {...BASE, name: "all", declareShare: 1},
    {...BASE, name: "sparse", declareShare: 0.05},
    {...BASE, name: "control-no-needs", needShare: 0},
    {...BASE, name: "control-flat-domains", flatDomains: true},
    {...BASE, name: "liars", liars: 20},
    {...BASE, name: "liars-proven", liars: 20, liarsProven: true},
    {...BASE, name: "wrong-reasons", wrongReasons: 0.5},
    {...BASE, name: "strong-filter", filter: 0.95},
];

type Arm = {name: string; legacy?: true; search?: true; domain: boolean; reason: boolean; proof: boolean; near: number; proven: number};
/** The weights this simulation ran on. `proven` is 2 here and 1 in the tool, by the user's decision after it ran. */
const TESTED = {near: 0.5, proven: 2};
const off = {domain: false, reason: false, proof: false, near: TESTED.near, proven: TESTED.proven};
const ARMS: Arm[] = [
    {...off, name: "search", search: true},
    {...off, name: "score-1", legacy: true},
    {...off, name: "domain", domain: true},
    {...off, name: "reason", reason: true},
    {...off, name: "proof", proof: true},
    {...off, name: "score-2", domain: true, reason: true, proof: true},
];

const contextOf = (domain: Domain, canProvide: ReadonlySet<Capability>): SignalContext => ({
    domain,
    near: new Set([...SUB[domain], ...ABOVE[domain]]),
    canProvide,
});

/** What an arm makes of one line. `score-1`'s count is written out, since that code path no longer exists. */
function weigh(arm: Arm, line: WeighedLine & {domain: Domain}, domain: Domain, canProvide: ReadonlySet<Capability>): number {
    const inScope = line.domain === domain || SUB[domain].includes(line.domain);
    if (arm.legacy === true) return inScope ? 1 : 0;
    const context = contextOf(domain, arm.reason ? canProvide : new Set());
    if (!arm.domain) {
        // Without proximity, the arm sees what `score-1` sees, in full.
        if (!inScope) return 0;
        return lineWeight({...line, domain, reasons: arm.reason ? line.reasons : [], proven: arm.proof && line.proven === true}, context, {near: 1, proven: arm.proven});
    }
    return lineWeight({...line, reasons: arm.reason ? line.reasons : [], proven: arm.proof && line.proven === true}, context, {near: arm.near, proven: arm.proven});
}

type Outcome = {success: number; ceiling: number; canSupply: number};

function run(arm: Arm, scenario: Scenario, agents: number, seed: number): number {
    return runFull(arm, scenario, agents, seed).success;
}

function runFull(arm: Arm, scenario: Scenario, agents: number, seed: number): Outcome {
    const world = rng(seed);
    const count = scenario.skills ?? 30;
    const quality: Record<Domain, number>[] = [];
    const need: (Capability | null)[] = [];
    const popularity: number[] = [];
    for (let skill = 0; skill < count; skill += 1) {
        const video = 0.1 + 0.8 * world();
        const audio = 0.1 + 0.8 * world();
        const editing = clamp(video + 0.1 * gaussian(world));
        const q: Record<Domain, number> = scenario.flatDomains
            ? {video, audio: video, "video-editing": video, media: video}
            : {video, audio, "video-editing": editing, media: (video + audio) / 2};
        quality.push(q);
        const needed = scenario.goodNeed === true ? (q.video + q.audio) / 2 > 0.5 && world() < 0.8 : world() < scenario.needShare;
        need.push(needed ? (CAPS[Math.floor(world() * 3)] as Capability) : null);
        popularity.push((q.video + q.audio) / 2 + 0.3 * gaussian(world));
    }
    const order = popularity.map((_value, index) => index).sort((a, b) => (popularity[b] ?? 0) - (popularity[a] ?? 0));
    const prior = new Array<number>(count).fill(0);
    order.forEach((skill, rank) => {
        prior[skill] = 0.8 - (0.6 * rank) / Math.max(1, count - 1);
    });

    // One running total per context an agent can be in, so a line is weighed once and for all.
    const key = (domain: Domain, mask: number) => NEED_DOMAINS.indexOf(domain) * 8 + mask;
    const worked = Array.from({length: 24}, () => new Array<number>(count).fill(0));
    const failed = Array.from({length: 24}, () => new Array<number>(count).fill(0));
    const capsOf = (mask: number) => new Set(CAPS.filter((_cap, at) => mask & (1 << at)));
    const write = (skill: number, line: WeighedLine & {domain: Domain; outcome: UsageOutcome}) => {
        for (const domain of NEED_DOMAINS) {
            for (let mask = 0; mask < 8; mask += 1) {
                const weight = weigh(arm, line, domain, capsOf(mask));
                const totals = (line.outcome === "worked" ? worked : failed)[key(domain, mask)] as number[];
                totals[skill] = (totals[skill] ?? 0) + weight;
            }
        }
    };

    if (scenario.liars > 0) {
        for (const domain of NEED_DOMAINS) {
            const worst = quality
                .map((q, skill) => ({skill, value: q[domain]}))
                .sort((a, b) => a.value - b.value)
                .slice(0, 3);
            for (const {skill} of worst) {
                for (let wallet = 0; wallet < scenario.liars; wallet += 1) {
                    write(skill, {domain, outcome: "worked", reasons: [], proven: scenario.liarsProven});
                }
            }
        }
    }

    const live = rng(seed ^ 0x9e3779b9);
    let wins = 0;
    let tail = 0;
    let ceiling = 0;
    let supplied = 0;
    let suppliedWins = 0;
    const tailFrom = agents - Math.floor(agents / 5);
    for (let agent = 0; agent < agents; agent += 1) {
        const domain = NEED_DOMAINS[Math.floor(live() * NEED_DOMAINS.length)] as Domain;
        let mask = 0;
        for (let at = 0; at < 3; at += 1) if (live() < 0.5) mask |= 1 << at;
        const has = capsOf(mask);
        const row = key(domain, mask);
        let pick = -1;
        let top = -1;
        for (const skill of order) {
            const lacks = need[skill] !== null && !has.has(need[skill] as Capability);
            // The local filter reads what the skill's file states, and it costs nothing to run.
            if (lacks && live() < scenario.filter) continue;
            const value = arm.search === true ? scoreFrom(prior[skill] ?? 0, 0, 0) : scoreFrom(prior[skill] ?? 0, worked[row]?.[skill] ?? 0, failed[row]?.[skill] ?? 0);
            if (value > top) {
                top = value;
                pick = skill;
            }
        }
        if (pick < 0) continue;
        const required = need[pick] ?? null;
        const lacking = required !== null && !has.has(required);
        const rate = quality[pick]?.[domain] ?? 0;
        const success = !lacking && live() < rate;
        if (agent >= tailFrom) {
            tail += 1;
            if (success) wins += 1;
            let best = 0;
            let holdsANeed = false;
            for (let skill = 0; skill < count; skill += 1) {
                const required = need[skill] ?? null;
                if (required !== null && has.has(required)) holdsANeed = true;
                if (required === null || has.has(required)) best = Math.max(best, quality[skill]?.[domain] ?? 0);
            }
            ceiling += best;
            if (holdsANeed) {
                supplied += 1;
                if (success) suppliedWins += 1;
            }
        }
        if (live() < scenario.declareShare) {
            const reasons: UsageReason[] = [];
            if (!success) {
                if (lacking) reasons.push(REASON_OF[required]);
                else if (rate < 0.3) reasons.push("not-the-right-tool");
                if (reasons.length > 0 && live() < scenario.wrongReasons) reasons[0] = USAGE_REASONS[Math.floor(live() * 4)] as UsageReason;
            }
            write(pick, {domain, outcome: success ? "worked" : "failed", reasons, proven: live() < scenario.provenShare});
        }
    }
    return {success: tail === 0 ? 0 : wins / tail, ceiling: tail === 0 ? 0 : ceiling / tail, canSupply: supplied === 0 ? 0 : suppliedWins / supplied};
}

const at = process.argv.indexOf("--worlds");
const WORLDS = at === -1 ? 300 : Number(process.argv[at + 1]);
const AGENTS = 1000;
/** One file per run, never regenerated (ADR `0064`). */
const STAMP = new Date().toISOString().slice(0, 16).replace(":", "");

function paired(a: number[], b: number[]) {
    const diffs = a.map((value, index) => value - (b[index] ?? 0));
    const mean = diffs.reduce((sum, value) => sum + value, 0) / diffs.length;
    const variance = diffs.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (diffs.length - 1);
    const half = 1.96 * Math.sqrt(variance / diffs.length);
    return {mean: 100 * mean, low: 100 * (mean - half), high: 100 * (mean + half)};
}
const mean = (values: number[]) => (100 * values.reduce((sum, value) => sum + value, 0)) / values.length;
const worldsOf = (arm: Arm, scenario: Scenario) => Array.from({length: WORLDS}, (_v, world) => run(arm, scenario, AGENTS, (world + 1) * 7919));
const fmt = (value: number) => value.toFixed(1).padStart(5);

if (process.argv.includes("--round") && process.argv[process.argv.indexOf("--round") + 1] === "2") {
    const tool: Arm = {...off, name: "tool", domain: true, reason: true};
    const pick = (name: string) => ARMS.find((arm) => arm.name === name) as Arm;
    const arms = [pick("score-1"), pick("domain"), pick("reason"), tool];
    const rows: unknown[] = [];
    console.log(`${WORLDS} worlds per cell. Exploratory (docs/tasks/66 §5). Success among the last 20%, ceiling, then against score-1.`);
    for (const goodNeed of [false, true]) {
        for (const skills of [5, 10, 30]) {
            for (const agents of [50, 200, 1000]) {
                const scenario: Scenario = {...BASE, name: `${goodNeed ? "good-need" : "base"} ${skills} skills ${agents} agents`, skills, goodNeed};
                const results = arms.map((arm) => Array.from({length: WORLDS}, (_v, world) => runFull(arm, scenario, agents, (world + 1) * 7919)));
                const success = (index: number) => (results[index] ?? []).map((row) => row.success);
                const supply = (index: number) => (results[index] ?? []).map((row) => row.canSupply);
                const ceiling = mean((results[0] ?? []).map((row) => row.ceiling));
                const cells = arms.slice(1).map((arm, at) => ({arm: arm.name, ...paired(success(at + 1), success(0)), canSupply: paired(supply(at + 1), supply(0))}));
                rows.push({scenario: scenario.name, ceiling, score1: mean(success(0)), cells});
                console.log(
                    `${scenario.name.padEnd(30)} ceiling ${fmt(ceiling)}  score-1 ${fmt(mean(success(0)))}  ` +
                        cells.map((cell) => `${cell.arm} ${cell.mean >= 0 ? "+" : ""}${cell.mean.toFixed(1)} [${cell.low.toFixed(1)}, ${cell.high.toFixed(1)}]`).join("  "),
                );
            }
        }
    }
    mkdirSync("data/measurements", {recursive: true});
    writeFileSync(`data/measurements/signal-sim2-${STAMP}.json`, `${JSON.stringify({worlds: WORLDS, rows}, null, 1)}\n`);
    process.exit(0);
}

const output: Record<string, unknown> = {worlds: WORLDS, agents: AGENTS, weights: TESTED, scenarios: {}, sensitivity: {}};
console.log(`${WORLDS} worlds, ${AGENTS} agents. Success among the last 20%, then each arm minus score-1, world by world, with a 95% interval.\n`);
for (const scenario of SCENARIOS) {
    const results = new Map(ARMS.map((arm) => [arm.name, worldsOf(arm, scenario)]));
    const reference = results.get("score-1") ?? [];
    const row: Record<string, unknown> = {};
    console.log(scenario.name);
    for (const arm of ARMS) {
        const values = results.get(arm.name) ?? [];
        const diff = paired(values, reference);
        row[arm.name] = {success: mean(values), ...(arm.name === "score-1" ? {} : {againstScore1: diff})};
        console.log(`  ${arm.name.padEnd(8)} ${fmt(mean(values))}%${arm.name === "score-1" ? "" : `   ${diff.mean >= 0 ? "+" : ""}${diff.mean.toFixed(1)} [${diff.low.toFixed(1)}, ${diff.high.toFixed(1)}]`}`);
    }
    (output["scenarios"] as Record<string, unknown>)[scenario.name] = row;
}

console.log("\nWeights, checked and not tuned: score-2 minus score-1");
const SENS = SCENARIOS.filter((scenario) => ["base", "liars", "liars-proven"].includes(scenario.name));
const full = ARMS.find((arm) => arm.name === "score-2") as Arm;
const legacy = ARMS.find((arm) => arm.name === "score-1") as Arm;
for (const scenario of SENS) {
    const reference = worldsOf(legacy, scenario);
    const row: Record<string, unknown> = {};
    for (const [near, proven] of [[0.5, 1.5], [0.5, 2], [0.5, 3], [0.25, 2], [0.75, 2]] as const) {
        const diff = paired(worldsOf({...full, near, proven}, scenario), reference);
        row[`near ${near}, proven ${proven}`] = diff;
        console.log(`  ${scenario.name.padEnd(14)} near ${near} proven ${proven}   ${diff.mean >= 0 ? "+" : ""}${diff.mean.toFixed(1)} [${diff.low.toFixed(1)}, ${diff.high.toFixed(1)}]`);
    }
    (output["sensitivity"] as Record<string, unknown>)[scenario.name] = row;
}

mkdirSync("data/measurements", {recursive: true});
writeFileSync(`data/measurements/signal-sim-${STAMP}.json`, `${JSON.stringify(output, null, 1)}\n`);
