import type {SigilModule} from "../components/brand/sigil-geometry";
import type {CapabilityGroup} from "./agent-trust";

/**
 * The agent's declared tools, as the sigil's input. Pure: no React, no network.
 *
 * ADR `0057` §5 says a cell is "a declared tool (a `uses` triple)", so only the `uses-tool` group
 * feeds it. The other groups are different claims — `implements`, `supports-protocol`, `has-type`,
 * tags — and mixing them in would make the glyph a count of assorted statements rather than of what
 * the agent actually composes with.
 *
 * ## Why every dot comes back `declared` today, and why that is the honest answer
 *
 * The three states are `docs/14`'s distinction: `proven` needs a **third party's receipt** — a
 * redeemed delegation, a payment, an on-chain call. Nothing in this app reads one. `mismatch` needs
 * usage observed without a declaration, which needs the same evidence from the other side.
 *
 * So the whole glyph renders hollow, and that is not a placeholder: it is the state of the graph,
 * drawn. `docs/14`'s ladder has five rungs and this data reaches two; a sigil with a filled dot in
 * it would claim a rung nothing in this repo can read. When a receipt source exists, this function
 * is the one place that changes.
 *
 * The glyph still differs per agent, because the cells are hashed from `(moduleKey, agentId)` — so
 * it works as an identity from the first declaration, before any of it is proven.
 */

/**
 * A module's stable key for hashing.
 *
 * `sourceHandle` is the Intuition term id when the graph gave one, and that is what should drive the
 * placement: a tool renamed upstream must not re-draw every sigil that includes it. The name is the
 * fallback, which is also what `HANDOFF.md` §4 prescribes — "use the module atom id when it exists,
 * otherwise the name".
 */
function moduleKey(entry: {sourceHandle: string | null; name: string | null; label: string | null}):
    | string
    | null {
    const key = entry.sourceHandle ?? entry.name ?? entry.label;
    const trimmed = key?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
}

export function sigilModulesOf(groups: readonly CapabilityGroup[]): SigilModule[] {
    const usesTool = groups.find((group) => group.relation === "uses-tool");
    if (usesTool === undefined) return [];

    const seen = new Set<string>();
    const modules: SigilModule[] = [];
    for (const entry of usesTool.entries) {
        const key = moduleKey(entry);
        // A duplicate would claim a second set of cells for one tool, which reads as a busier agent.
        if (key === null || seen.has(key)) continue;
        seen.add(key);
        modules.push({name: key, state: "declared"});
    }
    return modules;
}
