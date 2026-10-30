import type {RecentDeclaration} from "@arp-protocol/core";

/**
 * The two readings scene 2 of the landing page makes of one query.
 *
 * `getRecentDeclarations` returns edges; the page shows **who used what** and **who used this**,
 * which are the same edges grouped by their two ends. That grouping is pure data work with no React
 * in it, so it lives here with the repo's other `*-view.ts` modules (`atom-standing-view`,
 * `term-shape-view`, `tool-usage-view`) rather than inside the page — `rules/code.md`: a service
 * never imports from React, and a component never does business logic.
 *
 * It needs no route parameter, which is why the landing can make it at all: `findAgents` wants a
 * search term and `getToolUsage` wants an atom id, and a front page has neither.
 */

export type DeclarationEnd = {atomId: string; label: string | null};

export type DeclarationGroup = {
    /** The end every row in this group shares. */
    key: DeclarationEnd;
    /** Its rows, in the order the read returned them — newest first. */
    rows: RecentDeclaration[];
};

/**
 * The end that appears most often, with its rows.
 *
 * **The tie rule is deliberate: on a tie the one that appeared most recently wins.** `rows` are
 * newest first, so the first group a tie encounters is the newest, and `>` rather than `>=` keeps
 * it. On a front page whose whole subject is current activity, showing the older of two equally
 * busy agents would be the wrong answer, and `>=` would have given it.
 *
 * `null` when there are no rows at all, which is the mainnet answer today. That has to stay a
 * distinct value from "a group with no rows" — the two read differently on screen, and conflating
 * a failed or empty read with an empty record is the defect this page shipped with.
 */
export function busiestEnd(
    declarations: readonly RecentDeclaration[],
    end: (row: RecentDeclaration) => DeclarationEnd,
): DeclarationGroup | null {
    const groups = new Map<string, DeclarationGroup>();
    for (const row of declarations) {
        const key = end(row);
        const group = groups.get(key.atomId) ?? {key, rows: []};
        group.rows.push(row);
        groups.set(key.atomId, group);
    }

    let best: DeclarationGroup | null = null;
    for (const group of groups.values()) {
        if (best === null || group.rows.length > best.rows.length) best = group;
    }
    return best;
}

/** Both groupings in one call, named for the two cards they feed. */
export function groupRecent(declarations: readonly RecentDeclaration[]): {
    agent: DeclarationGroup | null;
    tool: DeclarationGroup | null;
} {
    return {
        agent: busiestEnd(declarations, (row) => row.subject),
        tool: busiestEnd(declarations, (row) => row.object),
    };
}
