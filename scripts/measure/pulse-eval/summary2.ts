/** The figures of task 63 §10, from the second comparison's two output files. Reads files, nothing else.
 *
 *      bun run scripts/measure/pulse-eval/summary2.ts
 *
 *  A run is a good choice only if both blind readings of the chosen skill say `usable` (§9). Wilson 95%.
 */
import {readFileSync} from "node:fs";

type Row = {
    need: string;
    arm: string;
    chosen: {source?: string; skill?: string; none?: boolean} | null;
    sawUsage?: boolean;
    toolErrors?: number;
    turns: number;
    costUsd: number;
};
type Judged = {need: string; source: string; skill: string; verdicts: {verdict?: string}[]};

const path = process.argv[2] ?? "data/measurements/pulse-eval2-2026-11-05.jsonl";
const rows = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Row); // pulse-eval.ts wrote them
const judged = (JSON.parse(readFileSync(`${path}.judged.json`, "utf8")) as {judged: Judged[]}).judged; // judge.ts wrote it

const verdicts = new Map(judged.map((row) => [`${row.need}|${row.source}|${row.skill}`, row.verdicts.map((entry) => entry.verdict ?? "?")]));

function wilson(hits: number, n: number): string {
    const z = 1.96;
    const p = hits / n;
    const centre = (p + (z * z) / (2 * n)) / (1 + (z * z) / n);
    const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
    return `${Math.round(100 * Math.max(0, centre - half))}-${Math.round(100 * Math.min(1, centre + half))}%`;
}
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

console.log(`runs ${rows.length}, $${rows.reduce((sum, row) => sum + row.costUsd, 0).toFixed(2)}`);
const split = judged.filter((row) => new Set(row.verdicts.map((entry) => entry.verdict)).size > 1);
console.log(`skills read ${judged.length}, readings that disagree ${split.length}`);
for (const need of ["silences-fixed", "silences", "voiceover", "markdown"]) {
    for (const arm of ["A", "B", "C", "D", "S", "F"]) {
        const cell = rows.filter((row) => row.need === need && row.arm === arm);
        if (cell.length === 0) continue;
        const choices = new Map<string, number>();
        let good = 0;
        let none = 0;
        for (const row of cell) {
            if (row.chosen?.none === true) {
                none += 1;
                choices.set("none", (choices.get("none") ?? 0) + 1);
                continue;
            }
            const read = verdicts.get(`${need}|${row.chosen?.source}|${row.chosen?.skill}`) ?? [];
            if (read.length === 2 && read.every((verdict) => verdict === "usable")) good += 1;
            const name = `${row.chosen?.source}@${row.chosen?.skill} [${read.join("/")}]`;
            choices.set(name, (choices.get(name) ?? 0) + 1);
        }
        console.log(
            `${need} ${arm}: good ${good}/${cell.length} (${wilson(good, cell.length)}), none ${none}, ` +
                `saw a declaration ${cell.filter((row) => row.sawUsage === true).length}, tool errors ${cell.reduce((sum, row) => sum + (row.toolErrors ?? 0), 0)}, ` +
                `median turns ${median(cell.map((row) => row.turns))}, median $${median(cell.map((row) => row.costUsd)).toFixed(3)}`,
        );
        console.log(`  ${[...choices].map(([name, count]) => `${count} x ${name}`).join("; ")}`);
    }
}
