/** The figures task 63 quotes, from `data/measurements/pulse-eval-2026-11-05.jsonl`. Reads a file, nothing else.
 *
 *      bun run scripts/measure/pulse-eval-summary.ts
 */
import {readFileSync} from "node:fs";

type Row = {
    round: string;
    need: string;
    arm: string;
    chosen: {source?: string; skill?: string; none?: boolean} | null;
    judged: {clean?: boolean; keys?: string[]} | null;
    sawUsage?: boolean;
    turns: number;
    costUsd: number;
};

const rows = readFileSync(process.argv[2] ?? "data/measurements/pulse-eval-2026-11-05.jsonl", "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Row); // this script's sibling wrote them

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

// `before` arm B lost runs to a failed read, and `after` never reached a declaration. `final` is the
// same code as the tool on this branch.
const cells: [string, (row: Row) => boolean][] = [
    ["A free words (before)", (row) => row.round === "before" && row.arm === "A"],
    ["B free words (final)", (row) => row.round === "final" && row.need !== "silences-fixed"],
    ["A fixed words (fixed)", (row) => row.round === "fixed" && row.arm === "A"],
    ["B fixed words (final)", (row) => row.round === "final" && row.need === "silences-fixed"],
];
for (const [label, test] of cells) {
    const cell = rows.filter(test);
    const choices = new Map<string, number>();
    for (const row of cell) {
        const name = row.chosen?.none === true ? "none" : `${row.chosen?.source}@${row.chosen?.skill}`;
        choices.set(name, (choices.get(name) ?? 0) + 1);
    }
    console.log(
        `${label}: n=${cell.length}, named key ${cell.filter((row) => (row.judged?.keys?.length ?? 0) > 0).length}, ` +
            `no choice ${cell.filter((row) => row.chosen?.none === true).length}, saw a declaration ${cell.filter((row) => row.sawUsage === true).length}, ` +
            `median turns ${median(cell.map((row) => row.turns))}, median $${median(cell.map((row) => row.costUsd)).toFixed(3)}`,
    );
    console.log(`  ${[...choices].map(([name, count]) => `${name} x${count}`).join(", ")}`);
}
console.log(`all ${rows.length} runs: $${rows.reduce((sum, row) => sum + row.costUsd, 0).toFixed(2)}`);
