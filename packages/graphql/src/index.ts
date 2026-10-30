/**
 * `@arp-protocol/graphql` — the read layer under `@arp-protocol/core` (ADR `0082`).
 *
 * The HTTP transport, the GraphQL client over it, and every query document the protocol sends to
 * an Intuition indexer. It knows the Intuition schema and nothing about ARP: no term id, no
 * predicate, no chain. Every id a query filters on arrives as a variable, so the same document
 * runs against any network the caller points the transport at.
 */
export {
    DEFAULT_TIMEOUT_MS,
    defaultFetch,
    fetchWithTimeout,
    HttpError,
    isTimeoutError,
    type FetchLike,
} from "./http.js";
export {
    isRecord,
    omitPath,
    readArray,
    readBigInt,
    readNumber,
    readPath,
    readRecord,
    readString,
} from "./json.js";
export {
    createGraphqlTransport,
    GraphqlError,
    type GraphqlRequestOptions,
    type GraphqlTransport,
} from "./client.js";

export {
    CAPABILITIES_QUERY,
    CAPABILITY_SAMPLE_LIMIT,
    COHORT_ORDER_BY,
    COHORT_QUERY,
    IDENTITY_SAMPLE_LIMIT,
    RESOLVE_AGENT_QUERY,
    TRUST_SURFACE_QUERY,
} from "./queries/agent.js";
export {
    AGENT_REF_FOR_ATOM_QUERY,
    ATOM_STANDING_QUERY,
    DECLARED_MODULES_FOR_QUERY,
    LISTED_CAPABILITIES_FOR_QUERY,
} from "./queries/atom-standing.js";
export {FIND_AGENTS_QUERY} from "./queries/discover.js";
export {ALL_HIERARCHY_QUERY, OUR_HIERARCHY_QUERY, TAGGED_QUERY} from "./queries/domains.js";
export {RECENT_QUERY} from "./queries/recent.js";
export {REGISTERED_TOOLS_QUERY} from "./queries/registered-tools.js";
export {
    ACCOUNT_ACTIVITY_QUERY,
    backerBreadthQuery,
    HOLDINGS_QUERY,
    SHAPE_QUERY,
    TERM_BACKERS_QUERY,
    TERM_VALUE_QUERY,
    termActivityQuery,
} from "./queries/term-shape.js";
export {BY_URL_QUERY} from "./queries/tool-atom.js";
export {TOOL_LISTING_QUERY} from "./queries/tool-listing.js";
export {ATTESTED_TOOL_USAGE_QUERY, TOOL_USAGE_QUERY} from "./queries/tool-usage.js";
