/** Does the best skill rise? A simulation with invented skills whose true quality is known. Task 64 §4.
 *
 *      bun run scripts/measure/pulse-sim.ts
 *
 *  No agent, no network, no chain. It tests the ranking logic only, under the assumptions below, and says nothing about
 *  real skills or real agents. Nothing it produces may reach a real graph or a real result.
 *
 *  Assumptions, all invented: 30 skills, true success rates uniform between 0.1 and 0.9. The search's order is popularity:
 *  quality plus noise. Each agent takes the first result and it works with the skill's true rate. A share of agents declare,
 *  each from its own wallet, and always truthfully except where a scenario says otherwise.
 */
type Policy = "search" | "score" | "thompson";

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

function gaussian(random: () => number): number {
    return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}

/** Marsaglia and Tsang. */
function gamma(shape: number, random: () => number): number {
    if (shape < 1) return gamma(shape + 1, random) * Math.pow(random(), 1 / shape);
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
        const x = gaussian(random);
        const v = (1 + c * x) ** 3;
        if (v > 0 && Math.log(1 - random()) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
    }
}

type Scenario = {name: string; declareShare: number; noise: number; fakeOnWorst: number};

function run(policy: Policy, scenario: Scenario, agents: number, seed: number) {
    const random = rng(seed);
    const count = 30;
    const quality = Array.from({length: count}, () => 0.1 + 0.8 * random());
    const popularity = quality.map((value) => value + scenario.noise * gaussian(random));
    const order = quality.map((_value, index) => index).sort((a, b) => (popularity[b] ?? 0) - (popularity[a] ?? 0));
    const prior = new Array<number>(count).fill(0);
    order.forEach((skill, rank) => {
        prior[skill] = 0.8 - (0.6 * rank) / (count - 1);
    });
    const worked = new Array<number>(count).fill(0);
    const failed = new Array<number>(count).fill(0);
    const best = quality.indexOf(Math.max(...quality));
    const worst = quality.indexOf(Math.min(...quality));
    worked[worst] = scenario.fakeOnWorst;

    let wins = 0;
    let bestPicks = 0;
    const tailFrom = agents - Math.floor(agents / 5);
    let tail = 0;
    for (let agent = 0; agent < agents; agent += 1) {
        let pick = order[0] ?? 0;
        if (policy !== "search") {
            let top = -1;
            for (let skill = 0; skill < count; skill += 1) {
                const a = (prior[skill] ?? 0) + (worked[skill] ?? 0);
                const b = 1 - (prior[skill] ?? 0) + (failed[skill] ?? 0);
                const value =
                    policy === "score"
                        ? a / (a + b)
                        : ((sample) => sample / (sample + gamma(b, random)))(gamma(a, random));
                if (value > top) {
                    top = value;
                    pick = skill;
                }
            }
        }
        const success = random() < (quality[pick] ?? 0);
        if (agent >= tailFrom) {
            tail += 1;
            if (success) wins += 1;
            if (pick === best) bestPicks += 1;
        }
        if (random() < scenario.declareShare) {
            if (success) worked[pick] = (worked[pick] ?? 0) + 1;
            else failed[pick] = (failed[pick] ?? 0) + 1;
        }
    }
    return {success: wins / tail, best: bestPicks / tail, bestQuality: Math.max(...quality)};
}

const SCENARIOS: Scenario[] = [
    {name: "every agent declares", declareShare: 1, noise: 0.3, fakeOnWorst: 0},
    {name: "1 agent in 5 declares", declareShare: 0.2, noise: 0.3, fakeOnWorst: 0},
    {name: "1 in 20 declares", declareShare: 0.05, noise: 0.3, fakeOnWorst: 0},
    {name: "popularity says nothing", declareShare: 0.2, noise: 5, fakeOnWorst: 0},
    {name: "5 false wallets on the worst", declareShare: 0.2, noise: 0.3, fakeOnWorst: 5},
    {name: "50 false wallets on the worst", declareShare: 0.2, noise: 0.3, fakeOnWorst: 50},
];

const RUNS = 400;
console.log(`${RUNS} worlds per cell. Last 20% of agents: success rate, then share who took the true best skill.`);
for (const agents of [50, 200, 1000]) {
    console.log(`\n${agents} agents`);
    for (const scenario of SCENARIOS) {
        const cells = (["search", "score", "thompson"] as Policy[]).map((policy) => {
            let success = 0;
            let best = 0;
            let ceiling = 0;
            for (let seed = 1; seed <= RUNS; seed += 1) {
                const result = run(policy, scenario, agents, seed * 7919);
                success += result.success;
                best += result.best;
                ceiling += result.bestQuality;
            }
            return {policy, success: success / RUNS, best: best / RUNS, ceiling: ceiling / RUNS};
        });
        const text = cells.map((cell) => `${cell.policy} ${(100 * cell.success).toFixed(0)}% / ${(100 * cell.best).toFixed(0)}%`).join("   ");
        console.log(`  ${scenario.name.padEnd(30)} ${text}   ceiling ${(100 * (cells[0]?.ceiling ?? 0)).toFixed(0)}%`);
    }
}
