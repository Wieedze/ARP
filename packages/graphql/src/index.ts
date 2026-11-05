/**
 * `@arp-protocol/graphql` — the read layer under `@arp-protocol/core` (ADR `0082`).
 *
 * The HTTP transport, the GraphQL client over it, and every query document the protocol sends to
 * an Intuition indexer. It knows the Intuition schema and nothing about ARP: no term id, no
 * predicate, no chain. Every id a query filters on arrives as a variable, so the same document
 * runs against any network the caller points the transport at.
 */
export {
    DEFAULT_MAX_BODY_BYTES,
    DEFAULT_TIMEOUT_MS,
    defaultFetch,
    fetchTextWithTimeout,
    fetchWithTimeout,
    HttpError,
    isTimeoutError,
    readBodyText,
    type FetchLike,
    type ReadBodyOptions,
} from "./http.js";
export {
    isRecord,
    omitPath,
    readArray,
    readBigInt,
    readCount,
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
    AGENT_EDGE_LIMIT,
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
export {ATOM_LABELS_QUERY} from "./queries/atom-labels.js";
export {RECENT_QUERY, RECENT_STAKES_QUERY} from "./queries/recent.js";
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
export {TOOL_LISTING_QUERY, TOOL_LISTING_SPONSORED_QUERY} from "./queries/tool-listing.js";
export {AGENT_IDENTITIES_QUERY, ATTACHED_DOCUMENTS_QUERY, ENDPOINT_SUBJECTS_QUERY, IDENTITY_CLAIMS_QUERY, PULSE_ATOMS_QUERY, PULSE_DOMAIN_EDGES_QUERY, PULSE_EDGE_TOOLS_QUERY, PULSE_EDGE_WRITERS_QUERY, PULSE_QUALIFIERS_QUERY, PULSE_USES_QUERY} from "./queries/pulse-usage.js";
export {ATTESTED_TOOL_USAGE_QUERY, TOOL_USAGE_QUERY} from "./queries/tool-usage.js";
