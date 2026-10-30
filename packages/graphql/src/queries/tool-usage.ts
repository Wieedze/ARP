const VAULT_SIDE = `
    total_market_cap
    total_assets
    vaults(where: {curve_id: {_eq: $curveId}}, limit: 1) {
      market_cap
      total_assets
      total_shares
      current_share_price
      position_count
    }`;

/**
 * Every `uses` edge pointing AT a tool, with both sides of each edge's market.
 *
 * `$curveId` is `numeric`, never `String!`. Declaring it `String!` is rejected at validation time
 * and takes the whole query down — the bug that broke the trust surface on 2026-09-16, which no
 * fixture could catch because a mocked transport proves the variable was passed and not that the
 * query was valid.
 */
export const TOOL_USAGE_QUERY = `
query ToolUsage($toolId: String!, $uses: String!, $curveId: numeric!) {
  tool: atoms(where: {term_id: {_eq: $toolId}}, limit: 1) {
    term_id
    label
    data
  }
  triples(where: {predicate_id: {_eq: $uses}, object_id: {_eq: $toolId}}, limit: 200) {
    term_id
    subject {
      term_id
      label
      type
    }
    term { ${VAULT_SIDE} }
    counter_term { ${VAULT_SIDE} }
  }
}`;

/**
 * The same read, narrowed to edges one account vouches for (ADR 0034).
 *
 * `positions` carries `account_id` beside `term_id`, so the narrowing is a `where` clause rather
 * than a second pass — and `transaction_hash` comes back with it, so every surviving row reproduces
 * from the chain.
 */
export const ATTESTED_TOOL_USAGE_QUERY = `
query AttestedToolUsage($toolId: String!, $uses: String!, $curveId: numeric!, $attestor: String!) {
  tool: atoms(where: {term_id: {_eq: $toolId}}, limit: 1) {
    term_id
    label
    data
  }
  triples(where: {
    predicate_id: {_eq: $uses},
    object_id: {_eq: $toolId},
    term: {positions: {account_id: {_eq: $attestor}}}
  }, limit: 200) {
    term_id
    subject {
      term_id
      label
      type
    }
    term { ${VAULT_SIDE} }
    counter_term { ${VAULT_SIDE} }
  }
}`;
