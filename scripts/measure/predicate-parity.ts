/**
 * Does every predicate atom the write paths name exist on **both** Intuition chains?
 *
 * The question the chain toggle raises. Term ids are `keccak(atomData)` and so chain-independent,
 * but an atom has to have been *created* on a chain before a triple can reference it. A write path
 * ported from mainnet to testnet inherits mainnet's predicate ids, and a predicate testnet has
 * never seen makes `createTriples` revert after the user has signed.
 *
 * Also prints the governance-configurable costs side by side, because `rules/portability.md` rule 3
 * is that they are 100x apart and must be read, never tuned on testnet values.
 *
 *   bun run scripts/measure/predicate-parity.ts
 */
import { createPublicClient, http, parseAbi, type Hex } from 'viem';

import {
  HAS_CATEGORY,
  HAS_TAG,
  HAS_TRUST_ASSESSMENT,
  HAS_TRUST_PROVIDER,
  HAS_TYPE,
  IMPLEMENT,
  SAME_AS,
  USE,
  USES,
} from '../../packages/protocol/src/sources/intuition/terms';

const CHAINS = [
  {
    id: 1155,
    label: 'mainnet 1155',
    rpc: 'https://rpc.intuition.systems/http',
    multiVault: '0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e',
  },
  {
    id: 13579,
    label: 'testnet 13579',
    rpc: 'https://testnet.rpc.intuition.systems/http',
    multiVault: '0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91',
  },
] as const;

const PREDICATES: readonly [string, string][] = [
  ['same as', SAME_AS],
  ['uses', USES],
  ['use', USE],
  ['has trust provider', HAS_TRUST_PROVIDER],
  ['has trust assessment', HAS_TRUST_ASSESSMENT],
  ['has tag', HAS_TAG],
  ['has category', HAS_CATEGORY],
  ['has type', HAS_TYPE],
  ['implement', IMPLEMENT],
];

const abi = parseAbi([
  'function isTermCreated(bytes32 id) view returns (bool)',
  'function getAtomCost() view returns (uint256)',
  'function getTripleCost() view returns (uint256)',
  'function getGeneralConfig() view returns ((address admin, address protocolMultisig, uint256 feeDenominator, address trustBonding, uint256 minDeposit, uint256 minShare, uint256 atomDataMaxLength, uint256 feeThreshold))',
  'function getBondingCurveConfig() view returns ((address registry, uint256 defaultCurveId))',
]);

/** Courtesy on a third-party endpoint: no burst, 400 ms between reads. */
const pause = () => new Promise((resolve) => setTimeout(resolve, 400));

for (const chain of CHAINS) {
  const client = createPublicClient({ transport: http(chain.rpc) });
  const contract = { address: chain.multiVault as Hex, abi } as const;

  const general = await client.readContract({ ...contract, functionName: 'getGeneralConfig' });
  await pause();
  const curve = await client.readContract({ ...contract, functionName: 'getBondingCurveConfig' });
  await pause();
  const atomCost = await client.readContract({ ...contract, functionName: 'getAtomCost' });
  await pause();
  const tripleCost = await client.readContract({ ...contract, functionName: 'getTripleCost' });

  console.log(`\n--- ${chain.label}`);
  console.log(`    minDeposit      ${general.minDeposit}`);
  console.log(`    minShare        ${general.minShare}`);
  console.log(`    feeThreshold    ${general.feeThreshold}`);
  console.log(`    defaultCurveId  ${curve.defaultCurveId}`);
  console.log(`    atomCost        ${atomCost}`);
  console.log(`    tripleCost      ${tripleCost}`);

  for (const [label, id] of PREDICATES) {
    await pause();
    const exists = await client.readContract({
      ...contract,
      functionName: 'isTermCreated',
      args: [id as Hex],
    });
    console.log(`    ${exists ? 'yes' : 'NO '}  ${label.padEnd(22)} ${id}`);
  }
}
