/**
 * The three ways in from `/` (task 53). The user's decision, 2026-11-02: three profiles at launch,
 * and the agent operator and the team or registry come when they have something to offer.
 *
 * A tile carries a title and what to have at hand, nothing else: `rules/ui.md` forbids an
 * explanatory sentence inside a card.
 */
export type StartProfile = "claude" | "agent" | "tool";

export type StartPath = {
    profile: StartProfile;
    title: string;
    atHand: string;
    primary: boolean;
};

export const START_PATHS: readonly StartPath[] = [
    {profile: "claude", title: "I use Claude", atHand: "Claude Desktop or Code", primary: true},
    {profile: "agent", title: "I'm building an agent", atHand: "one command", primary: false},
    {profile: "tool", title: "I published a tool or a skill", atHand: "its URL", primary: false},
];

export function startPathTo(profile: StartProfile): string {
    return `/start/${profile}`;
}

export function isStartProfile(value: unknown): value is StartProfile {
    return START_PATHS.some((path) => path.profile === value);
}

const STORAGE_KEY = "arp.start-profile";

/**
 * Keep the visitor's choice so the nav can offer their path again. A convenience only: storage can
 * be blocked or cleared, and every page works without it, so a refusal returns `false` rather than
 * throwing.
 */
export function rememberProfile(profile: StartProfile, storage?: Storage): boolean {
    try {
        (storage ?? globalThis.localStorage).setItem(STORAGE_KEY, profile);
        return true;
    } catch {
        return false;
    }
}

export function recallProfile(storage?: Storage): StartProfile | null {
    try {
        const value = (storage ?? globalThis.localStorage).getItem(STORAGE_KEY);
        return isStartProfile(value) ? value : null;
    } catch {
        return null;
    }
}
