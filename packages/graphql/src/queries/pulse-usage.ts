/**
 * What agents wrote about a set of tools: their `uses` edges, then what those edges were qualified
 * with (task 63, ADR `0135`). Two queries, because the second is keyed on the first's triple ids.
 */
export const PULSE_USES_QUERY = `query PulseUses($tools: [String!]!, $uses: String!, $limit: Int!) {
    triples(where: {object_id: {_in: $tools}, predicate_id: {_eq: $uses}}, limit: $limit) {
        term_id
        object_id
        creator_id
        created_at
        subject {
            term_id
            label
        }
        positions(where: {shares: {_gt: "0"}}) {
            account_id
        }
    }
}`;

/**
 * `positions` asks only for the declarers: the index caps a nested list at 100 with no order and no sign
 * of the cut (`intuition-integrator`, task 66), so asking for all of them could miss the one that matters.
 */
export const PULSE_QUALIFIERS_QUERY = `query PulseQualifiers($edges: [String!]!, $predicates: [String!]!, $writers: [String!]!, $limit: Int!) {
    triples(where: {subject_id: {_in: $edges}, predicate_id: {_in: $predicates}}, limit: $limit) {
        term_id
        subject_id
        predicate_id
        creator_id
        created_at
        object {
            label
        }
        positions(where: {shares: {_gt: "0"}, account_id: {_in: $writers}}) {
            account_id
        }
    }
}`;

/** Which of these atom URIs exist, in one query. A tool's URI is computed locally from its URL. */
export const PULSE_ATOMS_QUERY = `query PulseAtoms($uris: [String!]!, $limit: Int!) {
    atoms(where: {data: {_in: $uris}}, limit: $limit) {
        term_id
        data
    }
}`;

/** The `uses` edges qualified with these domains. Their tools come from `PULSE_EDGE_TOOLS_QUERY`. */
export const PULSE_DOMAIN_EDGES_QUERY = `query PulseDomainEdges($domains: [String!]!, $predicate: String!, $limit: Int!) {
    triples(where: {predicate_id: {_eq: $predicate}, object: {label: {_in: $domains}}}, limit: $limit) {
        subject_id
    }
}`;

export const PULSE_EDGE_TOOLS_QUERY = `query PulseEdgeTools($edges: [String!]!, $uses: String!, $limit: Int!) {
    triples(where: {term_id: {_in: $edges}, predicate_id: {_eq: $uses}}, limit: $limit) {
        object {
            term_id
            label
            data
        }
    }
}`;

/** Who wrote these `uses` edges. Any other wallet has to hold a position on one to write a line on it (ADR `0138`). */
export const PULSE_EDGE_WRITERS_QUERY = `query PulseEdgeWriters($edges: [String!]!, $limit: Int!) {
    triples(where: {term_id: {_in: $edges}}, limit: $limit) {
        term_id
        creator_id
    }
}`;
