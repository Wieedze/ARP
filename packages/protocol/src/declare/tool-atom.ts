import {createGraphqlTransport, type GraphqlTransport} from "../sources/intuition/graphql.js";
import {INTUITION_MAINNET_GRAPHQL} from "../sources/intuition/index.js";
import {defaultFetch, type FetchLike} from "../http.js";
import {isRecord, readString} from "../json.js";

/** An atom that already represents a tool, found by the URL inside its pinned Thing. */
export type ToolAtomCandidate = {
    termId: string;
    label: string | null;
    /** The atom's `data` — the `ipfs://` URI its id derives from. */
    uri: string | null;
};

/**
 * Finds the atom a tool already has, so a second one is not created beside it.
 *
 * Why this exists, measured by `scripts/measure/tool-atom-shape.ts` on Intuition mainnet 1155 on
 * 2026-10-19 over the 84 distinct object
 * atoms on the 185 `uses` edges:
 *
 * | the object atom's `data`           | count | resolves a `value.thing` |
 * | ---------------------------------- | ----- | ------------------------ |
 * | `ipfs://…` (a pinned Thing)        | 78    | 77                       |
 * | raw `http(s)://…`                  | 2     | **0**                    |
 * | neither                            | 4     | 0                        |
 *
 * The canon for a tool is a **pinned Thing**, and the only two raw-URL atoms in the set are
 * `https://schema.org/keywords` and `https://schema.org/FollowAction` — vocabulary terms, not
 * tools. So **no tool in the cohort is a bare URL atom**.
 *
 * `atomDataForUri` derives the id from the URI, which for an `ipfs://` URI *is* the pinned document
 * (ADR `0008`) and therefore coincides with the canon. For an `https://` endpoint it does not: it
 * would mint a metadata-less atom beside the tool's real one, and the tool's reputation would split
 * across two ids permanently — Intuition has no deletion. That is ADR `0039`'s failure mode one
 * level up: the right vault on the wrong atom.
 *
 * **This needs no pinning credential.** It is a graph read. `docs/07`'s "you need a partner pinning
 * API key" scopes to *minting* an atom, which this never does.
 */
export type ToolAtomLookup = {
    /** Every atom whose pinned Thing carries this exact `url`. May be empty, one, or several. */
    findByUrl(url: string): Promise<ToolAtomCandidate[]>;
};

const BY_URL_QUERY = `
query ToolAtomByUrl($url: String!) {
  atoms(where: {value: {thing: {url: {_eq: $url}}}}, limit: 10) {
    term_id
    label
    type
    data
  }
}`;

export type ToolAtomLookupConfig = {
    graphqlUrl?: string;
    fetch?: FetchLike;
    timeoutMs?: number;
    /** Pre-built transport. Tests inject one here so no network is touched. */
    transport?: GraphqlTransport;
};

/**
 * The lookup, over the Intuition indexer.
 *
 * Verified live on mainnet 2026-10-19: `https://github.com` returns **five** `Thing` atoms, and an
 * unused URL returns none. (An earlier probe said three — it had `limit: 3`. The real figure needs
 * this query's `limit: 10`, and five is still a floor, not a count.) That fragmentation is why this
 * returns a list and the planner refuses to choose: picking the first match is the failure
 * `sources/intuition/terms.ts` was written to prevent, and here the cost of choosing wrong is a
 * permanent write.
 */
export function intuitionToolAtomLookup(config: ToolAtomLookupConfig = {}): ToolAtomLookup {
    const transport =
        config.transport ??
        createGraphqlTransport({
            url: config.graphqlUrl ?? INTUITION_MAINNET_GRAPHQL,
            fetch: config.fetch ?? defaultFetch(),
            ...(config.timeoutMs === undefined ? {} : {timeoutMs: config.timeoutMs}),
        });

    return {
        async findByUrl(url: string): Promise<ToolAtomCandidate[]> {
            const data = await transport.request(BY_URL_QUERY, {url});
            const rows = Array.isArray(data["atoms"]) ? data["atoms"] : [];
            const candidates: ToolAtomCandidate[] = [];
            for (const row of rows) {
                if (!isRecord(row)) continue;
                const termId = readString(row, "term_id");
                if (termId === null) continue;
                candidates.push({
                    termId,
                    label: readString(row, "label"),
                    uri: readString(row, "data"),
                });
            }
            return candidates;
        },
    };
}

/** A URI whose atom id derives from the URI itself, with no lookup needed. */
export function derivesItsOwnAtom(uri: string): boolean {
    // ADR 0008: the atom id is keccak of the URI bytes, so for a URI that IS the pinned document
    // the derivation and the canon are the same thing. `ipfs://` and `ar://` are content
    // addresses; an `https://` endpoint is a location, and the tool's pinned Thing is elsewhere.
    return /^(ipfs|ar):\/\//i.test(uri.trim());
}
