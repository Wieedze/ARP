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
    parseAgentRegistry,
    type EndpointBinding,
    type HandshakeAgent,
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
 * **The caller names the agent, not only its atom.** A `has endpoint` claim and the `in context of`
 * that attaches a proof are both permissionless, so anybody can hang a valid binding for *their*
 * token under somebody else's atom. A proof counts only when the binding names the agent the caller
 * asked about; any other reads `invalid`. Without that, the newest bound claim — anybody's — would
 * be the endpoint a hirer pays (ADR `0095` §7).
 *
 * **What a third party can still do is deny, not divert.** The newest `limit` claims are read, and
 * at most `maxProofsPerClaim` proofs per claim, oldest first. Writing newer claims pushes a genuine
 * one out of the window; attaching junk to a claim before its genuine proof crowds the proof out.
 * Both cost the griefer fees and both end in `null`, never in their endpoint. The bound and its cost
 * are in ADR `0095` §7.
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

/**
 * `object_id`, not `object { … }`: the object is a triple, and a nested position resolves `null`.
 *
 * One query per claim, oldest first: junk attached after the genuine proof cannot push it out of
 * the window, and junk on one claim cannot crowd out another claim's proof. Junk attached before it
 * can — including between the owner's binding and context triples when they are sent as separate
 * transactions (ADR `0095` §7).
 */
const CONTEXTS_QUERY = `query EndpointProofs($triple: String!, $inContextOf: String!, $limit: Int!) {
  triples(
    where: {predicate_id: {_eq: $inContextOf}, object_id: {_eq: $triple}}
    order_by: {created_at: asc}
    limit: $limit
  ) {
    object_id
    subject { term_id data }
  }
}`;

/** The agent whose endpoints are read: its atom, where the claims hang, and who it is. */
export type DirectorySubject = HandshakeAgent & {agentAtom: string};

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
    /** How many `has endpoint` claims to read, newest first. */
    limit?: number;
    /**
     * How many proofs to check per claim, oldest first. Each one costs a document fetch and two
     * chain reads, so this bounds what a claim buried in junk can make the reader spend.
     */
    maxProofsPerClaim?: number;
};

export const DEFAULT_MAX_PROOFS_PER_CLAIM = 5;

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

type ParsedAgent = {chainId: number; registry: string; agentId: bigint};

function parseAgent(agent: HandshakeAgent): ParsedAgent | null {
    const registry = parseAgentRegistry(agent.agentRegistry);
    if (registry === null || !/^(0|[1-9][0-9]*)$/.test(agent.agentId)) return null;
    return {
        chainId: registry.chainId,
        registry: registry.registry.toLowerCase(),
        agentId: BigInt(agent.agentId),
    };
}

/** Whether two agent ids name the same token, whatever the registry address's case. */
export function isSameAgent(a: HandshakeAgent, b: HandshakeAgent): boolean {
    const left = parseAgent(a);
    const right = parseAgent(b);
    return (
        left !== null &&
        right !== null &&
        left.chainId === right.chainId &&
        left.registry === right.registry &&
        left.agentId === right.agentId
    );
}

/** Every endpoint claimed for the subject, with the verdict of each proof attached to it. */
export async function getAgentEndpoints(
    subject: DirectorySubject,
    config: DirectoryConfig,
): Promise<ListedEndpoint[]> {
    if (parseAgent(subject) === null) {
        throw new TypeError(
            `not an ERC-8004 agent id: ${subject.agentRegistry} / ${subject.agentId}`,
        );
    }
    const fetchLike = config.fetch ?? defaultFetch();
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const transport =
        config.transport ??
        createGraphqlTransport({url: config.graphqlUrl, fetch: fetchLike, timeoutMs});
    const fetchDocument = config.fetchDocument ?? gatewayFetch(fetchLike, timeoutMs);

    const data = await transport.request(BINDINGS_QUERY, {
        subject: subject.agentAtom,
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

    const maxProofs = config.maxProofsPerClaim ?? DEFAULT_MAX_PROOFS_PER_CLAIM;
    return Promise.all(
        claims.map(async (claim): Promise<ListedEndpoint> => {
            const contexts = await transport.request(CONTEXTS_QUERY, {
                triple: claim.tripleId,
                inContextOf: config.predicates.inContextOf,
                limit: maxProofs,
            });
            const uris: string[] = [];
            for (const row of Array.isArray(contexts["triples"]) ? contexts["triples"] : []) {
                if (!isRecord(row)) continue;
                const objectId = readString(row, "object_id");
                const document = readRecord(row, "subject");
                const uri = document === null ? null : readString(document, "data");
                if (objectId === null || uri === null) continue;
                if (objectId.toLowerCase() !== claim.tripleId.toLowerCase()) continue;
                uris.push(uri);
            }
            const proofs = await Promise.all(
                uris
                    .slice(0, maxProofs)
                    .map((uri) =>
                        checkProof(uri, subject, claim.endpoint, fetchDocument, config.chain),
                    ),
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
    agent: HandshakeAgent,
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
    // A valid binding for another agent, attached under this agent's atom, is the hijack: the
    // binding is genuine, the claim it hangs on is not its owner's.
    if (!isSameAgent(binding, agent)) {
        return {
            status: "invalid",
            reason: "the document binds another agent",
            document: uri,
            binding,
        };
    }
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
    subject: DirectorySubject,
    config: DirectoryConfig,
): Promise<string | null> {
    const listed = await getAgentEndpoints(subject, config);
    return listed.find((entry) => entry.status === "bound")?.endpoint ?? null;
}
