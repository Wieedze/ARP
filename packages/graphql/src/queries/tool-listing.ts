/**
 * The `uses` edges `/tools` is built on, with what stands behind each and who sent each deposit.
 *
 * **Two documents, one shape.** The sponsored one adds a `sponsored` count filtered on `sender_id` and
 * `receiver_id`, and the other leaves it out rather than passing a null sender: Intuition's indexer rejects a null
 * `_eq` with `validation-failed` (probed on testnet 13579, 2026-10-30), and a filter that silently
 * matched everything would count every deposit as the sponsor's.
 *
 * **`_ilike`, not `_eq`, on the sender.** The indexer stores `sender_id` checksummed, and `_eq` is
 * case-sensitive: the same deposit counts 1 under `_ilike` and 0 under `_eq` with the address
 * lowercased (testnet 13579, 2026-10-30). The caller validates the address as 40 hex digits, so the
 * pattern carries no wildcard and matches exactly one string, whatever its case.
 *
 * **A deposit the sponsor made to itself does not count.** Creating a term gives its creator the first
 * position, so a triple the service creates carries one such deposit, in nobody's name. The position
 * that counts has the agent as receiver (ADR `0110`, ADR `0143`).
 *
 * **Deposits on the support term only, on every curve.** A deposit on the counter-triple is
 * opposition, not a use. The counts are of events, not amounts, so reading across curves adds no
 * two markets together.
 */
function toolListingQuery(sponsored: boolean): string {
    const variables = sponsored
        ? "$uses: String!, $sameAs: String!, $curveId: numeric!, $limit: Int!, $sponsor: String!"
        : "$uses: String!, $sameAs: String!, $curveId: numeric!, $limit: Int!";
    const sponsoredCount = sponsored
        ? `
      sponsored: deposits_aggregate(where: {sender_id: {_ilike: $sponsor}, receiver_id: {_nilike: $sponsor}}) { aggregate { count } }`
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
      deposits: deposits_aggregate { aggregate { count } }${sponsoredCount}
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

/** The listing with a sponsoring address, passed as `$sponsor`: what it sends to another wallet counts as `sponsored`. */
export const TOOL_LISTING_SPONSORED_QUERY = toolListingQuery(true);

/**
 * Every wallet the sponsor deposited for on a `uses` edge, across all tools. A separate top-level read with `_eq` on the
 * checksummed address: selecting them inside {@link TOOL_LISTING_SPONSORED_QUERY} with `_ilike` did not
 * answer in 40s, where this answers in under a second (testnet 13579, 2026-11-05).
 */
export const SPONSORED_WALLETS_QUERY = `
query SponsoredWallets($uses: String!, $sponsor: String!, $limit: Int!) {
  deposits(
    where: {sender_id: {_eq: $sponsor}, receiver_id: {_neq: $sponsor}, term: {triple: {predicate_id: {_eq: $uses}}}}
    distinct_on: [term_id, receiver_id]
    limit: $limit
  ) { term_id receiver_id }
}`;

/** What the sponsor deposited on one tool, wallet by wallet. The same edges `/tools` counts for that tool. */
export const TOOL_WALLETS_QUERY = `
query ToolWallets($uses: String!, $sameAs: String!, $atomId: String!, $sponsor: String!, $limit: Int!) {
  deposits(
    where: {
      sender_id: {_eq: $sponsor}
      receiver_id: {_neq: $sponsor}
      term: {triple: {
        predicate_id: {_eq: $uses}
        object_id: {_eq: $atomId}
        subject: {as_subject_triples: {predicate_id: {_eq: $sameAs}}}
      }}
    }
    order_by: {created_at: asc}
    limit: $limit
  ) { receiver_id assets_after_fees }
}`;
