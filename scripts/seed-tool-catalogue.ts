/** Plan the atom for every tool in `data/catalogue/tools.json`, so the registry has something to read.
 *
 *      ARP_TARGET=testnet bun run scripts/seed-tool-catalogue.ts --json /tmp/seed.json
 *      bun run scripts/agent-send-plan.ts --chain 13579 --plan /tmp/seed.json --execute
 *
 *  Plans and prints. **Signs nothing and sends nothing** — `agent-send-plan.ts` is the only place
 *  in this repo that holds a key (ADR `0038`), and a second signing path is exactly how one set of
 *  guards becomes two.
 *
 *  ## Why this exists
 *
 *  `arp_find_tools` reads two populations and both were empty: no `uses` subject on mainnet is an
 *  identified agent (0 of 186, measured 2026-10-28), and nothing had ever been registered. So an
 *  agent asking ARP what tools exist got an empty list, which is not an answer.
 *
 *  ## Idempotent, and the id is the reason
 *
 *  A tool's atom id is a pure function of its normalised URL (ADR `0054`), so re-running this finds
 *  the atoms it created last time and plans nothing for them. Nothing here is a `--force`: there is
 *  no second atom to create for a URL that already has one.
 *
 *  ## `assets` is `cost + minDeposit`, not `cost`
 *
 *  Passing the cost exactly leaves nothing to deposit: the fee consumes it, the vault holds
 *  `minShare` alone and the term is born with **no position** — it exists on the chain and does not
 *  exist as a market (ADR `0053`, and `encodeCreateAtom`'s own measurement). Both numbers are read
 *  off the chain at plan time rather than copied, because they are governance-configurable and are
 *  100x apart between the two chains (`rules/portability.md`).
 */
import { writeFileSync } from 'node:fs';

import { encodeFunctionData, formatEther, type Hex } from 'viem';

import catalogue from '../data/catalogue/tools.json';
import { atomDataForUri, multiVaultReads } from '../packages/protocol/src/declare/index.js';
import { normaliseToolUrl, toolAtomUri } from '../packages/protocol/src/declare/tool-thing.js';

const TARGETS = { mainnet: 1155, testnet: 13579 } as const;

const CREATE_ATOMS_ABI = [
  {
    type: 'function',
    stateMutability: 'payable',
    name: 'createAtoms',
    inputs: [
      { name: 'atomDatas', type: 'bytes[]' },
      { name: 'assets', type: 'uint256[]' },
    ],
    outputs: [{ name: '', type: 'bytes32[]' }],
  },
] as const;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const targetName = (process.env.ARP_TARGET ?? 'testnet') as keyof typeof TARGETS;
const chainId = TARGETS[targetName];
if (chainId === undefined) {
  console.error(`ARP_TARGET must be one of ${Object.keys(TARGETS).join(', ')}`);
  process.exit(1);
}
if (chainId === 1155) {
  // `rules/security.md`: mainnet deployment and mainnet writes are different questions, and
  // neither is answered by a seeding script. ADR `0017` authorises deposits into existing
  // `has trust provider` vaults, signed by a human — not atom creation at scale, which ADR `0021`
  // priced separately.
  console.error('refusing mainnet: creating 52 atoms on 1155 is not authorised by any ADR.');
  process.exit(1);
}

const limit = Number(arg('limit') ?? catalogue.tools.length);
const batchSize = Number(arg('batch') ?? 10);
const jsonPath = arg('json');

const record = (await import(`../data/deployments/${chainId}.json`)) as {
  default: { intuition: { multiVault: string }; chain: { rpcUrl: string } };
};
const multiVault = record.default.intuition.multiVault as Hex;
const rpcUrl =
  process.env['INTUITION_RPC_URL'] ??
  process.env['INTUITION_TESTNET_RPC_URL'] ??
  record.default.chain.rpcUrl;

const { createPublicClient, http } = await import('viem');
const client = createPublicClient({ transport: http(rpcUrl) });
const reads = multiVaultReads({ address: multiVault, chainId, client });

const [atomCost, minDeposit] = await Promise.all([reads.atomCost(), reads.minDeposit()]);
const assets = atomCost + minDeposit;

console.log(`chain        ${chainId} (${targetName})`);
console.log(`multiVault   ${multiVault}`);
console.log(`atomCost     ${formatEther(atomCost)}  (read from the chain)`);
console.log(`minDeposit   ${formatEther(minDeposit)}`);
console.log(
  `per atom     ${formatEther(assets)}   = cost + minDeposit, so the term is born with a position\n`,
);

const planned: { url: string; title: string; atomId: Hex; data: Hex }[] = [];
let existing = 0;
for (const tool of catalogue.tools.slice(0, limit)) {
  const url = normaliseToolUrl(tool.url);
  const data = atomDataForUri(toolAtomUri(url));
  const atomId = await reads.atomId(data);
  if (await reads.termExists(atomId)) {
    existing += 1;
    console.log(`  exists   ${atomId.slice(0, 12)}…  ${tool.title}`);
    continue;
  }
  planned.push({ url, title: tool.title, atomId, data });
}

console.log(
  `\n${existing} already registered, ${planned.length} to create, ` +
    `${formatEther(assets * BigInt(planned.length))} total`,
);
if (planned.length === 0) {
  console.log('nothing to plan.');
  process.exit(0);
}

const calls = [];
for (let index = 0; index < planned.length; index += batchSize) {
  const slice = planned.slice(index, index + batchSize);
  calls.push({
    kind: 'create-atom',
    // Carried on every call, not inferred at signing time: `send-plan.ts` refuses a plan whose
    // calls disagree with its `--chain`, which is the guard that caught this file omitting it.
    chainId,
    to: multiVault,
    data: encodeFunctionData({
      abi: CREATE_ATOMS_ABI,
      functionName: 'createAtoms',
      args: [slice.map((item) => item.data), slice.map(() => assets)],
    }),
    value: (assets * BigInt(slice.length)).toString(),
    why: `register ${slice.length} tool atoms: ${slice.map((item) => item.title).join(', ')}`,
  });
}

console.log(`\n${calls.length} call(s), ${batchSize} atoms each at most:`);
for (const [index, call] of calls.entries()) {
  console.log(
    `  ${String(index + 1).padStart(2)}. ${formatEther(BigInt(call.value)).padStart(10)}  ${call.why.slice(0, 96)}`,
  );
}

if (jsonPath) {
  writeFileSync(jsonPath, JSON.stringify(calls, null, 2));
  writeFileSync(
    jsonPath.replace(/\.json$/, '') + '.atoms.json',
    JSON.stringify(
      planned.map((item) => ({ url: item.url, title: item.title, atomId: item.atomId })),
      null,
      2,
    ),
  );
  console.log(`\nplan      ${jsonPath}`);
  console.log(`atom ids  ${jsonPath.replace(/\.json$/, '')}.atoms.json`);
  console.log(
    `\nnext      bun run scripts/agent-send-plan.ts --chain ${chainId} --plan ${jsonPath} --execute`,
  );
}
