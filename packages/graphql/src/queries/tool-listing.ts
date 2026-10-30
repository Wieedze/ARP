export const TOOL_LISTING_QUERY = `
query ToolListing($uses: String!, $sameAs: String!, $curveId: numeric!, $limit: Int!) {
  triples(
    where: {
      predicate_id: {_eq: $uses}
      subject: {as_subject_triples: {predicate_id: {_eq: $sameAs}}}
    }
    limit: $limit
  ) {
    term_id
    object {
      term_id
      label
      data
      type
      value { thing { url } }
    }
    term {
      total_assets
      vaults(where: {curve_id: {_eq: $curveId}}, limit: 1) { position_count total_assets }
    }
    counter_term {
      total_assets
      vaults(where: {curve_id: {_eq: $curveId}}, limit: 1) { position_count total_assets }
    }
  }
}`;
