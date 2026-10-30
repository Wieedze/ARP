import {parseToolLabel} from "../lib/tool-label";

/**
 * The other repositories that publish **the same pack** as this one: every skill name and every
 * description equal, the same count on both sides.
 *
 * Measured 2026-10-29: six repositories named `superpowers` carry 26 identical skills each, and two
 * of the copies out-install the original. An install count cannot tell a copy from its author's;
 * putting the pack side by side is how a reader can.
 *
 * **Same name is not a relation.** One skill called `remotion-render` in another repository is
 * another skill, so a partial overlap earns nothing here. Only the whole set, matched on both name
 * and description, does. And nothing here says which repository came first: the data cannot.
 *
 * Pure. `descriptionOf` is the bundled skills.sh copy, so a skill with no description cannot match
 * anything, which is the cautious direction.
 */
export function samePackAs(
    repo: string,
    skillLabels: readonly string[],
    descriptionOf: (label: string) => string | null,
): string[] {
    const packs = new Map<string, Map<string, string>>();
    for (const label of skillLabels) {
        const parsed = parseToolLabel(label);
        if (parsed.kind !== "skill") continue;
        const description = descriptionOf(label);
        if (description === null) continue;
        const key = `${parsed.owner}/${parsed.repo}`;
        const pack = packs.get(key) ?? new Map<string, string>();
        pack.set(parsed.skill, description);
        packs.set(key, pack);
    }
    const own = packs.get(repo);
    if (own === undefined || own.size === 0) return [];
    const others: string[] = [];
    for (const [other, pack] of packs) {
        if (other === repo || pack.size !== own.size) continue;
        let same = true;
        for (const [name, description] of own) {
            if (pack.get(name) !== description) {
                same = false;
                break;
            }
        }
        if (same) others.push(other);
    }
    return others.sort();
}
