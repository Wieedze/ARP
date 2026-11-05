import {isUsageReason, type UsageReason} from "./declare/usage-context.js";

/** One line of `<arpHome>/failures.jsonl`, which the runtime hook writes (`docs/tasks/68`). */
export type LocalFailure = {at: string; skill: string; source: string | null; domain?: string; reason: UsageReason};

/** What this machine already hit with a skill: sessions per reason. `byNameOnly`: a line named no source, so it may be a namesake. */
export type YourFailures = {reasons: Partial<Record<UsageReason, number>>; last: string; byNameOnly: boolean};

/** A malformed line is skipped: the last line of a file still being written is the normal case. */
export function parseLocalFailures(text: string): LocalFailure[] {
    const rows: LocalFailure[] = [];
    for (const line of text.split("\n")) {
        if (line.trim() === "") continue;
        try {
            const row = JSON.parse(line) as Record<string, unknown>; // read field by field below
            const {at, skill, source, domain, reason} = row;
            if (typeof at !== "string" || typeof skill !== "string" || typeof reason !== "string") continue;
            if (!isUsageReason(reason)) continue;
            rows.push({at, skill, source: typeof source === "string" ? source : null, ...(typeof domain === "string" ? {domain} : {}), reason});
        } catch {
            continue;
        }
    }
    return rows;
}

/** The failures of this skill, or `null` when there are none. Another source's skill of that name does not count. */
export function yourFailures(rows: readonly LocalFailure[], skill: string, source: string): YourFailures | null {
    const own = rows.filter(
        (row) => (row.skill === skill || row.skill.endsWith(`:${skill}`)) && (row.source === null || row.source === source),
    );
    if (own.length === 0) return null;
    const reasons: Partial<Record<UsageReason, number>> = {};
    for (const row of own) reasons[row.reason] = (reasons[row.reason] ?? 0) + 1;
    return {
        reasons,
        last: own.map((row) => row.at).sort().at(-1) ?? "",
        byNameOnly: own.some((row) => row.source === null),
    };
}
