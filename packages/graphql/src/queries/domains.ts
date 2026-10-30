/**
 * **Our** tree: the hierarchy triples the attestor holds a position on.
 *
 * It starts from the positions, not from the predicate, and that inversion is the whole design
 * (the user, 2026-10-28): _« on crée ou on se positionne, et ça nous permet de faire le scope des
 * domaines existants dans ARP »_. Creating a term with `cost + minDeposit` gives the creator a
 * position, so **create and back are the same act** as far as the tree is concerned — and creating
 * with `cost` alone gives zero positions, so such a term is on the chain and not in the tree.
 *
 * Measured on testnet 13579, 2026-10-28: the predicate carries 60 triples, 18 of which carry an ARP
 * position. Reading from the positions returns those 18 and nothing else — no `governance`, no
 * `rehearsal`, no `motion design`, with no filtering logic at all. Reading from the predicate
 * returned all 60 and needed a rule to sort them out, which is the rule this replaces.
 *
 * It also scales with **our** tree rather than with the predicate's popularity, which is why it is
 * the default path and not an optimisation.
 *
 * **`shares > 0` is load-bearing, not hygiene.** Redeeming a position in full leaves the row behind
 * with `shares: "0"` rather than removing it — verified on testnet 13579 on 2026-10-28 immediately
 * after retiring `card-payment is a sub-domain of payment`. Without this clause the tree still
 * contained the triple whose position had just been redeemed, so the one mechanism that makes the
 * tree editable would have silently done nothing. Liquid-Demo's `attestorShares > 0n` is the same
 * check, one layer down.
 */
export const OUR_HIERARCHY_QUERY = `query($pid: String!, $who: String!, $limit: Int!, $offset: Int!) {
  positions(
    where: {
      account_id: {_eq: $who}
      shares: {_gt: "0"}
      term: {triple: {predicate_id: {_eq: $pid}}}
    }
    limit: $limit
    offset: $offset
    order_by: {id: asc}
  ) {
    shares
    term {
      triple {
        term_id
        subject { term_id data label }
        object { term_id data label }
      }
    }
  }
}`;

/** Every hierarchy triple on the chain, whoever published it. The unfiltered view, for showing a
 *  reader what else exists beside our reading — never for building the tree. */
export const ALL_HIERARCHY_QUERY = `query($pid: String!, $limit: Int!, $offset: Int!) {
  triples(where: {predicate_id: {_eq: $pid}}, limit: $limit, offset: $offset, order_by: {term_id: asc}) {
    term_id
    subject { term_id data label }
    object { term_id data label }
    term { vaults { position_count total_shares } }
  }
}`;

/**
 * **The indexer caps this at 250 rows** whatever `limit` asks for, so it is read page by page.
 *
 * Without `offset` this returned a prefix and said nothing: measured on testnet 13579, 2026-10-29,
 * ARP holds ~700 `has tag` positions, so a reader asking for the root got 250 of them and a tree
 * that silently lost two thirds of its leaves. `order_by: term_id` makes the paging stable —
 * without it two pages can repeat or skip a row and the caller cannot tell which.
 *
 * The cap is **per table**: the same indexer caps `positions` at 100. Neither number may be reused
 * for the other query without measuring it.
 */
export const TAGGED_QUERY = `query($pid: String!, $domains: [String!], $limit: Int!, $offset: Int!, $who: String!) {
  triples(
    where: {predicate_id: {_eq: $pid}, object: {data: {_in: $domains}}}
    limit: $limit
    offset: $offset
    order_by: {term_id: asc}
  ) {
    term_id
    subject { term_id label value { thing { url name } } }
    object { data }
    term {
      vaults {
        position_count
        total_shares
        positions(where: {account_id: {_eq: $who}, shares: {_gt: "0"}}) { shares }
      }
    }
  }
}`;
