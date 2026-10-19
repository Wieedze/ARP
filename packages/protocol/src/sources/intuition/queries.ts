/**
 * The four reads this source performs.
 *
 * All filter on `subject_id` / `predicate_id`, never on a label. Market fields
 * are selected explicitly because the indexer returns none of them by default —
 * the omission is silent, so forgetting the selection would produce a profile
 * that reports no stake anywhere.
 */

const THING = `value { thing { name description image url } }`;

/**
 * Both market sides, for one bonding curve.
 *
 * The curve is a `$curveId` variable rather than a literal because
 * `defaultCurveId` is governance-configurable on the MultiVault — ARP's write
 * path reads it from `getBondingCurveConfig()` on every deposit and never
 * assumes it. If this fragment pinned curve 1 while a deposit went to another,
 * the panel would show one curve's market beside a position in a different
 * vault, with nothing to signal the mismatch.
 *
 * The variable is declared `numeric!`, which is the Hasura scalar `curve_id`
 * actually has. A literal coerces from a string; a *variable* does not, so
 * declaring it `String!` is rejected at validation time and takes the whole
 * trust surface down. Fixtures cannot catch that — only the live smoke test
 * can, which is why it exists.
 */
const MARKET_SIDE = `
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
query AgentTrustSurface($subjectId: String!, $predicateIds: [String!], $curveId: numeric!) {
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

/**
 * How many `same as` edges one cohort row reads before it stops counting.
 *
 * Almost every agent atom carries exactly one. Some carry a second that is not
 * an ERC-8004 identity at all — Clawnch also declares `did:web:clawn.ch` — and
 * at least one atom, `Ouro Proof-of-Compute Oracle`, claims sixteen ERC-8004
 * token ids from a single atom. A sample plus a count is enough to tell those
 * three cases apart without paging every edge of every row.
 */
export const IDENTITY_SAMPLE_LIMIT = 4;

/**
 * The cohort: every agent the ERC-8004 mirror knows about.
 *
 * Membership is `implement` → `ERC-8004`, by term id on both ends. The total
 * comes from an aggregate over the same filter, so the number the UI shows is
 * the graph's own count rather than a figure typed into a component.
 *
 * `order_by` is a variable so this file holds one query text instead of one per
 * sort order, but the orders themselves are frozen in {@link COHORT_ORDER_BY} —
 * nothing here builds an order clause out of caller input. Both orders end in
 * `subject_id: asc`: the first key ties across thousands of rows (the mirrored
 * shell gives every agent exactly five statements), and an unbroken tie makes
 * offset pagination non-deterministic, which would drop and repeat agents
 * between pages.
 *
 * `total_market_cap` on `term` is the sum across every bonding curve, so the
 * position count beside it is read the same way — `vaults_aggregate` over all
 * curves — rather than from one curve's vault. Mixing the two scopes is how you
 * end up printing "6.34 TRUST · 0 positions" for an agent whose stake is real
 * and simply sits on curve 2.
 */
export const COHORT_QUERY = `
query AgentCohort($predicateId: String!, $objectId: String!, $sameAsPredicateId: String!, $orderBy: [triples_order_by!]!, $limit: Int!, $offset: Int!) {
  total: triples_aggregate(
    where: {predicate_id: {_eq: $predicateId}, object_id: {_eq: $objectId}}
  ) {
    aggregate { count }
  }
  triples(
    where: {predicate_id: {_eq: $predicateId}, object_id: {_eq: $objectId}}
    order_by: $orderBy
    limit: $limit
    offset: $offset
  ) {
    subject {
      term_id
      label
      ${THING}
      as_subject_triples_aggregate { aggregate { count } }
      term {
        total_market_cap
        vaults_aggregate { aggregate { count sum { position_count } } }
      }
      identityCount: as_subject_triples_aggregate(
        where: {predicate_id: {_eq: $sameAsPredicateId}}
      ) {
        aggregate { count }
      }
      identity: as_subject_triples(
        where: {predicate_id: {_eq: $sameAsPredicateId}}
        limit: ${IDENTITY_SAMPLE_LIMIT}
      ) {
        object { label ${THING} }
      }
    }
  }
}`;

/**
 * The two orders the cohort can be read in, frozen.
 *
 * Both rank by what cost something to produce. There is deliberately no order
 * by score: a score is the costless signal this package exists to qualify, and
 * one descending score column would undo that in a single control.
 *
 *   - `evidence-quantity` — how many statements exist about the agent. The
 *     mirrored shell is a uniform five, so anything above that is a human or a
 *     provider having bothered.
 *   - `economic-conviction` — what is staked on the agent's own atom.
 */
export const COHORT_ORDER_BY = {
    "evidence-quantity": [
        {subject: {as_subject_triples_aggregate: {count: "desc"}}},
        {subject_id: "asc"},
    ],
    "economic-conviction": [{subject: {term: {total_market_cap: "desc"}}}, {subject_id: "asc"}],
} as const;
