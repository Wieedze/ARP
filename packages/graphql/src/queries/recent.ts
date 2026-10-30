export const RECENT_QUERY = `
query RecentDeclarations($uses: String!, $sameAs: String!, $limit: Int!) {
  triples(
    where: {
      predicate_id: {_eq: $uses}
      subject: {as_subject_triples: {predicate_id: {_eq: $sameAs}}}
    }
    order_by: {created_at: desc}
    limit: $limit
  ) {
    term_id
    created_at
    subject { term_id label }
    object { term_id label }
    term {
      total_assets
      vaults(where: {curve_id: {_eq: $curveId}}, limit: 1) { position_count }
    }
  }
}`;
