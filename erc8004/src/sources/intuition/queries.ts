/**
 * The three reads this source performs.
 *
 * All filter on `subject_id` / `predicate_id`, never on a label. Market fields
 * are selected explicitly because the indexer returns none of them by default —
 * the omission is silent, so forgetting the selection would produce a profile
 * that reports no stake anywhere.
 */

const THING = `value { thing { name description image url } }`;

const MARKET_SIDE = `
    total_market_cap
    total_assets
    vaults(where: {curve_id: {_eq: "1"}}, limit: 1) {
      market_cap
      total_assets
      total_shares
      current_share_price
      position_count
    }`;

/**
 * Preflight. Matches the canonical `same as` predicate against the exact CAIP-19
 * string the identity object atom is named with.
 *
 * `limit: 2` rather than 1: a second row means two atoms claim to be the same
 * agent, which fragments that agent's staking surface. The caller reports it as
 * a conflict instead of quietly taking the first.
 */
export const RESOLVE_AGENT_QUERY = `
query ResolveAgentByCaip($sameAsPredicateId: String!, $caipId: String!) {
  triples(
    where: {
      predicate_id: {_eq: $sameAsPredicateId}
      object: {value: {thing: {name: {_eq: $caipId}}}}
    }
    limit: 2
  ) {
    subject { term_id label data ${THING} }
  }
}`;

export const TRUST_SURFACE_QUERY = `
query AgentTrustSurface($subjectId: String!, $predicateIds: [String!]) {
  triples(
    where: {subject_id: {_eq: $subjectId}, predicate_id: {_in: $predicateIds}}
    order_by: {term: {total_market_cap: desc}}
  ) {
    term_id
    predicate { term_id label }
    object { term_id label data ${THING} }
    term {${MARKET_SIDE}
    }
    counter_term {${MARKET_SIDE}
    }
  }
}`;

export const CAPABILITIES_QUERY = `
query AgentCapabilities($subjectId: String!, $predicateIds: [String!]) {
  triples(where: {subject_id: {_eq: $subjectId}, predicate_id: {_in: $predicateIds}}) {
    term_id
    predicate { term_id label }
    object { term_id label ${THING} }
  }
}`;
