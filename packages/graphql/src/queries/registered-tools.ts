/**
 * **The indexer caps this query at 250 rows**, whatever `limit` asks for, so the whole set is read
 * page by page and `offset` is not optional.
 *
 * Measured on testnet 13579, 2026-10-29: `limit: 500` returns 250, `limit: 250` returns 250. The
 * cap is per table — the same indexer caps `positions` at **100** — so neither number may be reused
 * for the other query without measuring it.
 *
 * Reading one page was not merely incomplete, it was **wrong about its own ordering**: 716 atoms
 * carried the description and the sort ran over the arbitrary 250 the indexer returned first, under
 * a heading that says "by conviction". A prefix sorted is not a ranking.
 */
export const REGISTERED_TOOLS_QUERY = `
query RegisteredTools($description: String!, $uses: String!, $sameAs: String!, $curveId: numeric!, $limit: Int!, $offset: Int!) {
  atoms(
    where: {value: {thing: {description: {_eq: $description}}}}
    limit: $limit
    offset: $offset
    order_by: {term_id: asc}
  ) {
    term_id
    label
    data
    value { thing { url } }
    term {
      vaults(where: {curve_id: {_eq: $curveId}}, limit: 1) { position_count total_assets }
    }
    as_object_triples_aggregate(
      where: {
        predicate_id: {_eq: $uses}
        subject: {as_subject_triples: {predicate_id: {_eq: $sameAs}}}
      }
    ) { aggregate { count } }
  }
}`;
