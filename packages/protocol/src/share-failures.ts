import type {UsageReason} from "./declare/usage-context.js";
import type {LocalFailure} from "./local-failures.js";

/**
 * What may leave a machine from its local failure memory (`docs/tasks/70` item 2).
 *
 * **Off unless the person turned it on**, and only ever three fields: a public skill, `failed`, and a
 * closed reason. Never a session, a date or a path. `worked` is never here, because the hook cannot
 * tell it (ADR `0140`).
 *
 * **A skill with no known public source stays local.** A hook line usually has no source, and a skill
 * can be private: its name alone must not reach a public graph, and a name resolved by guessing
 * would write a line about somebody else's repository.
 */
export type SharedLine = {toolUrl: string; outcome: "failed"; reason: UsageReason};

/** What is known about where an installed skill came from. */
export type InstalledSkill = {skill: string; source: string};

export type ShareDecision = {
    lines: SharedLine[];
    /** Why a failure stays on this machine. Skills only, for the person's own eyes. */
    keptLocal: {skill: string; why: "sharing_off" | "no_public_source" | "several_sources"}[];
};

const GITHUB_REPO = /^[\w.-]+\/[\w.-]+$/;

/** On only for exactly `{"failures": true}`. Anything else, a broken file included, is off. */
export function isSharingOn(settings: string | null): boolean {
    if (settings === null) return false;
    try {
        const parsed: unknown = JSON.parse(settings);
        return typeof parsed === "object" && parsed !== null && (parsed as {failures?: unknown}).failures === true; // checked to be an object on this line
    } catch {
        return false;
    }
}

/** The skills CLI's lock file, `~/.agents/.skill-lock.json`. GitHub entries only. */
export function installedFromSkillLock(lock: string | null): InstalledSkill[] {
    if (lock === null) return [];
    try {
        const parsed = JSON.parse(lock) as {skills?: Record<string, {source?: unknown; sourceType?: unknown}>}; // read field by field
        return Object.entries(parsed.skills ?? {}).flatMap(([skill, entry]) =>
            entry?.sourceType === "github" && typeof entry.source === "string" ? [{skill, source: entry.source}] : [],
        );
    } catch {
        return [];
    }
}

/** A key for one sentence: the same skill and reason is one line, however often it failed. */
export function sharedLineKey(line: SharedLine): string {
    return `${line.toolUrl}\u0000${line.reason}`;
}

export function decideShare(params: {
    on: boolean;
    failures: readonly LocalFailure[];
    installed: readonly InstalledSkill[];
    alreadyShared: ReadonlySet<string>;
}): ShareDecision {
    const lines = new Map<string, SharedLine>();
    const keptLocal = new Map<string, ShareDecision["keptLocal"][number]>();
    for (const failure of params.failures) {
        const name = failure.skill.split(":").pop() ?? failure.skill;
        if (!params.on) {
            keptLocal.set(name, {skill: name, why: "sharing_off"});
            continue;
        }
        const sources = new Set(
            failure.source !== null
                ? [failure.source]
                : params.installed.filter((entry) => entry.skill === name).map((entry) => entry.source),
        );
        if (sources.size > 1) {
            keptLocal.set(name, {skill: name, why: "several_sources"});
            continue;
        }
        const [source] = [...sources];
        if (source === undefined || !GITHUB_REPO.test(source)) {
            keptLocal.set(name, {skill: name, why: "no_public_source"});
            continue;
        }
        const line: SharedLine = {
            toolUrl: `https://github.com/${source}?skill=${encodeURIComponent(name)}`,
            outcome: "failed",
            reason: failure.reason,
        };
        const key = sharedLineKey(line);
        if (!params.alreadyShared.has(key)) lines.set(key, line);
    }
    return {lines: [...lines.values()], keptLocal: [...keptLocal.values()]};
}
