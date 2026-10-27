import {createGraphqlTransport, type GraphqlTransport} from "./sources/intuition/graphql.js";
import {TOOL_THING_DESCRIPTION} from "./declare/tool-thing.js";
import {SAME_AS, USES} from "./sources/intuition/terms.js";
import {defaultFetch, type FetchLike} from "./http.js";
import {isRecord, readString} from "./json.js";
import {INTUITION_MAX_PAGE} from "./tool-listing.js";

/**
 * Tools somebody registered through ARP, and what the market on each says.
 *
 * ## Why this exists beside `listTools`
 *
 * `listTools` reads **`uses` edges** — an agent declaring it used a tool — and filters to edges
 * whose subject carries a `same as` edge, because that edge is the only proof on the graph that a
 * subject is a real ERC-8004 agent. There is no "this is an agent" flag; the `same as` link to a
 * CAIP-19 atom is it (`docs/07`, ADR `0015`).
 *
 * That filter is right and it is why the catalogue is empty: measured on mainnet 1155 on 2026-10-21,
 * **0 of 185** `uses` edges have an identified subject.
 *
 * **That zero is our own non-activity, not a property of the graph** (user, 2026-10-27): nobody has run this loop yet, ARP included. It is a reason to show something else today, never a reason to conclude the edge is the wrong one.
 *
 * The rest are sentences anyone wrote on a
 * shared public predicate — "Tip Jar uses Intuition" — whose objects are platforms and book titles.
 * Dropping the filter does not fill the catalogue, it fills it with that.
 *
 * **A registered tool is an atom, not an edge**, so it never passes through that query at all. An
 * atom has no subject, which is the whole reason a human can register one without being an agent:
 *
 * | actor | writes | onto | means |
 * | --- | --- | --- | --- |
 * | a person | the tool's atom, derived from its URL | the atom's vault | "this tool is worth something" |
 * | an agent | `(agent, uses, tool)` | the edge's vault | "I used it, and I am paying to say so" |
 *
 * Two markets, two actors, two questions. ADR `0039` put the *agent's* deposit on the edge and said
 * the atom's vault "answers a different question — a market on the tool itself, open to anyone for
 * any reason". That is this one.
 *
 * The edge row used to name "its counter-vault" alongside the edge's own. Dropped: a triple does get
 * one for free, and 1 of the 185 mainnet `uses` edges has ever carried a position in it
 * (`scripts/measure/counter-side-usage.ts`, 1155, 2026-10-21), so listing it as a destination
 * described a market rather than a mechanism. ADR `0056`.
 *
 * ## How a registered tool is recognised
 *
 * By the recipe, not by a registry ARP keeps. Every field of a tool's Thing is a pure function of
 * its normalised URL (ADR `0054`), and `description` is the **same fixed sentence for every tool**.
 * So the set of tools registered through ARP is exactly the set of atoms carrying that description —
 * no list to maintain, nothing to store, and anyone can compute or verify the membership test.
 *
 * Verified live on mainnet 2026-10-21 that the filter filters rather than being ignored: the same
 * query shape returns **28,722** for `canonicalCaipThing`'s fixed description, and **0** for this
 * one, because nothing has been registered yet. It fills from the first register.
 */
export type RegisteredTool = {
    atomId: string;
    /** The normalised URL without its scheme, which is what the recipe puts in `name`. */
    label: string | null;
    /** The `ipfs://` URI the atom's id derives from. */
    uri: string | null;
    /** The normalised URL. Where to go and look; never a call target (ADR `0051`). */
    url: string | null;
    /**
     * Deposits on the atom's own vault, on the read curve.
     *
     * `positionCount` is the discriminator and `assets` alone is not: creating a term seeds its
     * vault with `minShare` (ADR `0042`), so every registered tool reports non-zero assets whether
     * or not anybody has staked.
     */
    positionCount: number;
    assets: bigint;
    /**
     * How many `uses` edges point at it — an agent having declared it, on top of being registered.
     *
     * Filtered on the predicate, and that filter is not decoration. Unfiltered this counted **every
     * incoming triple under any predicate**, which would have put two populations in one column
     * beside `listTools`'s figure: `uses` edges from identified agents on one row, `has tag` and
     * `same as` and anything else on the next, both labelled "declarations". That is
     * `rules/claims.md` §2, in the same component whose whole existence rests on the opposite
     * filter being necessary.
     *
     * It requires the **same two clauses** `listTools` requires, and the second one was missing for
     * a round: the subject must itself carry a `same as` edge, which is the only proof on the graph
     * that it is a real ERC-8004 agent. Without it this counted `uses` edges from any subject —
     * including the prose this module's own docstring gives as the reason the filter exists — and
     * the catalogue prints both figures under one header, "Declarations". Two populations, one
     * column, one word: `rules/claims.md` §2, in the component whose existence rests on that filter
     * being necessary. Stating the asymmetry in a doc comment was not enough; a reader sees the
     * column.
     */
    declarations: number;
};

export type RegisteredToolsPage = {
    curveId: number;
    tools: RegisteredTool[];
    /** True when the page size was hit, so this is a prefix rather than the whole set. */
    truncated: boolean;
};

export type RegisteredToolsOrder = "conviction" | "stakers" | "declarations";

export type RegisteredToolsConfig = {
    graphqlUrl?: string;
    fetch?: FetchLike;
    timeoutMs?: number;
    transport?: GraphqlTransport;
    curveId?: number;
    /** Defaults to, and is clamped at, {@link INTUITION_MAX_PAGE}. */
    limit?: number;
    order?: RegisteredToolsOrder;
};

const DEFAULT_CURVE_ID = 1;
const DEFAULT_TIMEOUT_MS = 10_000;
const INTUITION_MAINNET_GRAPHQL = "https://mainnet.intuition.sh/v1/graphql";

const REGISTERED_TOOLS_QUERY = `
query RegisteredTools($description: String!, $uses: String!, $sameAs: String!, $curveId: numeric!, $limit: Int!) {
  atoms(where: {value: {thing: {description: {_eq: $description}}}}, limit: $limit) {
    term_id
    label
    data
    value { thing { url } }
    term {
      vaults(where: {curve_id: {_eq: $curveId}}, limit: 1) { position_count total_assets }
    }
    as_object_triples_aggregate(
      where: {
        predicate_id: {_eq: $uses}
        subject: {as_subject_triples: {predicate_id: {_eq: $sameAs}}}
      }
    ) { aggregate { count } }
  }
}`;

function bigintFrom(value: unknown): bigint {
    const text =
        typeof value === "string" ? value : typeof value === "number" ? String(value) : null;
    if (text === null || !/^\d+$/.test(text)) return 0n;
    return BigInt(text);
}

function numberFrom(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** `"null"` reaches the indexer as a literal string for some pinned Things. Not a url. */
function urlFrom(value: unknown): string | null {
    const text = typeof value === "string" ? value.trim() : "";
    return text.length === 0 || text === "null" ? null : text;
}

export async function listRegisteredTools(
    config: RegisteredToolsConfig = {},
): Promise<RegisteredToolsPage> {
    const transport =
        config.transport ??
        createGraphqlTransport({
            url: config.graphqlUrl ?? INTUITION_MAINNET_GRAPHQL,
            fetch: config.fetch ?? defaultFetch(),
            timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });

    const curveId = config.curveId ?? DEFAULT_CURVE_ID;
    const limit = Math.min(config.limit ?? INTUITION_MAX_PAGE, INTUITION_MAX_PAGE);

    const data = await transport.request(REGISTERED_TOOLS_QUERY, {
        description: TOOL_THING_DESCRIPTION,
        uses: USES,
        sameAs: SAME_AS,
        curveId: String(curveId),
        limit,
    });

    const rows = Array.isArray(data["atoms"]) ? data["atoms"] : [];
    const tools: RegisteredTool[] = [];
    for (const row of rows) {
        if (!isRecord(row)) continue;
        const termId = readString(row, "term_id");
        if (termId === null) continue;

        const term = isRecord(row["term"]) ? row["term"] : null;
        const vaults = term !== null && Array.isArray(term["vaults"]) ? term["vaults"] : [];
        const vault = vaults.length > 0 && isRecord(vaults[0]) ? vaults[0] : null;

        const value = isRecord(row["value"]) ? row["value"] : null;
        const thing = value !== null && isRecord(value["thing"]) ? value["thing"] : null;

        const edges = isRecord(row["as_object_triples_aggregate"])
            ? row["as_object_triples_aggregate"]
            : null;
        const aggregate = edges !== null && isRecord(edges["aggregate"]) ? edges["aggregate"] : null;

        tools.push({
            atomId: termId,
            label: readString(row, "label"),
            uri: readString(row, "data"),
            url: urlFrom(thing?.["url"]),
            positionCount: vault === null ? 0 : numberFrom(vault["position_count"]),
            assets: vault === null ? 0n : bigintFrom(vault["total_assets"]),
            declarations: aggregate === null ? 0 : numberFrom(aggregate["count"]),
        });
    }

    const order = config.order ?? "conviction";
    tools.sort((a, b) => {
        // Positions before assets in every order, because assets alone include the creation dust
        // every term is seeded with — a tool nobody staked on would otherwise outrank nothing at
        // all rather than sorting with the rest of the unstaked (ADR `0042`).
        if (order === "stakers" && a.positionCount !== b.positionCount) {
            return b.positionCount - a.positionCount;
        }
        if (order === "declarations" && a.declarations !== b.declarations) {
            return b.declarations - a.declarations;
        }
        if (a.positionCount !== b.positionCount) return b.positionCount - a.positionCount;
        if (a.assets !== b.assets) return a.assets < b.assets ? 1 : -1;
        return b.declarations - a.declarations;
    });

    return {curveId, tools, truncated: rows.length >= limit};
}
