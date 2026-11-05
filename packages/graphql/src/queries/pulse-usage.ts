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
    }
}`;

export const PULSE_QUALIFIERS_QUERY = `query PulseQualifiers($edges: [String!]!, $predicates: [String!]!, $limit: Int!) {
    triples(where: {subject_id: {_in: $edges}, predicate_id: {_in: $predicates}}, limit: $limit) {
        term_id
        subject_id
        predicate_id
        creator_id
        created_at
        object {
            label
        }
        positions(where: {shares: {_gt: "0"}}) {
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
