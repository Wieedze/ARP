/** What does leaving a vault actually cost?
 *
 *  `getVaultFees()` returns `(entry, exit, protocol)` = `(50, 75, 125)` over a `feeDenominator` of
 *  10,000 on mainnet 1155. Reading "exit = 75" as "leaving costs 0.75%" is wrong, and it was written
 *  into `skills/arp/SKILL.md` — the **publishable** artifact, aimed at agents sizing real positions.
 *
 *  It is wrong twice over. The protocol fee is charged on the way out as well, and the total is not
 *  even constant: two careful reads on the same day disagreed, 125 bps against 200 bps, because they
 *  sampled different terms.
 *
 *  **The rule, which this script tests rather than asserts:** 125 bps (the protocol fee) always,
 *  plus 75 (the exit fee) unless the redemption would leave the term's **default-curve** vault
 *  holding fewer than `feeThreshold` shares. It is the default-curve vault's share supply that
 *  decides, not the assets of the vault being left — which is why a term can pay 125 while holding
 *  12 TRUST on curve 2 and another pays 200 while holding 1.2.
 *
 *  The script predicts each observation from public reads and prints the prediction beside the
 *  measurement. 21/21 agreed on mainnet 1155, 2026-10-21. A miss means the rule is wrong and the
 *  honest answer reverts to the range, which is why the prediction is printed rather than assumed.
 *
 *  Knowing the rule does not mean applying it: all three inputs are governance-configurable, so an
 *  agent still calls `previewRedeem`. What the rule is for is sizing a decision before making it.
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

// Safe, and the cast is what keeps the guard below honest: it narrows argv to the key union so the
// lookup type-checks, which makes `if (!target)` dead to the type system and still live at runtime
// for a bad argument. Dropping the cast would require a runtime `in` check to say the same thing.
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
  'function getVault(bytes32 termId, uint256 curveId) view returns (uint256 totalAssets, uint256 totalShares)',
  'function getBondingCurveConfig() view returns ((address registry, uint256 defaultCurveId))',
  'function previewRedeem(bytes32 termId, uint256 curveId, uint256 shares) view returns (uint256 assetsAfterFees, uint256 sharesUsed)',
  'function getVaultFees() view returns ((uint256 entryFee, uint256 exitFee, uint256 protocolFee))',
  'function getGeneralConfig() view returns ((address admin, address protocolMultisig, uint256 feeDenominator, address trustBonding, uint256 minDeposit, uint256 minShare, uint256 atomDataMaxLength, uint256 feeThreshold))',
]);

const client = createPublicClient({ chain: target.chain, transport: http() });
const multiVault = target.multiVault as `0x${string}`;

const [fees, general, curveConfig] = await Promise.all([
  client.readContract({ address: multiVault, abi: readAbi, functionName: 'getVaultFees' }),
  client.readContract({ address: multiVault, abi: readAbi, functionName: 'getGeneralConfig' }),
  client.readContract({ address: multiVault, abi: readAbi, functionName: 'getBondingCurveConfig' }),
]);
const defaultCurveId = curveConfig.defaultCurveId;

/**
 * The rule the two values come from, tested rather than asserted.
 *
 * The protocol fee is unconditional; the exit fee is waived when the **default-curve** vault would
 * be left holding fewer than `feeThreshold` shares after the redemption. So the figure is a property
 * of that vault's state at call time, not of the term, and not of the vault being redeemed — a term
 * crosses from one value to the other as its default-curve supply grows past the threshold.
 *
 * Predicted here from public reads only, and checked against the measurement below. A prediction
 * that matched on every observation is the evidence for the rule; a prediction that missed would
 * mean the rule is wrong and the honest answer is the range.
 */
function predictedBps(defaultCurveShares: bigint, curveId: bigint, shares: bigint): number {
  const remaining = curveId === defaultCurveId ? defaultCurveShares - shares : defaultCurveShares;
  const exit = remaining < general.feeThreshold ? 0n : fees.exitFee;
  return Number(exit + fees.protocolFee);
}

console.log(`\n${target.label} — ${new Date().toISOString().slice(0, 10)}\n`);
console.log('what the config says');
console.log(
  `  entry ${fees.entryFee}  exit ${fees.exitFee}  protocol ${fees.protocolFee}  / denominator ${general.feeDenominator}`,
);
console.log(`  feeThreshold ${general.feeThreshold}   minShare ${general.minShare}`);
console.log(
  `  so "exit" alone reads as ${((Number(fees.exitFee) / Number(general.feeDenominator)) * 100).toFixed(2)}% — the measurement below is what leaving actually costs\n`,
);

/** A redemption small enough not to move the curve, so the figure is the fee and not the slope. */
const SHARES = 1_000_000_000_000_000n; // 1e15

type Observation = {
  kind: string;
  name: string;
  curveId: bigint;
  bps: number;
  predicted: number;
};
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
      const defaultVault = await client.readContract({
        address: multiVault,
        abi: readAbi,
        functionName: 'getVault',
        args: [row.term_id as `0x${string}`, defaultCurveId],
      });
      observations.push({
        kind,
        name: row.label?.slice(0, 24) ?? row.term_id.slice(0, 10),
        curveId,
        bps: Number(((gross - preview[0]) * 10_000n * 100n) / gross) / 100,
        predicted: predictedBps(defaultVault[1], curveId, SHARES),
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

console.log('what leaving actually costs, measured — and what the rule predicts');
for (const o of observations) {
  const agrees = Math.abs(o.bps - o.predicted) < 0.05;
  console.log(
    `  ${o.kind.padEnd(6)} curve ${o.curveId}  ${o.bps.toFixed(1).padStart(6)} bps   ` +
      `predicted ${o.predicted.toString().padStart(3)}  ${agrees ? 'ok ' : 'MISS'}  ${o.name}`,
  );
}
const misses = observations.filter((o) => Math.abs(o.bps - o.predicted) >= 0.05);
console.log(
  `\n  the rule: ${fees.protocolFee} bps always, plus ${fees.exitFee} iff the curve-${defaultCurveId} vault`,
);
console.log(
  `  still holds >= ${general.feeThreshold} shares after the redemption — ${observations.length - misses.length}/${observations.length} agree`,
);
if (misses.length > 0) {
  console.log('  **the rule is wrong**: quote the range, not the rule.');
}

if (observations.length === 0) {
  console.log('  no term in the sample could be quoted at this size.');
} else {
  const values = observations.map((o) => o.bps);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const distinct = [...new Set(values.map((v) => v.toFixed(1)))].sort();
  console.log(
    `\n  ${observations.length} observations, ${distinct.length} distinct value(s): ${distinct.join(', ')} bps`,
  );
  console.log(
    `  range ${low.toFixed(1)}–${high.toFixed(1)} bps against a configured "exit fee" of ${fees.exitFee} bps`,
  );
  console.log(
    misses.length === 0 && distinct.length > 1
      ? '\n  Two values, and the rule above picks between them — but it is governance-configurable,\n  so an agent calls `previewRedeem` rather than applying it.'
      : '\n  **Do not quote a single figure.** Tell the caller to call `previewRedeem`.',
  );
}
console.log();
