import {createGraphqlTransport, type GraphqlTransport} from "../sources/intuition/graphql.js";
import {
    COMPATIBLE_WITH,
    HAS_CATEGORY,
    HAS_TAG,
    HAS_TYPE,
    IMPLEMENT,
    SAME_AS,
    USE,
} from "../sources/intuition/terms.js";
import {defaultFetch, type FetchLike} from "../http.js";
import {isRecord, readString} from "../json.js";

/**
 * Who could do this job, from what agents have declared about themselves.
 *
 * The first step of `tasks/25`. A buyer cannot hire without a list, and the list has to come from
 * the graph rather than from ARP: ARP publishes no score and no ranking (ADR `0046`), so what this
 * returns is **what each agent said about itself and what the market put behind it**, in the order
 * the market put it there.
 *
 * ## Why capability edges and not `uses`
 *
 * `listTools` reads `uses`, and measured on mainnet 1155 on 2026-10-22, **0 of 185** such edges have
 * an identified agent as their subject. A candidate list built on `uses` would be empty today.
 *
 * Capability edges are a different population and they are populated: an agent declares
 * `has category`, `has tag`, `has type`, `implement`, `use` (the protocol one, ADR `0030`) and
 * `compatible with`. Those are what the trust panel already renders, so a candidate list built on
 * them shows the same facts a buyer would check by hand.
 *
 * ## The filter that makes a result trustworthy, and its cost
 *
 * The subject must carry a `same as` edge. That link to a CAIP-19 atom is the **only** proof on the
 * graph that a subject is a real ERC-8004 agent — there is no flag (`docs/07`, ADR `0015`) — and
 * without it the list fills with sentences anyone wrote on a shared public predicate. The cost is
 * that an agent nobody has mirrored is invisible here, which is the honest state of the graph and
 * not something to paper over.
 *
 * ## What this does not do
 *
 * It does not rank by quality, because ARP has no quality to rank by. The order is **what is staked
 * on the agent's own atom**, which is ADR `0056`'s backing figure: how much capital has chosen to
 * sit on this agent, not how good anybody says it is. A buyer reads it beside the capability that
 * matched and decides.
 */

const DEFAULT_CURVE_ID = 1;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_LIMIT = 25;
const INTUITION_MAINNET_GRAPHQL = "https://mainnet.intuition.sh/v1/graphql";

/** The predicates an agent describes itself with. Frozen ids, never resolved by label (ADR `0015`). */
export const CAPABILITY_PREDICATES: readonly string[] = [
    HAS_CATEGORY,
    HAS_TAG,
    HAS_TYPE,
    IMPLEMENT,
    USE,
    COMPATIBLE_WITH,
];

export type AgentCandidate = {
    /** The agent's identity atom. The subject of the edge that matched, and of a rating later. */
    atomId: string;
    label: string | null;
    /** The capability atom that matched the search, so a reader sees *why* this agent is here. */
    matched: {predicateId: string; label: string | null};
    /**
     * TRUST on the agent's own atom — ADR `0056`'s backing — or `null` when nobody has staked.
     *
     * **`null`, not `0n`, and the difference is measured.** Creating an atom seeds its vault with
     * `minShare`, so every agent on the graph reports 1,000,000 wei whether or not a single account
     * has ever backed it: observed on 2026-10-22 across the `MCP Server` candidates, where all but
     * one sat at exactly that. Returning it as a number would put `<0.00000001 TRUST` beside a real
     * 5.78, which is a figure for capital that does not exist (ADR `0042`). The position count is
     * the discriminator, so the amount is reported only when the count says there is one.
     */
    backingAssets: bigint | null;
    /** How many accounts hold a position there. Never summed with anything (ADR `0023`). */
    backers: number;
};

export type FindAgentsPage = {
    agents: AgentCandidate[];
    /** True when the read hit its limit, so this is a prefix rather than the whole answer. */
    truncated: boolean;
    curveId: number;
    /** What was searched for, echoed so a caller can label the list without keeping state. */
    domain: string;
};

export type FindAgentsConfig = {
    graphqlUrl?: string;
    fetch?: FetchLike;
    timeoutMs?: number;
    transport?: GraphqlTransport;
    curveId?: number;
    limit?: number;
    /** Narrow the search to one predicate, e.g. `HAS_CATEGORY`. Defaults to all six. */
    predicates?: readonly string[];
};

const FIND_AGENTS_QUERY = `
query FindAgents($domain: String!, $predicates: [String!], $sameAs: String!, $curveId: numeric!, $limit: Int!) {
  triples(
    where: {
      predicate_id: {_in: $predicates}
      object: {label: {_ilike: $domain}}
      subject: {as_subject_triples: {predicate_id: {_eq: $sameAs}}}
    }
    limit: $limit
  ) {
    predicate_id
    object { label }
    subject {
      term_id
      label
      term { vaults(where: {curve_id: {_eq: $curveId}}, limit: 1) { position_count total_assets } }
    }
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

/**
 * @param domain What to match an agent's declared capability against, case-insensitively. `%` is
 *               the graph's wildcard, so `"defi%"` is a prefix search and `"defi"` is exact-ish.
 *               Passed through rather than escaped: a caller searching for a literal `%` is doing
 *               something deliberate, and quietly changing their query would be worse.
 */
export async function findAgents(
    domain: string,
    config: FindAgentsConfig = {},
): Promise<FindAgentsPage> {
    const term = domain.trim();
    if (term.length === 0) throw new Error("findAgents: domain must not be empty");

    const transport =
        config.transport ??
        createGraphqlTransport({
            url: config.graphqlUrl ?? INTUITION_MAINNET_GRAPHQL,
            fetch: config.fetch ?? defaultFetch(),
            timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });

    const curveId = config.curveId ?? DEFAULT_CURVE_ID;
    const limit = config.limit ?? DEFAULT_LIMIT;

    const data = await transport.request(FIND_AGENTS_QUERY, {
        domain: term,
        predicates: [...(config.predicates ?? CAPABILITY_PREDICATES)],
        sameAs: SAME_AS,
        curveId: String(curveId),
        limit,
    });

    const rows = Array.isArray(data["triples"]) ? data["triples"] : [];
    /**
     * One row per agent, not per edge.
     *
     * An agent declaring three tags that all match returns three rows, and listing it three times
     * would make a candidate's position in the list a function of how verbose it was about itself.
     * The first match is kept, so `matched` is one capability and not a summary of several.
     */
    const byAgent = new Map<string, AgentCandidate>();
    for (const row of rows) {
        if (!isRecord(row)) continue;
        const subject = isRecord(row["subject"]) ? row["subject"] : null;
        const atomId = readString(subject, "term_id");
        if (atomId === null) continue;
        if (byAgent.has(atomId.toLowerCase())) continue;

        const vaults =
            subject !== null && isRecord(subject["term"]) && Array.isArray(subject["term"]["vaults"])
                ? subject["term"]["vaults"]
                : [];
        const vault = isRecord(vaults[0]) ? vaults[0] : null;
        const object = isRecord(row["object"]) ? row["object"] : null;

        const backers = vault === null ? 0 : numberFrom(vault["position_count"]);
        byAgent.set(atomId.toLowerCase(), {
            atomId,
            label: readString(subject, "label"),
            matched: {
                predicateId: readString(row, "predicate_id") ?? "",
                label: readString(object, "label"),
            },
            backingAssets: backers === 0 || vault === null ? null : bigintFrom(vault["total_assets"]),
            backers,
        });
    }

    // Backed agents first, by how much; everything unbacked keeps the graph's own order rather
    // than being re-ranked on a figure it does not have.
    const agents = [...byAgent.values()].sort((a, b) => {
        const left = a.backingAssets ?? -1n;
        const right = b.backingAssets ?? -1n;
        return left === right ? 0 : left > right ? -1 : 1;
    });

    return {agents, truncated: rows.length >= limit, curveId, domain: term};
}
