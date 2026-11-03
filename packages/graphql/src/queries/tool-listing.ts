/**
 * The `uses` edges `/tools` is built on, with what stands behind each and who sent each deposit.
 *
 * **Two documents, one shape.** The sponsored one adds a `proven` count filtered on `sender_id`, and
 * the other leaves it out rather than passing a null sender: Intuition's indexer rejects a null
 * `_eq` with `validation-failed` (probed on testnet 13579, 2026-10-30), and a filter that silently
 * matched everything would count every deposit as proven.
 *
 * **`_ilike`, not `_eq`, on the sender.** The indexer stores `sender_id` checksummed, and `_eq` is
 * case-sensitive: the same deposit counts 1 under `_ilike` and 0 under `_eq` with the address
 * lowercased (testnet 13579, 2026-10-30). The caller validates the address as 40 hex digits, so the
 * pattern carries no wildcard and matches exactly one string, whatever its case.
 *
 * **Deposits on the support term only, on every curve.** A deposit on the counter-triple is
 * opposition, not a use. The counts are of events, not amounts, so reading across curves adds no
 * two markets together.
 */
function toolListingQuery(sponsored: boolean): string {
    const variables = sponsored
        ? "$uses: String!, $sameAs: String!, $curveId: numeric!, $limit: Int!, $sponsor: String!"
        : "$uses: String!, $sameAs: String!, $curveId: numeric!, $limit: Int!";
    const proven = sponsored
        ? `
      proven: deposits_aggregate(where: {sender_id: {_ilike: $sponsor}}) { aggregate { count } }`
        : "";
    return `
query ToolListing(${variables}) {
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
      deposits: deposits_aggregate { aggregate { count } }${proven}
    }
    counter_term {
      total_assets
      vaults(where: {curve_id: {_eq: $curveId}}, limit: 1) { position_count total_assets }
    }
  }
}`;
}

/** The listing with no sponsoring address configured: every deposit is `declared`. */
export const TOOL_LISTING_QUERY = toolListingQuery(false);

/** The listing with a sponsoring address, passed as `$sponsor`: its deposits are `proven`. */
export const TOOL_LISTING_SPONSORED_QUERY = toolListingQuery(true);
