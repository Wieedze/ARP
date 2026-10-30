export const SHAPE_QUERY = `
query TermShape($termId: String!, $curveId: numeric!, $limit: Int!) {
  agg: positions_aggregate(where: {term_id: {_eq: $termId}, curve_id: {_eq: $curveId}}) {
    aggregate { count sum { shares } }
  }
  first: positions(
    where: {term_id: {_eq: $termId}, curve_id: {_eq: $curveId}}
    order_by: {created_at: asc}
    limit: 1
  ) { created_at }
  last: positions(
    where: {term_id: {_eq: $termId}, curve_id: {_eq: $curveId}}
    order_by: {created_at: desc}
    limit: 1
  ) { created_at }
  backers: positions(
    where: {term_id: {_eq: $termId}, curve_id: {_eq: $curveId}}
    order_by: {shares: desc}
    limit: $limit
  ) { account_id shares }
}`;

export const HOLDINGS_QUERY = `
query AccountHoldings($account: String!, $curveId: numeric!) {
  held: positions_aggregate(where: {account_id: {_eq: $account}, curve_id: {_eq: $curveId}}) {
    aggregate { count(columns: term_id, distinct: true) sum { shares } }
  }
  deposited: deposits_aggregate(where: {receiver_id: {_eq: $account}, curve_id: {_eq: $curveId}}) {
    aggregate { sum { assets_after_fees } }
  }
  redeemed: redemptions_aggregate(where: {receiver_id: {_eq: $account}, curve_id: {_eq: $curveId}}) {
    aggregate { sum { assets } }
  }
  onAtoms: deposits_aggregate(
    where: {receiver_id: {_eq: $account}, curve_id: {_eq: $curveId}, vault_type: {_eq: "Atom"}}
  ) { aggregate { count } }
  onTriples: deposits_aggregate(
    where: {receiver_id: {_eq: $account}, curve_id: {_eq: $curveId}, vault_type: {_eq: "Triple"}}
  ) { aggregate { count } }
}`;

export const ACCOUNT_ACTIVITY_QUERY = `
query AccountActivity($account: String!, $curveId: numeric!, $limit: Int!) {
  deposits(
    where: {receiver_id: {_eq: $account}, curve_id: {_eq: $curveId}}
    order_by: {created_at: desc}
    limit: $limit
  ) { created_at assets_after_fees }
  redemptions(
    where: {receiver_id: {_eq: $account}, curve_id: {_eq: $curveId}}
    order_by: {created_at: desc}
    limit: $limit
  ) { created_at assets }
  allDeposited: deposits_aggregate(where: {receiver_id: {_eq: $account}, curve_id: {_eq: $curveId}}) {
    aggregate { sum { assets_after_fees } }
  }
  allRedeemed: redemptions_aggregate(where: {receiver_id: {_eq: $account}, curve_id: {_eq: $curveId}}) {
    aggregate { sum { assets } }
  }
}`;

export const TERM_VALUE_QUERY = `query TermValue($termId: String!, $curveId: numeric!, $limit: Int!) {
  signals(
    where: {term_id: {_eq: $termId}, curve_id: {_eq: $curveId}}
    order_by: {created_at: asc}
    limit: $limit
  ) { created_at delta deposit_id redemption_id }
}`;

export const TERM_BACKERS_QUERY = `query TermBackers($termId: String!, $curveId: numeric!, $limit: Int!) {
  positions(
    where: {term_id: {_eq: $termId}, curve_id: {_eq: $curveId}}
    order_by: {shares: desc}
    limit: $limit
  ) {
    shares
    created_at
    total_deposit_assets_after_total_fees
    total_redeem_assets_for_receiver
    account { id label atom_id }
  }
}`;

/** One alias per account, `a0` to `a{count - 1}`, each bound to a variable of the same name. */
export function backerBreadthQuery(count: number): string {
    const indexes = Array.from({length: count}, (_, index) => index);
    const fields = indexes
        .map(
            (index) =>
                `a${index}: positions_aggregate(where: {account_id: {_eq: $a${index}}}) { aggregate { count(columns: term_id, distinct: true) } }`,
        )
        .join("\n  ");
    const params = indexes.map((index) => `$a${index}: String!`).join(", ");
    return `query BackerBreadth(${params}) {\n  ${fields}\n}`;
}

/** `table` is one of the indexer's pre-bucketed `signal_stats_*` tables. */
export function termActivityQuery(table: string): string {
    return `query TermActivity($termId: String!, $curveId: numeric!, $limit: Int!) {
  rows: ${table}(
    where: {term_id: {_eq: $termId}, curve_id: {_eq: $curveId}}
    order_by: {bucket: desc}
    limit: $limit
  ) { bucket count volume }
}`;
}
