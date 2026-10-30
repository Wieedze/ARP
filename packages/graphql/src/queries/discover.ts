export const FIND_AGENTS_QUERY = `
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
