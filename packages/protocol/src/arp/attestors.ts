/**
 * The addresses whose positions are ARP's domain index (task 59, decision A of 2026-11-03, ADR
 * `0124`). The tree and the tags are permissionless to write, so the index is a reading of these
 * filings and nobody else's.
 *
 * Two since task 59: the key that filed the first 21 categories and 601 tags, and the sponsor's
 * treasury, which files the categories agents and people propose. Both are ARP's own. Checksummed,
 * because the indexer's `positions.account_id` is and a lowercase filter matches nothing.
 */
export const ARP_DOMAIN_ATTESTORS = [
    "0x906f3A52ec089f8D4E9127F91C6bE5Ae0d18f91f",
    "0xE596096F4176b682E300d73963e7B04B383C1AA1",
] as const;
