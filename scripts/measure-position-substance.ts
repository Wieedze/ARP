/** At how many positions does an atom stop being a slot and start being a market?
 *
 *      bun run scripts/measure-position-substance.ts            # mainnet 1155
 *      bun run scripts/measure-position-substance.ts testnet    # 13579
 *
 *  The question behind it, in the user's words: _« les atomes créés ou existants c'est une chose,
 *  mais s'il y a 0 position dessus c'est comme s'il n'existait pas — ce qui compte c'est les
 *  positions pour faire corps »_. Right, and it needs a threshold, because "has a position" does not
 *  discriminate: measured 2026-10-20, **256,644 of 269,675** atoms on mainnet have at least one.
 *
 *  There is a cliff, and it is the finding. Between two positions and three the population drops
 *  **16×** — 121,129 to 7,656. So something systematic produced one or two positions on ~120,000
 *  atoms (a creator's own deposit, plus a bulk depositor leaving exactly `minDeposit`: the sampled
 *  atoms at that level are Wikipedia species articles holding 0.01 TRUST). **Three is where somebody
 *  independent shows up.**
 *
 *  By amount it lands in the same place: 170,152 atoms hold more than `minDeposit`, and 5,185 hold
 *  more than 1 TRUST.
 *
 *  So the graph with substance is on the order of **5,000 to 8,000 atoms — 2.8%** of what exists.
 *  A directory that lists atoms lists mostly empty slots.
 *
 *  Read-only: one aggregate per threshold. Signs nothing, needs no key.
 */
const TARGETS = {
  mainnet: { label: 'Intuition mainnet 1155', url: 'https://mainnet.intuition.sh/v1/graphql' },
  testnet: { label: 'Intuition testnet 13579', url: 'https://testnet.intuition.sh/v1/graphql' },
} as const;

const which = (process.argv[2] ?? 'mainnet') as keyof typeof TARGETS;
const target = TARGETS[which];
if (!target) {
  console.error('usage: bun run scripts/measure-position-substance.ts [mainnet|testnet]');
  process.exit(1);
}

async function count(where: string): Promise<number> {
  const res = await fetch(target.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'arp-measure/1.0' },
    body: JSON.stringify({
      query: `query { atoms_aggregate${where === '' ? '' : `(${where})`} { aggregate { count } } }`,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`${target.url} → HTTP ${res.status}`);
  const json = (await res.json()) as {
    data?: { atoms_aggregate: { aggregate: { count: number } } };
    errors?: unknown;
  };
  if (json.errors || !json.data) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data.atoms_aggregate.aggregate.count;
}

const positions = (n: number, op: '_eq' | '_gte') =>
  `where: {term: {vaults: {position_count: {${op}: ${n}}}}}`;
const assets = (wei: string) => `where: {term: {vaults: {total_assets: {_gt: "${wei}"}}}}`;

const total = await count('');
console.log(`${target.label} — ${new Date().toISOString().slice(0, 10)}`);
console.log(`\n${total.toLocaleString('en-US')} atoms in all.\n`);

console.log('by position count on one vault:');
let previous: number | null = null;
for (const [n, op] of [
  [0, '_eq'],
  [1, '_gte'],
  [2, '_gte'],
  [3, '_gte'],
  [5, '_gte'],
  [10, '_gte'],
] as const) {
  const found = await count(positions(n, op));
  // The drop is the point: a step that loses an order of magnitude is where the population changes
  // kind, not where it thins out.
  const drop = previous === null || found === 0 ? '' : `  (÷${(previous / found).toFixed(1)})`;
  console.log(
    `  ${op === '_eq' ? '=' : '≥'}${String(n).padStart(3)}  ${found.toLocaleString('en-US').padStart(9)}` +
      `  ${((found / total) * 100).toFixed(1).padStart(5)}%${drop}`,
  );
  if (op === '_gte') previous = found;
}

console.log('\nby amount on one vault:');
for (const [label, wei] of [
  ['> minDeposit (0.01)', '10000000000000000'],
  ['> 10× minDeposit', '100000000000000000'],
  ['> 1 TRUST', '1000000000000000000'],
] as const) {
  const found = await count(assets(wei));
  console.log(
    `  ${label.padEnd(22)} ${found.toLocaleString('en-US').padStart(9)}  ${((found / total) * 100).toFixed(1).padStart(5)}%`,
  );
}

console.log(
  '\nAn atom below the cliff exists on the chain and does not exist as a market. A directory that\n' +
    'lists atoms lists mostly empty slots.',
);
