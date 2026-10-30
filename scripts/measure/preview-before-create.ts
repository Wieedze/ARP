/** Can a term be previewed before it exists, and does the preview see the zero-position failure?
 *
 *      bun run scripts/measure/preview-before-create.ts            # testnet 13579
 *      bun run scripts/measure/preview-before-create.ts mainnet    # 1155
 *
 *  Two things had to be measured before the plans could preview anything.
 *
 *  **One: is `previewAtomCreate` callable on an atom that does not exist?** If it reverted, the
 *  check would have to happen after the write, which is useless — the fee is already spent. It does
 *  not revert. The curve state is empty and it computes from zero.
 *
 *  **Two: does it predict the zero-position failure?** This is the one that matters. ADR `0053` says
 *  every term is born with a position, and the failure it guards against is passing the *fee* as
 *  `assets`: `createAtoms` takes the deposit and subtracts the fee from it, so paying exactly the
 *  fee seeds the vault with `minShare` and leaves the term at zero positions — on the chain, and not
 *  a market. Until now that was known from having done it. `previewAtomCreate` returns
 *  **`shares = 0`** for it, so the invariant is checkable by a read before anything is signed.
 *
 *  `previewDeposit` is the asymmetric one: it **reverts** on a term that does not exist. That is
 *  consistent with `prepareStakeOnUsed`, which only plans a deposit for a triple already on chain.
 *
 *  Run on both chains 2026-10-21. Same behaviour, different fees — a fourth reason to read rather
 *  than assume, since the shares a given deposit buys are not portable either:
 *
 *  | chain      | atom fee       | triple fee     | minDeposit | fee + minDeposit → shares (atom / triple) |
 *  | ---------- | -------------- | -------------- | ---------- | ----------------------------------------- |
 *  | 13579 test | 0.001000000001 | 0.001000000002 | 0.001      | 9.80e14 / 9.90e14  (2.0% / 1.0% taken)    |
 *  | 1155 main  | 0.100000000001 | 0.100000000002 | 0.01       | 9.825e15 / 9.875e15 (1.75% / 1.25%)       |
 *
 *  The fee alone returns `shares = 0` on **both** chains, for both atoms and triples.
 *
 *  Read-only: `eth_call` only. Signs nothing, needs no key.
 */
import { createPublicClient, formatEther, http, parseAbi, stringToHex } from 'viem';

import { toolAtomUri } from '../../packages/protocol/src/declare/tool-thing.js';
import { SAME_AS, USES } from '../../packages/protocol/src/sources/intuition/terms.js';

const TARGETS = {
  testnet: {
    label: 'Intuition testnet 13579',
    multiVault: '0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91',
    rpcUrl: 'https://testnet.rpc.intuition.systems/http',
  },
  mainnet: {
    label: 'Intuition mainnet 1155',
    multiVault: '0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e',
    rpcUrl: 'https://rpc.intuition.systems/http',
  },
} as const;

const which = (process.argv[2] ?? 'testnet') as keyof typeof TARGETS;
const target = TARGETS[which];
if (!target) {
  console.error('usage: bun run scripts/measure/preview-before-create.ts [testnet|mainnet]');
  process.exit(1);
}

const abi = parseAbi([
  'function calculateAtomId(bytes data) pure returns (bytes32)',
  'function calculateTripleId(bytes32 subjectId, bytes32 predicateId, bytes32 objectId) pure returns (bytes32)',
  'function isTermCreated(bytes32 id) view returns (bool)',
  'function getAtomCost() view returns (uint256)',
  'function getTripleCost() view returns (uint256)',
  'function getGeneralConfig() view returns ((address admin, address protocolMultisig, uint256 feeDenominator, address trustBonding, uint256 minDeposit, uint256 minShare, uint256 atomDataMaxLength, uint256 feeThreshold))',
  'function previewAtomCreate(bytes32 termId, uint256 assets) view returns (uint256 shares, uint256 assetsAfterFixedFees, uint256 assetsAfterFees)',
  'function previewTripleCreate(bytes32 termId, uint256 assets) view returns (uint256 shares, uint256 assetsAfterFixedFees, uint256 assetsAfterFees)',
  'function previewDeposit(bytes32 termId, uint256 curveId, uint256 assets) view returns (uint256 shares, uint256 assetsAfterFees)',
]);

const client = createPublicClient({ transport: http(target.rpcUrl) });
const read = (functionName: string, args: readonly unknown[]): Promise<unknown> =>
  client.readContract({ address: target.multiVault, abi, functionName, args } as never);

/** A URL nobody has registered, so its atom reliably does not exist on either chain. */
const PROBE_URL = 'https://example.invalid/arp-preview-probe';

const atomUri = toolAtomUri(PROBE_URL);
const atomId = (await read('calculateAtomId', [stringToHex(atomUri)])) as `0x${string}`;
const tripleId = (await read('calculateTripleId', [atomId, USES, SAME_AS])) as `0x${string}`;

const atomCost = (await read('getAtomCost', [])) as bigint;
const tripleCost = (await read('getTripleCost', [])) as bigint;
const config = (await read('getGeneralConfig', [])) as { minDeposit: bigint; minShare: bigint };
const { minDeposit, minShare } = config;

console.log(`${target.label} — ${new Date().toISOString().slice(0, 10)}`);
console.log(`  probe atom   ${atomId}`);
console.log(`  exists       ${await read('isTermCreated', [atomId])}`);
console.log(
  `  atomCost ${formatEther(atomCost)}  tripleCost ${formatEther(tripleCost)}  ` +
    `minDeposit ${formatEther(minDeposit)}  minShare ${minShare}`,
);
console.log('');

for (const [what, id, cost] of [
  ['previewAtomCreate', atomId, atomCost],
  ['previewTripleCreate', tripleId, tripleCost],
] as const) {
  for (const [how, assets] of [
    ['the fee alone', cost],
    ['fee + minDeposit', cost + minDeposit],
    ['fee + 10×minDeposit', cost + minDeposit * 10n],
  ] as const) {
    try {
      const r = (await read(what, [id, assets])) as readonly [bigint, bigint, bigint];
      const verdict = r[0] === 0n ? 'ZERO POSITIONS' : 'a position';
      console.log(
        `  ${what}(${how.padEnd(19)}) = ${formatEther(assets).padStart(16)}  ` +
          `shares ${String(r[0]).padStart(18)}  afterFees ${String(r[2]).padStart(18)}  ${verdict}`,
      );
    } catch (error) {
      console.log(`  ${what}(${how}) THREW ${(error as Error).message.split('\n')[0]}`);
    }
  }
  console.log('');
}

try {
  const d = (await read('previewDeposit', [atomId, 1n, minDeposit])) as readonly [bigint, bigint];
  console.log(`  previewDeposit on a term that does not exist = shares ${d[0]}`);
} catch (error) {
  console.log(
    `  previewDeposit on a term that does not exist REVERTS — ` +
      `${(error as Error).message.split('\n')[0]}`,
  );
}
