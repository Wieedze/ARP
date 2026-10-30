import {parseToolLabel} from "./tool-label";

/** The label style the skill and repository pages share: mono, 11px, uppercase, steel. */
export const LABEL =
    "font-mono text-[11px] uppercase tracking-[0.08em] text-[color:var(--color-steel)]";

/** `github.com/owner/repo` → the GitHub API call `maintained` was read from, else `null`. */
export function githubApiUrlOf(label: string | null): string | null {
    if (label === null) return null;
    const parsed = parseToolLabel(label);
    if (parsed.kind !== "repo" || parsed.host !== "github.com") return null;
    return `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
}

/** `2026-10-29` → `29 Oct 2026`. Parsed by hand: `new Date("2026-10-29")` is UTC midnight. */
export function formatDay(isoDay: string): string {
    const [year, month, day] = isoDay.split("-").map(Number);
    if (year === undefined || month === undefined || day === undefined) return isoDay;
    const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ];
    return `${day} ${months[month - 1] ?? ""} ${year}`;
}
