/** Who are the `has trust provider` objects on mainnet — and is the edge a provider slot?
 *
 *  The evidence for ADR `0046`. The canonical four-triple pattern (`docs/07`) is permissionless, so
 *  nothing structurally stops one agent from becoming a trust provider for another. The question is
 *  what the edge *means to a reader today*, which is a measurement and not a reading of the guide.
 *  ADR `0030` is the precedent for getting this wrong: `use` was chosen on publication instead of
 *  meaning, and 21 triples are stranded permanently on a predicate ARP minted and abandoned.
 *
 *      bun run scripts/measure-trust-provider-objects.ts            # mainnet 1155
 *      bun run scripts/measure-trust-provider-objects.ts testnet    # 13579
 *
 *  Read-only: paginated GraphQL. Signs nothing, needs no key.
 */
import {
  HAS_TRUST_ASSESSMENT,
  HAS_TRUST_PROVIDER,
} from '../packages/protocol/src/sources/intuition/terms';

const TARGETS = {
  mainnet: { label: 'Intuition mainnet 1155', url: 'https://mainnet.intuition.sh/v1/graphql' },
  testnet: { label: 'Intuition testnet 13579', url: 'https://testnet.intuition.sh/v1/graphql' },
} as const;

const which = (process.argv[2] ?? 'mainnet') as keyof typeof TARGETS;
const target = TARGETS[which];
if (!target) {
  console.error('usage: bun run scripts/measure-trust-provider-objects.ts [mainnet|testnet]');
  process.exit(1);
}

/** Distinct objects in one request instead of paginating every edge — the endpoint rate-limits, and
 *  `tasks/17` makes courtesy on a third-party host a hard requirement, not a preference. */
const DISTINCT = `query ($pid: String!) {
  triples(where: { predicate_id: { _eq: $pid } }, distinct_on: [object_id], limit: 500) {
    object_id
    object { label type }
  }
}`;

const TOTAL = `query ($pid: String!) {
  triples_aggregate(where: { predicate_id: { _eq: $pid } }) { aggregate { count } }
}`;

const PER_OBJECT = `query ($pid: String!, $oid: String!) {
  triples_aggregate(
    where: { predicate_id: { _eq: $pid }, object_id: { _eq: $oid } }
  ) { aggregate { count } }
}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One request, with backoff on 429. Never more than four attempts; a rate limit is the host saying
 *  slow down, so the answer is to wait, not to retry harder. */
async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(target.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'arp-measure/1.0' },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get('retry-after') ?? 0) * 1000 || 2000 * 2 ** attempt;
      console.error(`  429 — attente ${wait}ms`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`${target.url} → HTTP ${res.status}`);
    const json = (await res.json()) as { data?: T; errors?: unknown };
    if (json.errors || !json.data) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);
    return json.data;
  }
}

console.log(`${target.label} — ${new Date().toISOString().slice(0, 10)}`);

for (const [name, pid, histogram] of [
  ['has trust provider', HAS_TRUST_PROVIDER, true],
  // One assessment source per agent-provider pair, so its objects carry ~1 edge each: the distinct
  // count is the shape, and a per-object loop would be hundreds of requests for nothing. It
  // rate-limited the host once. `tasks/17` makes courtesy a hard requirement.
  ['has trust assessment', HAS_TRUST_ASSESSMENT, false],
] as const) {
  const total = (await gql<{ triples_aggregate: { aggregate: { count: number } } }>(TOTAL, { pid }))
    .triples_aggregate.aggregate.count;
  await sleep(400);

  const { triples } = await gql<{
    triples: { object_id: string; object: { label: string; type: string } | null }[];
  }>(DISTINCT, { pid });

  console.log(`\n=== ${name} — ${total} edges, ${triples.length} distinct objects ===`);
  if (!histogram) continue;
  const rows: [string, number][] = [];
  for (const t of triples) {
    await sleep(400);
    const n = (
      await gql<{ triples_aggregate: { aggregate: { count: number } } }>(PER_OBJECT, {
        pid,
        oid: t.object_id,
      })
    ).triples_aggregate.aggregate.count;
    rows.push([`${t.object?.label ?? '<null>'} [${t.object?.type ?? '?'}]`, n]);
  }
  for (const [label, n] of rows.sort((a, b) => b[1] - a[1])) {
    console.log(
      `  ${String(n).padStart(6)}  ${((n / total) * 100).toFixed(2).padStart(6)}%  ${label}`,
    );
  }
}
