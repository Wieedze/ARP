import {seedTitleOf} from "../lib/tool-catalogue-seed";
import {parseToolLabel, primaryNameOf, sourceOf} from "../lib/tool-label";
import {formatTrust} from "./trust-format";
import type {
    RegisteredTool,
    RegisteredToolsPage,
    ToolListing,
    ToolListingOrder,
    ToolListingPage,
} from "@arp-protocol/core";

/**
 * Turns one `ToolListingPage` into the rows `/tools` renders.
 *
 * Pure: no network, no React. It does no sorting and no filtering of its own. The order is a
 * property of the whole listing, and the filtering that matters — agent declarations only — happens
 * in the query (`listTools`), because prose on a shared predicate is not this protocol's data and
 * should not reach a caller at all.
 */

/**
 * The two orders the page offers, and neither is a quality ranking.
 *
 * There is no order by score and will not be: ARP composes none (ADR `0046`), and one descending
 * score column would undo the argument the whole surface exists to make.
 */
/**
 * The two bonding curves, named for what a position on each one *means* rather than by its id.
 *
 * Read off the curve registry on mainnet 1155, 2026-10-20: there are exactly two — curve 1 "Linear
 * Curve" and curve 2 "Offset Progressive Curve" — and `defaultCurveId` is 1.
 *
 * They carry different information, which is why this is a selector and never a sum:
 *
 * | curve | what it does | what a position says |
 * | --- | --- | --- |
 * | 1, linear | price tracks supply proportionally | "I stand behind this, durably" — the gain follows growth, not timing |
 * | 2, offset progressive | price rises faster than supply | "I think this is about to be noticed" — early entry pays a lot, late entry overpays |
 *
 * Measured the same day over the 185 `uses` edges: curve 1 holds 26.20 TRUST at a share price of
 * 1.000–1.060 across 185 vaults; curve 2 holds 219.54 at 3.000–4.181 across 28. **Two populations,
 * never added** — a lot on the linear curve beside little on the progressive reads as quietly
 * trusted, the reverse reads as hyped, and a total erases both readings.
 */
/**
 * The two bonding curves the MultiVault runs, by the contract's own names.
 *
 * They were labelled "Long term" and "Short term" under a control called "Horizon". The user could
 * not read it (2026-10-27): _« je comprends pas horizon ? Là on a un registre de tool avec de la
 * valeur et tu proposes un horizon, ce n'est pas compréhensible. »_ He is right, and
 * `curveLabelOf`'s own docstring one function down already argued the point against itself —
 * "curve 7 is honest where Long term would be an invention". Long/short term was exactly that
 * invention: nothing in the contract is about time.
 *
 * What the control actually picks is **which vault's money you are looking at**. Measured on
 * mainnet 2026-10-20, curve 1 holds 26.20 TRUST across 185 `uses` vaults and curve 2 holds 219.54
 * — 89.33% of it (`scripts/measure/stake-vault-placement.ts`). So it is not a preference, it is
 * the difference between seeing a tenth of the market and seeing the rest.
 */
export const TOOL_CURVES: readonly {id: number; label: string; curve: string}[] = [
    {id: 1, label: "Linear", curve: "Linear Curve"},
    {id: 2, label: "Progressive", curve: "Offset Progressive Curve"},
];

/**
 * `1` → `"Linear"`, for a figure that needs to name the curve it was read at.
 *
 * Here and not beside the control that uses it: a component file that also exports a function breaks
 * fast refresh, and this belongs with `TOOL_CURVES` regardless.
 *
 * Falls back to the id rather than to a guess — a curve this app does not know is a curve it cannot
 * name, and "curve 7" is honest where "Long term" would be an invention.
 */
export function curveLabelOf(curveId: number): string {
    return TOOL_CURVES.find((entry) => entry.id === curveId)?.label ?? `curve ${curveId}`;
}

/**
 * Two ways to read the list, because there are two things that happen to a tool.
 *
 * A tool is an open market exactly like an agent: an agent can **say it used it**, and anyone can
 * **put money on it**. Count and amount. That is the whole space, and it is what the user asked
 * for — _« ce qu'on veut voir c'est les plus populaires et les plus investis »_.
 *
 * | label        | reads          | the question                      |
 * | ------------ | -------------- | --------------------------------- |
 * | Most claims  | `declarations` | how many agents said they used it |
 * | Most staked  | `conviction`   | how much money is behind it       |
 *
 * ## It says "claims", not "used", and the difference is the project
 *
 * It said **"Most used"** for one commit. The user caught it (2026-10-27): _« most used, c'est
 * compliqué d'affirmer ça… si on déclare qu'on l'utilise mais on l'utilise pas ? »_
 *
 * `docs/14` answers that in its first line and the answer is blunt: **you cannot know.** A runtime
 * is unobservable from outside, an SDK inside the agent's process only moves the lie one layer in,
 * and proving what a program did internally needs a hardware root of trust or a zk proof — not an
 * npm package. So `declarations` counts **sentences somebody wrote**, never uses that happened,
 * and "used" was a tier-4 word on tier-1 data (`docs/09` §3's ladder).
 *
 * What the count *is* bounded by, and it is not nothing: the subject must carry a `same as` edge,
 * so it is an identified ERC-8004 agent rather than anybody's prose — that filter is in the query
 * (`tool-listing.ts`), not applied afterwards. And writing the edge costs 0.1 TRUST in a
 * non-recoverable fee. A claim here is cheap talk that cost money, which is exactly the rung it
 * sits on and exactly why the next column exists.
 *
 * **`priced-edges` is gone from this control**, and it was the default. It ranked by *how many of
 * the claims carry a position* — a count of backed claims, which sits between the other two and is
 * neither. The user read "Most paid for" and "Most staked" as the same thing (2026-10-27), and
 * having to explain that one is a count and the other a sum is the proof that it should not be a
 * button. The package still exposes the order; this page no longer offers it.
 *
 * `conviction` is the default in its place: the page's argument is that money behind a claim is
 * what separates it from an assertion (`docs/09` §3), and leading on a free count would rank the
 * list by the rung the ladder exists to demote.
 */
export const TOOL_ORDERS: readonly {id: ToolListingOrder; label: string}[] = [
    {id: "declarations", label: "Most claims"},
    {id: "conviction", label: "Most staked"},
];

/**
 * Which of the two populations a row came from, and they are not interchangeable.
 *
 * `registered` — somebody created the tool's **atom** from its URL and priced the tool itself.
 * `declared` — an agent wrote `(agent, uses, tool)` and priced its own claim to have used it.
 *
 * A row says which, because the figure means something different in each: one is a market on the
 * tool, the other a market on a claim about it (ADR `0039`). A tool can be in both, and then it
 * appears once with its declarations counted.
 */
type ToolProvenance = "registered" | "declared";

export type ToolRow = {
    key: string;
    provenance: ToolProvenance;
    /** The tool's label, or its atom id when the graph holds no label. */
    name: string;
    /** True when `name` is the atom id, so it can be set in mono. */
    isUnnamed: boolean;
    /**
     * `owner/repo` for a skill, `null` for anything else.
     *
     * A skill atom's label is the whole URL, because every field of its Thing derives from one
     * (ADR `0054`) and nobody gets to type a name. `github.com/` is on all 715 of them, so a row
     * showing it 715 times says nothing and crowds out the part that differs. The skill leads; its
     * repository goes underneath, and a repository row gets nothing rather than a line repeating
     * its own name.
     */
    source: string | null;
    /**
     * The atom's own label, kept raw.
     *
     * `name` is parsed for reading and `label` is the key: the description and the install count
     * live beside the chain, keyed by exactly this string, so a lookup needs the value the graph
     * gave rather than the one the page shows.
     */
    label: string | null;
    href: string;
    declarations: number;
    /**
     * How many of this tool's declarations carry at least one position, or `null` when this read
     * cannot say.
     *
     * Never a summed position count: positions are counted per vault, and a sum across an atom's
     * edges is a count of nothing a reader recognises (ADR `0023`).
     */
    paidDeclarations: number | null;
    supportTrust: string;
    /**
     * TRUST deposited against the tool's declarations, or `null`.
     *
     * `null` carries **two** meanings. For a `declared` row it is measured: nothing stands against
     * it. For a `registered` row it is hardcoded, because an atom's vault has no counter side — so
     * `null` there means "not applicable", not "nobody disagrees". It decides whether the cell
     * stays empty and nothing branches on it: the `contested` filter did, and ADR `0056` removed
     * it.
     */
    opposeTrust: string | null;
    /**
     * How many positions stand on the tool's own atom. `null` for a `declared` row.
     *
     * Not foldable into `paidDeclarations`: that counts **edges** carrying a position, this counts
     * positions in **one** vault. Summing them would be the per-vault-versus-across-edges error
     * ADR `0023` predicted in writing.
     */
    stakers: number | null;
};

/**
 * Which of the page's two indexes a row belongs to.
 *
 * One read, shown as two lists (the user, 2026-10-29: _« comme si c'était deux index différents,
 * même si ça ne l'est pas »_). A skill carries its repository in `source`; everything else, the
 * repositories and the MCP servers among them, is the other index.
 *
 * It replaced the `All / Claimed / Paid for` control, which the user found unreadable and never
 * moved off `All`; nothing narrows the list by its figures now, and every figure is still on the
 * row.
 */
export type ToolIndex = "skills" | "repos";

export const TOOL_INDEXES: readonly {id: ToolIndex; label: string}[] = [
    {id: "skills", label: "Skills"},
    {id: "repos", label: "Repositories"},
];

export function toolIndexOf(row: ToolRow): ToolIndex {
    return row.source === null ? "repos" : "skills";
}

export type ToolCatalogView = {
    rows: ToolRow[];
    /** True when the read hit its limit, so these rows are a prefix rather than the whole set. */
    truncated: boolean;
    /**
     * The bonding curve the figures were read at.
     *
     * Part of a TRUST sum's population (`rules/claims.md` §2), carried so the list can name it on
     * the figure itself rather than in a line of its own.
     */
    curveId: number;
};

/**
 * The name this app shows for a tool row: its seed title if we have one, else the atom's own label.
 *
 * The seed title is front-end only and overrides the label on purpose — the label *is* the URL
 * (`toolThing` derives it), so "Stripe" and `github.com/stripe/agent-toolkit` are the same atom
 * read two ways, and the URL stays visible on the atom page. `null` when there is neither, so the
 * caller falls back to the atom id and `isUnnamed` keeps meaning "the graph named nothing".
 */
function displayNameOf(label: string | undefined, named: boolean): string | null {
    if (!named || label === undefined) return null;
    const seeded = seedTitleOf(label);
    if (seeded !== null && seeded !== undefined) return seeded;
    return primaryNameOf(parseToolLabel(label));
}

/** `owner/repo` under a skill's name, and nothing under anything else. */
function sourceLineOf(label: string | undefined): string | null {
    return label === undefined ? null : sourceOf(parseToolLabel(label));
}

function rowOf(tool: ToolListing): ToolRow {
    const label = tool.label?.trim();
    const named = label !== undefined && label.length > 0;
    return {
        key: tool.atomId,
        provenance: "declared",
        name: displayNameOf(label, named) ?? tool.atomId,
        isUnnamed: !named,
        source: sourceLineOf(label),
        label: label ?? null,
        href: `/atom/${tool.atomId}`,
        declarations: tool.edgeCount,
        paidDeclarations: tool.pricedEdges,
        supportTrust: formatTrust(tool.supportAssetsSum),
        opposeTrust: tool.opposeAssetsSum > 0n ? formatTrust(tool.opposeAssetsSum) : null,
        stakers: null,
    };
}

function registeredRowOf(tool: RegisteredTool): ToolRow {
    const label = tool.label?.trim();
    const named = label !== undefined && label.length > 0;
    return {
        key: tool.atomId,
        provenance: "registered",
        name: displayNameOf(label, named) ?? tool.atomId,
        isUnnamed: !named,
        source: sourceLineOf(label),
        label: label ?? null,
        href: `/atom/${tool.atomId}`,
        declarations: tool.declarations,
        // `null`, not `0`: pricing a registered row's declarations needs the per-edge vaults, which
        // is `listTools`'s read, so this is **unknown** here. A zero under "paid for" would read as
        // "nobody paid", which is a claim this read cannot make — the same distinction the oppose
        // column makes two cells over by staying empty.
        paidDeclarations: null,
        supportTrust: formatTrust(tool.assets),
        opposeTrust: null,
        stakers: tool.positionCount,
    };
}

/**
 * The two populations, merged into one list, with the declared row winning a collision.
 *
 * **Why two reads and not one widened filter.** `listTools` keeps only `uses` edges whose subject
 * carries a `same as` edge — the only proof on the graph that a subject is a real ERC-8004 agent,
 * since there is no flag for it. That filter is why the catalogue was empty: measured on mainnet
 * 2026-10-21, **0 of 185** `uses` edges have an identified subject, and the rest are sentences
 * anyone wrote on a shared public predicate, with platforms and book titles as objects. Widening the
 * filter fills the catalogue with those.
 *
 * **That zero is our own non-activity, not a property of the graph** (user, 2026-10-27): nobody has run this loop yet, ARP included. It is a reason to show something else today, never a reason to conclude the edge is the wrong one.
 *
 * A **registered** tool is an atom, so it never passes through that query at all, and a person can
 * create one without being an agent. Two reads, two populations, each honest about what it is.
 *
 * A collision keeps the declared row because it carries the per-edge market the page is about.
 *
 * The registered row's atom-vault figures answer the other question and are **not** reachable
 * anywhere in this app yet: `/atom/:atomId` sums the edge vaults per predicate, and nothing deposits on a tool's
 * atom. An earlier version of this sentence said they were — and the same sentence was corrected in
 * `ToolCatalogList` while this copy, the one that file imports its types from, kept the stale
 * version (`rules/claims.md` failure 5).
 */
export function buildToolCatalogView(
    page: ToolListingPage,
    registered?: RegisteredToolsPage,
): ToolCatalogView {
    const rows = page.tools.map(rowOf);
    const declared = new Set(rows.map((row) => row.key.toLowerCase()));
    for (const tool of registered?.tools ?? []) {
        if (!declared.has(tool.atomId.toLowerCase())) rows.push(registeredRowOf(tool));
    }
    return {
        rows,
        truncated: page.truncated || (registered?.truncated ?? false),
        curveId: page.curveId,
    };
}

/**
 * Flat, or one row per repository that opens.
 *
 * **Not a filter.** A filter removes rows; this decides how the same rows are laid out, so the two
 * compose: a reader can narrow to `image` *and* group by repository. That is why it lives beside
 * `Order` and not in the rail.
 *
 * It exists because the catalogue went from 53 rows to 715 on 2026-10-29 (ADR `0077`): 662 of them
 * are skills and 53 are the repositories and servers they came from. 71 of the skills come from one
 * repository. A flat list of 715 buries the question
 * "who publishes this" under scrolling.
 */
export type ToolGrouping = "flat" | "repo";

export const TOOL_GROUPINGS: readonly {id: ToolGrouping; label: string}[] = [
    {id: "flat", label: "Flat"},
    {id: "repo", label: "By repo"},
];

export type ToolGroup = {
    /** `owner/repo`, or the row's own name when it could not be parsed as one. */
    repo: string;
    rows: ToolRow[];
};

/**
 * Rows gathered under the repository they came from, keeping the order they arrived in.
 *
 * A repository's place in the list is its **best** row's place, not the sum of its rows: a
 * repository with 71 ordinary skills would otherwise outrank one with a single excellent one, which
 * is the aggregation question ADR `0077` settled by changing the unit rather than picking a rule.
 * Here the caller has already ordered the rows, so first-seen is best-seen.
 */
export function groupByRepo(rows: readonly ToolRow[]): ToolGroup[] {
    const groups = new Map<string, ToolRow[]>();
    for (const row of rows) {
        const parsed = parseToolLabel(row.name);
        const key = parsed.kind === "other" ? row.name : `${parsed.owner}/${parsed.repo}`;
        groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups].map(([repo, list]) => ({repo, rows: list}));
}

/**
 * Whether a tool answers, which is the one input nobody can be paid to change.
 *
 * `dead` is the owner's own word — a repository they archived, or one that is gone. `unknown` is
 * not a soft no: it is a tool whose repository this build carries no reading for, and sorting it
 * with the dead would be asserting something about it.
 */
export type Liveness = "alive" | "unknown" | "dead";

export function livenessOf(fact: {archived: boolean; gone: boolean} | null): Liveness {
    if (fact === null) return "unknown";
    return fact.gone || fact.archived ? "dead" : "alive";
}

/**
 * The axes a reader can sort by. **Not weights** — one at a time, and the row shows all of them.
 *
 * ADR `0046` refused a composed score and this is why it still holds while the page still answers
 * "which do I pick". Composing one means choosing how much a million installs is worth against two
 * TRUST staked, and that is a decision rather than a measurement: publish it and whoever has
 * capital pushes on the heaviest term, at about $0.00005 an address.
 *
 * So the page gates and sorts instead. The gate is liveness, which cannot be bought. Above it the
 * axis belongs to the reader, and every axis's figure sits on the row beside the others, so it is
 * visible which one is doing the work.
 */
export type ToolSortAxis = "staked" | "claims" | "installs";

export const TOOL_SORT_AXES: readonly {id: ToolSortAxis; label: string}[] = [
    {id: "staked", label: "Most staked"},
    {id: "claims", label: "Most claims"},
    {id: "installs", label: "Most installs"},
];

const LIVENESS_RANK: Record<Liveness, number> = {alive: 0, unknown: 1, dead: 2};

/**
 * Gate, then sort. A tool that does not answer sorts below one that does, whatever either staked.
 *
 * `installs` lives beside the chain rather than on it (a skill atom carries its URL and nothing
 * else, ADR `0054`), so the sort happens here rather than in the query — which the page can afford
 * because it reads the whole population rather than a page of it.
 */
export function rankTools(
    rows: readonly ToolRow[],
    axis: ToolSortAxis,
    read: (row: ToolRow) => {liveness: Liveness; installs: number | null},
): ToolRow[] {
    return [...rows].sort((left, right) => {
        const a = read(left);
        const b = read(right);
        if (LIVENESS_RANK[a.liveness] !== LIVENESS_RANK[b.liveness]) {
            return LIVENESS_RANK[a.liveness] - LIVENESS_RANK[b.liveness];
        }
        if (axis === "installs") return (b.installs ?? -1) - (a.installs ?? -1);
        if (axis === "claims") return right.declarations - left.declarations;
        // `staked` is the position COUNT before the amount: creating a term seeds its vault, so an
        // amount alone ranks a tool nobody staked on above nothing at all (ADR `0042`).
        const leftStakers = left.stakers ?? 0;
        const rightStakers = right.stakers ?? 0;
        if (leftStakers !== rightStakers) return rightStakers - leftStakers;
        return right.supportTrust.localeCompare(left.supportTrust, "en", {numeric: true});
    });
}
