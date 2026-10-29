/** Give the agent its own ERC-8004 registration, from the command line.
 *
 *      ARP_TARGET=testnet bun run scripts/register-agent.ts --json /tmp/reg.json
 *      bun run scripts/agent-send-plan.ts --chain 13579 --plan /tmp/reg.json --execute
 *
 *  Plans and prints. **Signs nothing and sends nothing** — `agent-send-plan.ts` is the only place
 *  in this repo that holds a key (ADR `0038`).
 *
 *  ## It is permissionless, and that is the point
 *
 *  `IdentityRegistry.register()` mints to `msg.sender`. The agent registers **itself**; nothing
 *  here works because ARP owns the registry, which is what `rules/portability.md` rule 4 demands —
 *  a step that only works because ARP can write to the registry is a rehearsal prop, and on
 *  mainnet ARP owns no registry at all. This path is the same one an external operator walks.
 *
 *  ## Two calls, because the id is not known before the first
 *
 *  A registration document names its own `registrations[].agentId`, and the id is assigned by the
 *  mint. So: `register()` with no URI, read the id from the receipt, then `setAgentURI(id, uri)`.
 *  Predicting the next id instead would be right until two mints raced, and the wrong value would
 *  be permanent — Intuition and this registry both keep what the mint's calldata carried.
 *
 *  The two are planned together and sent in order. `--agent-id` skips the first call when the
 *  agent already has one and only its document needs replacing.
 */
import { writeFileSync } from 'node:fs';

import { encodeFunctionData, type Hex } from 'viem';

const TARGETS = { mainnet: 1155, testnet: 13579 } as const;
const TYPE = 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1';

const REGISTRY_ABI = [
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'register',
    inputs: [{ name: 'agentURI', type: 'string' }],
    outputs: [{ name: 'agentId', type: 'uint256' }],
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'setAgentURI',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'newURI', type: 'string' },
    ],
    outputs: [],
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
  // ARP owns no registry on 1155 (`deployments/1155.json`, both null by ADR `0025`), so there is
  // nothing to register against — and `rules/security.md` scopes mainnet writes to ADR `0017`.
  console.error('refusing mainnet: ARP has no identity registry on 1155, deliberately.');
  process.exit(1);
}

const address = arg('address');
if (address === undefined || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
  console.error(
    'usage: --address <0x…> [--name <name>] [--agent-id <n>] [--json <file>]\n' +
      '  --address is the account that will sign, and becomes the owner. Pass the same one\n' +
      '  agent-send-plan.ts will use, or the document names a wallet that does not own the token.',
  );
  process.exit(1);
}

const record = (await import(`../deployments/${chainId}.json`)) as {
  default: { arp: { identityRegistry: string } };
};
const registry = record.default.arp.identityRegistry as Hex;

const name = arg('name') ?? 'ARP Loop Agent';
const existingId = arg('agent-id');

/**
 * The registration document, inline as a `data:` URI.
 *
 * Inline rather than hosted because a hosted document is a second thing that can go down, and 23%
 * of the real cohort carries no document at all. What it claims is checkable from the chain alone:
 * the wallet it names is the account that owns the token.
 *
 * It declares **no serving endpoint**, and that is honest rather than a gap. This agent is a
 * consumer — it reads the registry, uses tools and pays to say so. An endpoint it does not serve
 * would be a claim a probe would correctly mark dead, which is the defect `rig-dead` exists to
 * exercise, not something to ship on a real identity.
 */
function document(agentId: number): string {
  const doc = {
    type: TYPE,
    name,
    description:
      'Reads the ARP tool registry, uses what it finds, and deposits TRUST on the tools it ' +
      'actually used. Operates under its own key on Intuition testnet 13579; serves no public ' +
      'endpoint, because it calls tools rather than offering any.',
    services: [{ name: 'agentWallet', endpoint: `eip155:${chainId}:${address}` }],
    registrations: [{ agentId, agentRegistry: `eip155:${chainId}:${registry}` }],
    active: true,
    supportedTrust: ['reputation'],
  };
  return `data:application/json;base64,${Buffer.from(JSON.stringify(doc)).toString('base64')}`;
}

const calls: {
  kind: string;
  chainId: number;
  to: Hex;
  value: string;
  data: Hex;
  why: string;
}[] = [];

if (existingId === undefined) {
  calls.push({
    kind: 'register',
    chainId,
    to: registry,
    value: '0',
    data: encodeFunctionData({ abi: REGISTRY_ABI, functionName: 'register', args: [''] }),
    why: `mint an ERC-8004 registration to ${address} (URI set by the next call)`,
  });
  console.log('plan: register() with an empty URI, then setAgentURI once the id is known.');
  console.log('      Re-run with --agent-id <n> after the mint to plan the second call.\n');
} else {
  const uri = document(Number(existingId));
  calls.push({
    kind: 'set-agent-uri',
    chainId,
    to: registry,
    value: '0',
    data: encodeFunctionData({
      abi: REGISTRY_ABI,
      functionName: 'setAgentURI',
      args: [BigInt(existingId), uri],
    }),
    why: `set agent ${existingId}'s registration document (${uri.length} chars, inline)`,
  });
  console.log(`document for agent ${existingId}:`);
  console.log(Buffer.from(uri.split(',')[1] ?? '', 'base64').toString('utf8'), '\n');
}

console.log(`chain     ${chainId} (${targetName})`);
console.log(`registry  ${registry}`);
console.log(`owner     ${address}`);
for (const [index, call] of calls.entries()) {
  console.log(`  ${index + 1}. ${call.kind.padEnd(14)} ${call.why.slice(0, 90)}`);
}

const jsonPath = arg('json');
if (jsonPath) {
  writeFileSync(jsonPath, JSON.stringify(calls, null, 2));
  console.log(`\nplan   ${jsonPath}`);
  console.log(
    `next   bun run scripts/agent-send-plan.ts --chain ${chainId} --plan ${jsonPath} --execute`,
  );
}
