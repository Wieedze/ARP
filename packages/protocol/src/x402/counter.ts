/**
 * Paid calls, counted per route and per UTC day (task 41c).
 *
 * ADR `0094` §4: "the number of paid calls is the measure of whether ARP is useful to agents". So
 * the count is of **settled** calls only — a 402 answered, a payment that failed to settle, or a
 * call to a route with no price is not a paid call and is not counted.
 *
 * **On disk, appended, read once at start**, the device `apps/node`'s `PaymentLedger` and
 * `apps/sponsor`'s ledger already use: a count held in memory is reset by every restart, and a figure
 * that resets is not a figure. One row per settled call, so the count can be re-derived from the
 * file by anybody holding it, and every row carries the settlement transaction that backs it.
 */
import {appendFileSync, existsSync, mkdirSync, readFileSync} from "node:fs";
import {dirname} from "node:path";

/** One settled call. `transaction` is on `network`, which is not the chain ARP's positions are on. */
export type PaidCall = {
    route: string;
    payer: string;
    transaction: string;
    network: string;
    /** Atomic units of the asset paid in — USDC has 6 decimals. */
    amount: string;
};

export type PaidCallRow = PaidCall & {at: string; day: string};

/** `{ "2026-11-02": { "GET /content/:atomId": 3 } }`, days and routes in sorted order. */
export type PaidCallCounts = Record<string, Record<string, number>>;

export class PaidCallCounter {
    private readonly rows: PaidCallRow[] = [];

    constructor(private readonly path: string | null) {
        if (path === null || !existsSync(path)) return;
        for (const line of readFileSync(path, "utf8").split("\n")) {
            if (line.trim().length === 0) continue;
            try {
                const row = JSON.parse(line) as Partial<PaidCallRow>;
                if (typeof row.day === "string" && typeof row.route === "string") {
                    this.rows.push(row as PaidCallRow); // The two fields counted are checked above.
                }
            } catch {
                // A half-written last line from a crash: its call was settled, and the settlement
                // transaction is on chain, but the row that would count it is lost. Skipped, not guessed.
                continue;
            }
        }
    }

    /** Records one settled call at `at` and returns the row written. */
    record(call: PaidCall, at: Date): PaidCallRow {
        const row: PaidCallRow = {at: at.toISOString(), day: at.toISOString().slice(0, 10), ...call};
        if (this.path !== null) {
            mkdirSync(dirname(this.path), {recursive: true});
            appendFileSync(this.path, `${JSON.stringify(row)}\n`);
        }
        this.rows.push(row);
        return row;
    }

    /** Paid calls per UTC day, per route. A day with none is absent rather than zero. */
    counts(): PaidCallCounts {
        const days = new Map<string, Map<string, number>>();
        for (const row of this.rows) {
            const routes = days.get(row.day) ?? new Map<string, number>();
            routes.set(row.route, (routes.get(row.route) ?? 0) + 1);
            days.set(row.day, routes);
        }
        const out: PaidCallCounts = {};
        for (const day of [...days.keys()].sort()) {
            const routes = days.get(day) ?? new Map<string, number>();
            out[day] = Object.fromEntries([...routes.entries()].sort(([a], [b]) => a.localeCompare(b)));
        }
        return out;
    }

    /** How many settled calls are recorded, all days and routes together. */
    total(): number {
        return this.rows.length;
    }
}
