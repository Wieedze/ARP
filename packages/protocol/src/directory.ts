import {
    createGraphqlTransport,
    DEFAULT_TIMEOUT_MS,
    defaultFetch,
    type FetchLike,
    type GraphqlTransport,
    isRecord,
    readRecord,
    readString,
} from "@arp-protocol/graphql";

import {
    bindingFromDocument,
    verifyEndpointBinding,
    type BindingVerdict,
    type EndpointBinding,
    type HandshakeChain,
} from "./handshake.js";
import {IPFS_GATEWAY} from "./verify/probe.js";

/**
 * The directory's read (task 39d): an agent's endpoint, from the binding on Intuition, checked
 * against the registry. The call then goes agent to agent; ARP never relays it (ADR `0094`).
 *
 * Every `has endpoint` claim on the agent's atom is returned, each with what its attached proof
 * says. Only a `bound` one is an endpoint the token's current owner signed for. An endpoint with no
 * proof is still listed, as `unproven`: anybody can write a triple, and hiding it would make this
 * read disagree with the graph without saying why.
 *
 * The two queries live here rather than in `@arp-protocol/graphql`, which keeps every other query
 * document: ADR `0095` says why.
 */
const BINDINGS_QUERY = `query EndpointBindings($subject: String!, $hasEndpoint: String!, $limit: Int!) {
  triples(
    where: {subject_id: {_eq: $subject}, predicate_id: {_eq: $hasEndpoint}}
    order_by: {created_at: desc}
    limit: $limit
  ) {
    term_id
    created_at
    object { term_id data label }
  }
}`;

/** `object_id`, not `object { … }`: the object is a triple, and a nested position resolves `null`. */
const CONTEXTS_QUERY = `query EndpointProofs($triples: [String!]!, $inContextOf: String!) {
  triples(where: {predicate_id: {_eq: $inContextOf}, object_id: {_in: $triples}}, limit: 100) {
    object_id
    subject { term_id data }
  }
}`;

export type DirectoryConfig = {
    graphqlUrl: string;
    predicates: {hasEndpoint: string; inContextOf: string};
    /** The registry reads each proof is checked against. */
    chain: HandshakeChain;
    fetch?: FetchLike;
    transport?: GraphqlTransport;
    timeoutMs?: number;
    /** How a pinned document is read. Defaults to the public gateway over `fetch`. */
    fetchDocument?: (uri: string) => Promise<unknown>;
    /** How many `has endpoint` claims to read. */
    limit?: number;
};

export type EndpointProof =
    | (BindingVerdict & {document: string; binding: EndpointBinding})
    | {status: "unreadable"; document: string; reason: string};

export type ListedEndpoint = {
    endpoint: string;
    tripleId: string;
    createdAt: string | null;
    /** The best proof attached, or `unproven` when none is. */
    status: "bound" | "transferred" | "unknown" | "unproven";
    proofs: EndpointProof[];
};

const RANK = {bound: 0, transferred: 1, unknown: 2, unproven: 3} as const;

function gatewayFetch(fetchLike: FetchLike, timeoutMs: number): (uri: string) => Promise<unknown> {
    return async (uri) => {
        if (!uri.startsWith("ipfs://")) throw new Error(`not an ipfs:// document: ${uri}`);
        const response = await fetchLike(`${IPFS_GATEWAY}${uri.slice("ipfs://".length)}`, {
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) throw new Error(`gateway answered ${response.status}`);
        return response.json();
    };
}

/** Every endpoint claimed for `agentAtom`, with the verdict of each proof attached to it. */
export async function getAgentEndpoints(
    agentAtom: string,
    config: DirectoryConfig,
): Promise<ListedEndpoint[]> {
    const fetchLike = config.fetch ?? defaultFetch();
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const transport =
        config.transport ??
        createGraphqlTransport({url: config.graphqlUrl, fetch: fetchLike, timeoutMs});
    const fetchDocument = config.fetchDocument ?? gatewayFetch(fetchLike, timeoutMs);

    const data = await transport.request(BINDINGS_QUERY, {
        subject: agentAtom,
        hasEndpoint: config.predicates.hasEndpoint,
        limit: config.limit ?? 10,
    });
    const claims: {endpoint: string; tripleId: string; createdAt: string | null}[] = [];
    for (const row of Array.isArray(data["triples"]) ? data["triples"] : []) {
        if (!isRecord(row)) continue;
        const tripleId = readString(row, "term_id");
        const object = readRecord(row, "object");
        // The atom's data is the endpoint string itself (`prepareEndpointBinding`).
        const endpoint =
            object === null ? null : (readString(object, "data") ?? readString(object, "label"));
        if (tripleId === null || endpoint === null) continue;
        claims.push({endpoint, tripleId, createdAt: readString(row, "created_at")});
    }
    if (claims.length === 0) return [];

    const contexts = await transport.request(CONTEXTS_QUERY, {
        triples: claims.map((claim) => claim.tripleId),
        inContextOf: config.predicates.inContextOf,
    });
    const documents = new Map<string, string[]>();
    for (const row of Array.isArray(contexts["triples"]) ? contexts["triples"] : []) {
        if (!isRecord(row)) continue;
        const objectId = readString(row, "object_id");
        const subject = readRecord(row, "subject");
        const uri = subject === null ? null : readString(subject, "data");
        if (objectId === null || uri === null) continue;
        const key = objectId.toLowerCase();
        documents.set(key, [...(documents.get(key) ?? []), uri]);
    }

    return Promise.all(
        claims.map(async (claim): Promise<ListedEndpoint> => {
            const uris = documents.get(claim.tripleId.toLowerCase()) ?? [];
            const proofs = await Promise.all(
                uris.map((uri) => checkProof(uri, claim.endpoint, fetchDocument, config.chain)),
            );
            let status: ListedEndpoint["status"] = "unproven";
            for (const proof of proofs) {
                if (
                    proof.status === "bound" ||
                    proof.status === "transferred" ||
                    proof.status === "unknown"
                ) {
                    if (RANK[proof.status] < RANK[status]) status = proof.status;
                }
            }
            return {...claim, status, proofs};
        }),
    );
}

async function checkProof(
    uri: string,
    endpoint: string,
    fetchDocument: (uri: string) => Promise<unknown>,
    chain: HandshakeChain,
): Promise<EndpointProof> {
    let document: unknown;
    try {
        document = await fetchDocument(uri);
    } catch (error) {
        return {
            status: "unreadable",
            document: uri,
            reason: error instanceof Error ? error.message : String(error),
        };
    }
    const binding = bindingFromDocument(document);
    if (binding === null)
        return {status: "unreadable", document: uri, reason: "not a binding document"};
    // A valid binding for a different endpoint, attached to this claim, proves nothing about it.
    if (binding.endpoint !== endpoint) {
        return {
            status: "invalid",
            reason: "the document binds another endpoint",
            document: uri,
            binding,
        };
    }
    return {...(await verifyEndpointBinding(binding, chain)), document: uri, binding};
}

/** The endpoint to call: the newest one the token's current owner signed for, or `null`. */
export async function resolveAgentEndpoint(
    agentAtom: string,
    config: DirectoryConfig,
): Promise<string | null> {
    const listed = await getAgentEndpoints(agentAtom, config);
    return listed.find((entry) => entry.status === "bound")?.endpoint ?? null;
}
