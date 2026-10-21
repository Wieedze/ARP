/** Give an agent the ERC-8004 identity atom a `uses` edge needs, from the command line.
 *
 *      ARP_TARGET=testnet bun run scripts/agent-identity-atom.ts \
 *        --agent 13579/3 --registry 0xC165A2AD… --json /tmp/identity.json
 *      bun run scripts/agent-send-plan.ts --chain 13579 --plan /tmp/identity.json --execute
 *
 *  A transport over `plan-identity-atom.ts`, which holds the recipe and the reasoning. Signs nothing
 *  and sends nothing: it pins — content-addressed, so idempotent and creating no on-chain state —
 *  and prints calls for `agent-send-plan.ts`.
 */
import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';

import { formatEther } from 'viem';
import type { Address } from 'viem';

import { multiVaultReads } from '../packages/protocol/src/declare/index.js';
import { planIdentityAtom } from './plan-identity-atom.js';

const TARGETS = { mainnet: 1155, testnet: 13579 } as const;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const targetName = (process.env.ARP_TARGET ?? 'mainnet') as keyof typeof TARGETS;
const chainId = TARGETS[targetName];
if (chainId === undefined) {
  console.error(`ARP_TARGET must be one of ${Object.keys(TARGETS).join(', ')}`);
  process.exit(1);
}

const agentRef = arg('agent');
if (!agentRef || !/^\d+\/\d+$/.test(agentRef)) {
  console.error(
    'usage: --agent <chainId>/<tokenId> [--registry <0x…>] [--json <file>]\n' +
      '  ARP_TARGET picks the chain written to; --registry is required wherever the agent is not\n' +
      '  in the canonical registry (it has no code at all on Intuition testnet 13579).',
  );
  process.exit(1);
}
const [agentChainId, agentTokenId] = agentRef.split('/') as [string, string];

const apiKey = process.env.INTUITION_PIN_API_KEY;
if (!apiKey) {
  console.error('INTUITION_PIN_API_KEY is not set — the pinning API is gated (ADR 0016).');
  process.exit(1);
}

const record = JSON.parse(
  readFileSync(new URL(`../deployments/${chainId}.json`, import.meta.url), 'utf8'),
) as { chain?: { rpcUrl?: string; name?: string }; intuition?: { multiVault?: string } };

const rpcUrl = process.env.INTUITION_RPC_URL ?? record.chain?.rpcUrl;
const multiVault = (process.env.ARP_MULTI_VAULT ?? record.intuition?.multiVault) as
  | Address
  | undefined;
if (!rpcUrl || !multiVault) {
  console.error(`deployments/${chainId}.json is missing a rpcUrl or multiVault`);
  process.exit(1);
}

const plan = await planIdentityAtom({
  agent: {
    chainId: Number(agentChainId),
    tokenId: agentTokenId,
    ...(arg('registry') === undefined ? {} : { registry: arg('registry') as Address }),
  },
  reads: multiVaultReads({ address: multiVault, chainId, rpcUrl }),
  pin: { apiKey, headerName: process.env.INTUITION_PIN_API_KEY_HEADER ?? 'apikey' },
}).catch((error: unknown) => {
  console.error(`\n${String(error instanceof Error ? error.message : error)}\n`);
  process.exit(2);
});

console.log(`chain      ${chainId} (${record.chain?.name ?? 'unknown'})`);
console.log(`multivault ${multiVault}`);
console.log(`caip19     ${plan.caip19}\n`);
console.log(`identity  ${plan.uris.identity}  (matches the local computation)`);
console.log(`          ${plan.documents.identity}`);
console.log(`caip      ${plan.uris.caip}  (matches the local computation)`);
console.log(`          ${plan.documents.caip}\n`);
console.log(
  `identity atom ${plan.identityAtom}  ${plan.existing.identityAtom ? 'exists' : 'TO CREATE'}`,
);
console.log(`caip19 atom   ${plan.caipAtom}  ${plan.existing.caipAtom ? 'exists' : 'TO CREATE'}`);
console.log(`same as edge  ${plan.tripleId}  ${plan.existing.triple ? 'exists' : 'TO CREATE'}`);

console.log(`\nplan: ${plan.calls.length} call(s), ${formatEther(plan.totalValue)} TRUST`);
for (const call of plan.calls) {
  console.log(
    `  ${call.kind.padEnd(14)} ${formatEther(call.value).padStart(14)}` +
      `${call.preview === undefined ? '' : `  ${call.preview.shares} shares`}  ${call.why}`,
  );
}
if (plan.calls.length === 0) {
  console.log('  nothing to do — this agent already resolves. Idempotent by content address.');
}

const jsonPath = arg('json');
if (jsonPath !== undefined && plan.calls.length > 0) {
  writeFileSync(
    jsonPath,
    `${JSON.stringify(
      plan.calls.map((call) => ({ ...call, value: call.value.toString() })),
      null,
      2,
    )}\n`,
  );
  console.log(`\nwrote ${plan.calls.length} call(s) to ${jsonPath}`);
  console.log(`  next: bun run scripts/agent-send-plan.ts --chain ${chainId} --plan ${jsonPath}`);
}

console.log('\nNothing was signed and nothing was sent. A term fee is NOT recoverable.');
