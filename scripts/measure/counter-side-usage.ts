/** Does anybody ever take the other side of a triple?
 *
 *  The design question behind it: a `uses` edge is described as a two-sided market — one vault to
 *  agree, a counter-vault to disagree. That description is only worth keeping if the counter side is
 *  ever used. If it is not, the edge is a **receipt that costs money to write**, not a market, and
 *  calling it a market invites a reader to look for a disagreement that is not there.
 *
 *  Three populations, never summed, each named with its chain and date:
 *
 *    - every triple on the chain          — the base rate for "somebody joined"
 *    - every triple's counter-vault       — the base rate for "somebody disagreed"
 *    - the 185 `uses` edges               — the population ARP actually reads
 *
 *  Atoms are measured alongside **only** as a contrast on the joined rate. Their ≥2 figure is not
 *  clean evidence of an independent market: `atomDepositFractionForTriple` sends a fraction of every
 *  triple deposit toward the underlying atoms, so some atom positions are a side effect of triple
 *  activity rather than somebody choosing that atom. The script prints the fraction so the reader
 *  can see how large the contamination could be, and the per-edge sample below shows it is small in
 *  practice.
 *
 *      bun run scripts/measure/counter-side-usage.ts            # mainnet 1155
 *      bun run scripts/measure/counter-side-usage.ts testnet    # 13579
 *
 *  Read-only: GraphQL aggregates plus three `eth_call` reads. Signs nothing.
 */

import { createPublicClient, http, parseAbi, formatEther } from 'viem';

import { USES } from '../../packages/protocol/src/sources/intuition/terms';
import { intuitionMainnet, intuitionTestnet } from '../../packages/protocol/src/arp/chains';

const TARGETS = {
  mainnet: {
    label: 'Intuition mainnet 1155',
    url: 'https://mainnet.intuition.sh/v1/graphql',
    chain: intuitionMainnet,
    multiVault: '0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e',
  },
  testnet: {
    label: 'Intuition testnet 13579',
    url: 'https://testnet.intuition.sh/v1/graphql',
    chain: intuitionTestnet,
    multiVault: '0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91',
  },
} as const;

const which = (process.argv[2] ?? 'mainnet') as keyof typeof TARGETS;
const target = TARGETS[which];
if (!target) {
  console.error('usage: bun run scripts/measure/counter-side-usage.ts [mainnet|testnet]');
  process.exit(1);
}

const AGGREGATES = `
query CounterSide($uses: String!) {
  triplesAll:        triples_aggregate                                                                      { aggregate { count } }
  triplesAnyPos:     triples_aggregate(where: {term: {vaults: {position_count: {_gt: 0}}}})                 { aggregate { count } }
  triplesTwoPlus:    triples_aggregate(where: {term: {vaults: {position_count: {_gt: 1}}}})                 { aggregate { count } }
  triplesContested:  triples_aggregate(where: {counter_term: {vaults: {position_count: {_gt: 0}}}})         { aggregate { count } }
  atomsAll:          atoms_aggregate                                                                        { aggregate { count } }
  atomsTwoPlus:      atoms_aggregate(where: {term: {vaults: {position_count: {_gt: 1}}}})                   { aggregate { count } }
  usesAll:           triples_aggregate(where: {predicate_id: {_eq: $uses}})                                 { aggregate { count } }
  usesAnyPos:        triples_aggregate(where: {predicate_id: {_eq: $uses}, term: {vaults: {position_count: {_gt: 0}}}})         { aggregate { count } }
  usesTwoPlus:       triples_aggregate(where: {predicate_id: {_eq: $uses}, term: {vaults: {position_count: {_gt: 1}}}})         { aggregate { count } }
  usesContested:     triples_aggregate(where: {predicate_id: {_eq: $uses}, counter_term: {vaults: {position_count: {_gt: 0}}}}) { aggregate { count } }
}`;

/** The richest `uses` edges beside the atoms they point at — does money on one reach the other? */
const SAMPLE = `
query RichestEdges($uses: String!) {
  triples(where: {predicate_id: {_eq: $uses}}, order_by: {term: {total_assets: desc}}, limit: 5) {
    subject { label }
    object  { label term { total_assets vaults { position_count } } }
    term { total_assets vaults { position_count } }
  }
}`;

async function gql<T>(query: string): Promise<T> {
  const res = await fetch(target.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables: { uses: USES } }),
  });
  if (!res.ok) throw new Error(`${target.url}: HTTP ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
  if (!body.data) throw new Error('no data in response');
  return body.data;
}

type Count = { aggregate: { count: number } };
type Aggregates = Record<
  | 'triplesAll' | 'triplesAnyPos' | 'triplesTwoPlus' | 'triplesContested'
  | 'atomsAll' | 'atomsTwoPlus'
  | 'usesAll' | 'usesAnyPos' | 'usesTwoPlus' | 'usesContested',
  Count
>;
type Sample = {
  triples: {
    subject: { label: string | null } | null;
    object: { label: string | null; term: { total_assets: string; vaults: { position_count: number }[] } | null } | null;
    term: { total_assets: string; vaults: { position_count: number }[] } | null;
  }[];
};

const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(2)}%`);
const positions = (v: { position_count: number }[] | undefined) =>
  (v ?? []).reduce((sum, vault) => sum + vault.position_count, 0);

const readAbi = parseAbi([
  'function getTripleCost() view returns (uint256)',
  'function getAtomCost() view returns (uint256)',
  'function getTripleConfig() view returns ((uint256 tripleCreationProtocolFee, uint256 atomDepositFractionForTriple))',
  'function getGeneralConfig() view returns ((address admin, address protocolMultisig, uint256 feeDenominator, address trustBonding, uint256 minDeposit, uint256 minShare, uint256 atomDataMaxLength, uint256 feeThreshold))',
]);

const client = createPublicClient({ chain: target.chain, transport: http() });
const multiVault = target.multiVault as `0x${string}`;

const [agg, sample, tripleCost, atomCost, tripleConfig, generalConfig] = await Promise.all([
  gql<Aggregates>(AGGREGATES),
  gql<Sample>(SAMPLE),
  client.readContract({ address: multiVault, abi: readAbi, functionName: 'getTripleCost' }),
  client.readContract({ address: multiVault, abi: readAbi, functionName: 'getAtomCost' }),
  client.readContract({ address: multiVault, abi: readAbi, functionName: 'getTripleConfig' }),
  client.readContract({ address: multiVault, abi: readAbi, functionName: 'getGeneralConfig' }),
]);

console.log(`\n${target.label} — ${new Date().toISOString().slice(0, 10)}\n`);

console.log('every triple on the chain');
console.log(`  total                       ${agg.triplesAll.aggregate.count}`);
console.log(`  carries a position          ${agg.triplesAnyPos.aggregate.count}  ${pct(agg.triplesAnyPos.aggregate.count, agg.triplesAll.aggregate.count)}  (the birth deposit — every term is born with one, ADR 0053)`);
console.log(`  somebody ELSE joined (>1)   ${agg.triplesTwoPlus.aggregate.count}  ${pct(agg.triplesTwoPlus.aggregate.count, agg.triplesAll.aggregate.count)}`);
console.log(`  somebody DISAGREED          ${agg.triplesContested.aggregate.count}  ${pct(agg.triplesContested.aggregate.count, agg.triplesAll.aggregate.count)}`);

console.log('\nthe `uses` edges ARP reads');
console.log(`  total                       ${agg.usesAll.aggregate.count}`);
console.log(`  carries a position          ${agg.usesAnyPos.aggregate.count}`);
console.log(`  somebody ELSE joined (>1)   ${agg.usesTwoPlus.aggregate.count}`);
console.log(`  somebody DISAGREED          ${agg.usesContested.aggregate.count}`);

console.log('\natoms, as a contrast on the joined rate only — see the header on contamination');
console.log(`  total                       ${agg.atomsAll.aggregate.count}`);
console.log(`  two or more positions       ${agg.atomsTwoPlus.aggregate.count}  ${pct(agg.atomsTwoPlus.aggregate.count, agg.atomsAll.aggregate.count)}`);

const feeDenominator = generalConfig.feeDenominator;
const fraction = tripleConfig.atomDepositFractionForTriple;
console.log('\nwhat an act costs here, read from the chain and not from deployments/');
console.log(`  create a triple             ${formatEther(tripleCost)} TRUST   — a FEE: gone, not redeemable`);
console.log(`  create an atom              ${formatEther(atomCost)} TRUST   — a FEE`);
console.log(`  minDeposit                  ${formatEther(generalConfig.minDeposit)} TRUST   — a DEPOSIT: redeemable`);
console.log(`  of a triple deposit, toward its atoms  ${fraction}/${feeDenominator} = ${(Number(fraction) / Number(feeDenominator) * 100).toFixed(2)}%`);

console.log('\nthe richest `uses` edges, beside the atom each points at');
for (const row of sample.triples) {
  const edgeAssets = formatEther(BigInt(row.term?.total_assets ?? '0'));
  const atomAssets = formatEther(BigInt(row.object?.term?.total_assets ?? '0'));
  console.log(
    `  (${row.subject?.label ?? '?'}) uses (${row.object?.label ?? '?'})\n` +
      `      edge  ${edgeAssets.padStart(22)} TRUST  ${positions(row.term?.vaults)} position(s)\n` +
      `      atom  ${atomAssets.padStart(22)} TRUST  ${positions(row.object?.term?.vaults)} position(s)`,
  );
}
console.log();
