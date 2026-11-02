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
    transaction_hash
    subject { term_id label }
    object { term_id label }
    term {
      total_assets
      vaults(where: {curve_id: {_eq: $curveId}}, limit: 1) { position_count }
    }
  }
}`;

/**
 * Deposits and redemptions on those same declarations, newest first. The subject filter is the one
 * `RECENT_QUERY` carries, for the same reason: a stake on `Optimism uses …` is not this protocol's.
 *
 * A deposit of zero is dropped here rather than after the read, so `limit` still bounds what a
 * reader sees: a triple's creation can log one, and it is nobody's position.
 *
 * `type: "Triple"` keeps only the claim's own vault. A counter term's `triple` resolves to the claim
 * it opposes, so without it a position against a declaration would read as support for it.
 */
export const RECENT_STAKES_QUERY = `
query RecentStakes($uses: String!, $sameAs: String!, $limit: Int!) {
  deposits(
    where: {
      term: {
        type: {_eq: "Triple"}
        triple: {predicate_id: {_eq: $uses}, subject: {as_subject_triples: {predicate_id: {_eq: $sameAs}}}}
      }
      assets_after_fees: {_gt: "0"}
    }
    order_by: {created_at: desc}
    limit: $limit
  ) {
    id
    created_at
    transaction_hash
    assets_after_fees
    sender_id
    receiver_id
    term { triple { term_id subject { term_id label } object { term_id label } } }
  }
  redemptions(
    where: {
      term: {
        type: {_eq: "Triple"}
        triple: {predicate_id: {_eq: $uses}, subject: {as_subject_triples: {predicate_id: {_eq: $sameAs}}}}
      }
    }
    order_by: {created_at: desc}
    limit: $limit
  ) {
    id
    created_at
    transaction_hash
    assets
    sender_id
    receiver_id
    term { triple { term_id subject { term_id label } object { term_id label } } }
  }
}`;
