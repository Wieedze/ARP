/** Does "how many terms does this staker hold?" tell a real account from a bot?
 *
 *      bun run scripts/measure/staker-concentration.ts            # mainnet 1155
 *      bun run scripts/measure/staker-concentration.ts testnet    # 13579
 *
 *  The question behind it, in the user's words: _« si on voit que tu n'as aucune position ou très
 *  peu, sur 1 outil une fois, et que cet outil n'a que des votes de comptes qui n'ont qu'un seul
 *  vote, c'est probablement des bots »_. The point is not to forbid a sybil but to make sure it is
 *  **not rewarded** — and that needs the discriminator to actually discriminate.
 *
 *  It is only useful if the distribution has a shape. If nearly every account holds one position,
 *  the test flags everybody and says nothing; if there is a cliff, it separates a participant from
 *  a throwaway address.
 *
 *  **No weight is computed here and none should be.** `docs/12` lists "ARP should weight sentiment by
 *  staker track record" as a drift signal — "interesting, and not this. It has no falsifiable
 *  subject" — and ADR `0046` says ARP publishes no score. What this measures is whether the *reader*
 *  can be handed the dimension and left to judge, which is a different thing from ARP ranking on it.
 *
 *  **Measured on mainnet 1155, 2026-10-21, and it discriminates.** 3,510,272 positions across
 *  222,812 accounts and 532,578 terms — **15.8 positions per account on average**, so repeat
 *  participation is the norm on this graph, which is what makes "holds only this one" informative.
 *  On the busiest term, of 100 backers read:
 *
 *  | backers holding ≥ N distinct terms | |
 *  | --- | --- |
 *  | ≥ 2 | 99% |
 *  | ≥ 10 | 94% |
 *  | ≥ 50 | 46% |
 *  | **only this one** | **1 of 100** |
 *
 *  A real claim's backers are repeat participants almost to a one. A sybil-backed claim is the
 *  inverse shape, and it is visible without forbidding anything — which is the point: the goal is
 *  not to prevent a sybil but to make sure it is **not rewarded**.
 *
 *  **Shippable in a UI**: the per-backer aggregates batch into one request as aliased fields
 *  (`a0:`, `a1:`, …), verified against mainnet. One request for the holders, one for their breadth.
 *  Done serially, as this script does, it takes a 429 every few calls.
 *
 *  Read-only: aggregates over the indexer's `positions` table, which carries `account_id`,
 *  `term_id`, `shares` and `curve_id` per row. The table caps at **100 rows per page** — probed;
 *  `limit: 250` also returns 100, silently, where `atoms` and `triples` cap at 250. Signs nothing,
 *  needs no key.
 */
const TARGETS = {
  mainnet: { label: 'Intuition mainnet 1155', url: 'https://mainnet.intuition.sh/v1/graphql' },
  testnet: { label: 'Intuition testnet 13579', url: 'https://testnet.intuition.sh/v1/graphql' },
} as const;

const which = (process.argv[2] ?? 'mainnet') as keyof typeof TARGETS;
const target = TARGETS[which];
if (!target) {
  console.error('usage: bun run scripts/measure/staker-concentration.ts [mainnet|testnet]');
  process.exit(1);
}

const SPACING_MS = 400;

async function query(body: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await fetch(target.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'arp-measure/1.0' },
      body,
      signal: AbortSignal.timeout(45_000),
    });
    if (res.status === 429) {
      const wait = 2000 * 2 ** attempt;
      console.error(`  429 — waiting ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`${target.url} → HTTP ${res.status}`);
    const json = (await res.json()) as { data?: Record<string, unknown>; errors?: unknown };
    if (json.errors || !json.data) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);
    return json.data;
  }
  throw new Error('gave up after five 429s');
}

const totals = await query(
  JSON.stringify({
    query: `query {
      positions: positions_aggregate { aggregate { count } }
      accounts: positions_aggregate { aggregate { count(columns: account_id, distinct: true) } }
      terms: positions_aggregate { aggregate { count(columns: term_id, distinct: true) } }
    }`,
  }),
);
const count = (key: string): number => {
  const node = totals[key] as { aggregate?: { count?: number } } | undefined;
  return node?.aggregate?.count ?? 0;
};

console.log(`${target.label} — ${new Date().toISOString().slice(0, 10)}`);
console.log(`  positions            ${count('positions')}`);
console.log(`  distinct accounts    ${count('accounts')}`);
console.log(`  distinct terms       ${count('terms')}`);
console.log(
  `  positions / account  ${(count('positions') / count('accounts')).toFixed(1)} on average`,
);
console.log('');

/**
 * The question asked **per term**, which is the shape the UI needs and is exact rather than sampled.
 *
 * Sampling the `positions` table was the first attempt and it was the wrong instrument: 3.5M rows,
 * and the table caps at **100 per page** (probed — `limit: 250` also returns 100, silently, like
 * `atoms` and `triples` cap at 250). A hundred rows says nothing about a distribution.
 *
 * Asked per term it is one query for the holders plus one aggregate per holder, and it answers the
 * thing a reader actually wants: **of the accounts backing this claim, how many hold a position on
 * anything else?** An account whose only position is this one is the shape the user described —
 * "no position, or very few, on one tool once" — and a claim backed entirely by such accounts is
 * the sybil made visible.
 */
const TERM = process.env.TERM_ID ?? null;
if (TERM === null) {
  console.log(
    "  Set TERM_ID=0x… to profile one claim's backers. Picking the busiest term instead.",
  );
}

const busiest = await query(
  JSON.stringify({
    query: `query { positions(limit: 1, order_by: {shares: desc}) { term_id } }`,
  }),
);
const termId = TERM ?? (busiest['positions'] as { term_id: string }[])[0]?.term_id ?? null;
if (termId === null) {
  console.error('no term to profile');
  process.exit(1);
}

const holders = await query(
  JSON.stringify({
    query: `query ($termId: String!, $limit: Int!) {
      positions(where: {term_id: {_eq: $termId}}, limit: $limit) { account_id shares }
    }`,
    variables: { termId, limit: 100 },
  }),
);
const rows = (holders['positions'] ?? []) as { account_id: string; shares: string }[];
console.log(`  term ${termId}`);
console.log(
  `  backers read          ${rows.length}${rows.length === 100 ? ' (page cap — more exist)' : ''}`,
);

/** For each backer: how many distinct terms do they hold a position on, anywhere on the graph? */
const breadth = new Map<string, number>();
for (const row of rows) {
  const data = await query(
    JSON.stringify({
      query: `query ($account: String!) {
        positions_aggregate(where: {account_id: {_eq: $account}}) {
          aggregate { count(columns: term_id, distinct: true) }
        }
      }`,
      variables: { account: row.account_id },
    }),
  );
  const node = data['positions_aggregate'] as { aggregate?: { count?: number } } | undefined;
  breadth.set(row.account_id, node?.aggregate?.count ?? 0);
  await new Promise((r) => setTimeout(r, SPACING_MS));
}

const widths = [...breadth.values()];
const onlyHere = widths.filter((w) => w <= 1).length;
console.log('');
console.log('  of those backers, how many distinct terms each holds:');
for (const n of [1, 2, 3, 5, 10, 50]) {
  const at = widths.filter((w) => w >= n).length;
  const share = widths.length === 0 ? '0.0' : ((at / widths.length) * 100).toFixed(1);
  console.log(`    >= ${String(n).padStart(3)}   ${String(at).padStart(5)}   ${share}%`);
}
console.log('');
console.log(`  backers whose ONLY position is this one: ${onlyHere} of ${widths.length}`);
console.log(
  '  That ratio is the discriminator. A claim backed entirely by single-position accounts',
);
console.log(
  '  is the shape a sybil leaves; one backed by accounts that hold positions elsewhere is',
);
console.log('  not. Neither is forbidden and neither is scored — the reader is handed the number.');

// A module, not a global script. Without this TypeScript treats every top-level
// `const` here as sharing one scope with every other import-free file in `scripts/`,
// which produced 21 phantom redeclarations and 20 "await outside a module" errors the
// first time this directory was typechecked (`docs/tasks/21`). Bun already runs it as a module.
export {};
