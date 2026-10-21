/** What does leaving a vault actually cost?
 *
 *  `getVaultFees()` returns `(entry, exit, protocol)` = `(50, 75, 125)` over a `feeDenominator` of
 *  10,000 on mainnet 1155. Reading "exit = 75" as "leaving costs 0.75%" is wrong, and it was written
 *  into `skills/arp/SKILL.md` — the **publishable** artifact, aimed at agents sizing real positions.
 *
 *  It is wrong twice over. The protocol fee is charged on the way out as well, and the total is not
 *  even constant: two careful reads on the same day disagreed, 125 bps against 200 bps, because they
 *  sampled different terms. Governance configures these and the contract applies them conditionally,
 *  so the only correct instruction to an agent is **call `previewRedeem`** — which is what the skill
 *  already says about every other cost on the chain.
 *
 *  This script exists to keep that claim honest rather than to produce a number to quote. It reports
 *  the observed spread across a real sample, and the spread is the finding.
 *
 *  Method: `convertToAssets(termId, curveId, shares)` is the pre-fee gross for those shares;
 *  `previewRedeem(termId, curveId, shares)[0]` is what the account actually receives. The gap, in
 *  basis points of the gross, is the cost of leaving.
 *
 *      bun run scripts/measure/exit-cost.ts                 # mainnet 1155
 *      bun run scripts/measure/exit-cost.ts testnet         # 13579
 *
 *  Read-only: one GraphQL query for the sample, then `eth_call` only. Signs nothing.
 */

import { createPublicClient, http, parseAbi } from 'viem';

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
  console.error('usage: bun run scripts/measure/exit-cost.ts [mainnet|testnet]');
  process.exit(1);
}

/** Terms with enough shares that a 1e15 redemption is a small fraction of the vault. */
const SAMPLE = `
{
  atoms(where: {term: {vaults: {total_shares: {_gt: "1000000000000000000"}}}}, limit: 8) {
    term_id
    label
    term { vaults { curve_id total_shares } }
  }
  triples(where: {term: {vaults: {total_shares: {_gt: "1000000000000000000"}}}}, limit: 8) {
    term_id
    term { vaults { curve_id total_shares } }
  }
}`;

type Vault = { curve_id: string; total_shares: string };
type Row = { term_id: string; label?: string | null; term: { vaults: Vault[] } | null };

const res = await fetch(target.url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query: SAMPLE }),
});
if (!res.ok) throw new Error(`${target.url}: HTTP ${res.status}`);
const body = (await res.json()) as {
  data?: { atoms: Row[]; triples: Row[] };
  errors?: { message: string }[];
};
if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
if (!body.data) throw new Error('no data in response');

const readAbi = parseAbi([
  'function convertToAssets(bytes32 termId, uint256 curveId, uint256 shares) view returns (uint256)',
  'function previewRedeem(bytes32 termId, uint256 curveId, uint256 shares) view returns (uint256 assetsAfterFees, uint256 sharesUsed)',
  'function getVaultFees() view returns ((uint256 entryFee, uint256 exitFee, uint256 protocolFee))',
  'function getGeneralConfig() view returns ((address admin, address protocolMultisig, uint256 feeDenominator, address trustBonding, uint256 minDeposit, uint256 minShare, uint256 atomDataMaxLength, uint256 feeThreshold))',
]);

const client = createPublicClient({ chain: target.chain, transport: http() });
const multiVault = target.multiVault as `0x${string}`;

const [fees, general] = await Promise.all([
  client.readContract({ address: multiVault, abi: readAbi, functionName: 'getVaultFees' }),
  client.readContract({ address: multiVault, abi: readAbi, functionName: 'getGeneralConfig' }),
]);

console.log(`\n${target.label} — ${new Date().toISOString().slice(0, 10)}\n`);
console.log('what the config says');
console.log(`  entry ${fees.entryFee}  exit ${fees.exitFee}  protocol ${fees.protocolFee}  / denominator ${general.feeDenominator}`);
console.log(`  feeThreshold ${general.feeThreshold}   minShare ${general.minShare}`);
console.log(
  `  so "exit" alone reads as ${(Number(fees.exitFee) / Number(general.feeDenominator) * 100).toFixed(2)}% — the measurement below is what leaving actually costs\n`,
);

/** A redemption small enough not to move the curve, so the figure is the fee and not the slope. */
const SHARES = 1_000_000_000_000_000n; // 1e15

type Observation = { kind: string; name: string; curveId: bigint; bps: number };
const observations: Observation[] = [];

async function probe(kind: string, row: Row) {
  for (const vault of row.term?.vaults ?? []) {
    const curveId = BigInt(vault.curve_id);
    if (BigInt(vault.total_shares) <= SHARES * 10n) continue;
    try {
      const [gross, preview] = await Promise.all([
        client.readContract({
          address: multiVault,
          abi: readAbi,
          functionName: 'convertToAssets',
          args: [row.term_id as `0x${string}`, curveId, SHARES],
        }),
        client.readContract({
          address: multiVault,
          abi: readAbi,
          functionName: 'previewRedeem',
          args: [row.term_id as `0x${string}`, curveId, SHARES],
        }),
      ]);
      if (gross === 0n) continue;
      observations.push({
        kind,
        name: row.label?.slice(0, 24) ?? row.term_id.slice(0, 10),
        curveId,
        bps: Number(((gross - preview[0]) * 10_000n * 100n) / gross) / 100,
      });
    } catch {
      // A term the node will not quote for this size tells us nothing; skip rather than guess.
    }
    // Courtesy on a public endpoint.
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

for (const row of body.data.atoms) await probe('atom', row);
for (const row of body.data.triples) await probe('triple', row);

console.log('what leaving actually costs, measured per term');
for (const o of observations) {
  console.log(`  ${o.kind.padEnd(6)} curve ${o.curveId}  ${o.bps.toFixed(1).padStart(6)} bps   ${o.name}`);
}

if (observations.length === 0) {
  console.log('  no term in the sample could be quoted at this size.');
} else {
  const values = observations.map((o) => o.bps);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const distinct = [...new Set(values.map((v) => v.toFixed(1)))].sort();
  console.log(`\n  ${observations.length} observations, ${distinct.length} distinct value(s): ${distinct.join(', ')} bps`);
  console.log(`  range ${low.toFixed(1)}–${high.toFixed(1)} bps against a configured "exit fee" of ${fees.exitFee} bps`);
  console.log(
    low === high
      ? '\n  One value here. Do not quote it anyway: it is governance-configurable and conditional.'
      : '\n  **Not one number.** Quote the range or, better, tell the caller to call `previewRedeem`.',
  );
}
console.log();
