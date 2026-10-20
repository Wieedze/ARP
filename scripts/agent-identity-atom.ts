/** Give an agent the ERC-8004 identity atom a `uses` edge needs — for an agent Intuition has not
 *  mirrored.
 *
 *      ARP_TARGET=testnet bun run scripts/agent-identity-atom.ts \
 *        --agent 13579/3 --registry 0xC165A2AD… --json /tmp/identity.json
 *      bun run scripts/agent-send-plan.ts --chain 13579 --plan /tmp/identity.json --execute
 *
 *  **Why this exists.** `docs/12` calls adopting an existing agent "the whole gap", and the gap has
 *  a prerequisite nobody had written down: the agent must already have an atom on the Intuition
 *  graph, and that atom is created by Intuition's **mirror**, which covers Base. On mainnet 1155 the
 *  28,648 mirrored agents have one, so a third party does nothing. On testnet 13579 ARP's own rig
 *  agents have none — measured 2026-10-20: 728 `same as` edges exist there and not one is ours — so
 *  ARP cannot rehearse the path it ships. That is `rules/portability.md` rule 4 from the other side.
 *
 *  Atom creation is permissionless, so the remedy is to write what the mirror would have written.
 *  Both recipes are **read off mainnet, not invented** (`intuition-pin.ts`), and both are
 *  content-addressed, so this script is idempotent: re-running after the writes land plans nothing.
 *
 *      (identity atom) --same as--> (caip19 atom)
 *
 *  The direction is the one `RESOLVE_AGENT_QUERY` reads: it filters on the **object**'s Thing name
 *  and returns the **subject**. Reversed, the agent stays unresolvable and the fee is spent.
 *
 *  Signs nothing and sends nothing. It pins (which needs `INTUITION_PIN_API_KEY`) and plans; the
 *  calls are for `agent-send-plan.ts`. Pinning is content-addressed, so a pin is idempotent and
 *  creates no on-chain state.
 */
import { writeFileSync } from 'node:fs';

import { formatEther } from 'viem';
import type { Address, Hex } from 'viem';

import {
  INTUITION_SAME_AS_TERM_ID,
  atomDataForUri,
  encodeCreateAtom,
  encodeCreateTriple,
  multiVaultReads,
  toCaip19,
  type PreparedCall,
} from '../packages/protocol/src/index.js';
import {
  canonicalAgentThing,
  canonicalCaipThing,
  pinThing,
  thingDocument,
  thingUri,
} from './intuition-pin.js';

const TARGETS = { mainnet: 1155, testnet: 13579 } as const;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
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
      '  in the canonical registry (it has no code at all on testnet 13579).',
  );
  process.exit(1);
}
const [agentChainId, agentTokenId] = agentRef.split('/') as [string, string];

const apiKey = process.env.INTUITION_PIN_API_KEY;
if (!apiKey) {
  console.error('INTUITION_PIN_API_KEY is not set — the pinning API is gated (ADR 0016).');
  process.exit(1);
}
const headerName = process.env.INTUITION_PIN_API_KEY_HEADER ?? 'apikey';

const record = JSON.parse(
  await Bun.file(new URL(`../deployments/${chainId}.json`, import.meta.url).pathname).text(),
) as { chain?: { rpcUrl?: string; name?: string }; intuition?: { multiVault?: string } };

const rpcUrl = process.env.INTUITION_RPC_URL ?? record.chain?.rpcUrl;
const multiVault = (process.env.ARP_MULTI_VAULT ?? record.intuition?.multiVault) as
  | Address
  | undefined;
if (!rpcUrl || !multiVault) {
  console.error(`deployments/${chainId}.json is missing a rpcUrl or multiVault`);
  process.exit(1);
}

const reads = multiVaultReads({ address: multiVault, chainId, rpcUrl });
const caip19 = toCaip19({
  chainId: Number(agentChainId),
  tokenId: agentTokenId,
  registry: arg('registry') as Address | undefined,
});

console.log(`chain      ${chainId} (${record.chain?.name ?? 'unknown'})`);
console.log(`multivault ${multiVault}`);
console.log(`caip19     ${caip19}\n`);

const things = {
  identity: canonicalAgentThing(Number(agentChainId), agentTokenId),
  caip: canonicalCaipThing(caip19),
} as const;

const uris: Record<keyof typeof things, string> = { identity: '', caip: '' };
for (const key of ['identity', 'caip'] as const) {
  // The id is known **before** the pin: `thingUri` computes it from the recipe with no credential
  // and no network (ADR `0047`). Pinning only makes the document readable, so the API's answer is
  // checked against the local computation rather than trusted — a mismatch means one of the two has
  // drifted, and minting on either would be permanent.
  const expected = thingUri(things[key]);
  const result = await pinThing(things[key], { apiKey, headerName });
  if (result.status !== 200 || !result.uri) {
    console.error(
      `pinning the ${key} Thing failed: http=${result.status} ${result.body.slice(0, 200)}`,
    );
    process.exit(1);
  }
  if (result.uri !== expected) {
    console.error(
      `REFUSED — the pinning API returned ${result.uri} for the ${key} Thing, but the recipe ` +
        `computes ${expected}. One of the two has drifted; minting either would be permanent.`,
    );
    process.exit(3);
  }
  uris[key] = result.uri;
  console.log(`${key.padEnd(9)} ${result.uri}  (matches the local computation)`);
  console.log(`          ${thingDocument(things[key])}`);
}

const identityAtom = await reads.atomId(atomDataForUri(uris.identity));
const caipAtom = await reads.atomId(atomDataForUri(uris.caip));
const tripleId = await reads.tripleId(identityAtom, INTUITION_SAME_AS_TERM_ID as Hex, caipAtom);

const [identityExists, caipExists, tripleExists] = await Promise.all([
  reads.termExists(identityAtom),
  reads.termExists(caipAtom),
  reads.termExists(tripleId),
]);

console.log(`\nidentity atom ${identityAtom}  ${identityExists ? 'exists' : 'TO CREATE'}`);
console.log(`caip19 atom   ${caipAtom}  ${caipExists ? 'exists' : 'TO CREATE'}`);
console.log(`same as edge  ${tripleId}  ${tripleExists ? 'exists' : 'TO CREATE'}`);

const atomCost = await reads.atomCost();
const tripleCost = await reads.tripleCost();
const calls: PreparedCall[] = [];

if (!identityExists) {
  calls.push({
    kind: 'create-atom',
    chainId,
    to: multiVault,
    value: atomCost,
    data: encodeCreateAtom(atomDataForUri(uris.identity), atomCost),
    why: `the agent's identity atom, from the canonical recipe (${things.identity.name})`,
  });
}
if (!caipExists) {
  calls.push({
    kind: 'create-atom',
    chainId,
    to: multiVault,
    value: atomCost,
    data: encodeCreateAtom(atomDataForUri(uris.caip), atomCost),
    why: `the CAIP-19 identifier atom (${caip19})`,
  });
}
if (!tripleExists) {
  calls.push({
    kind: 'create-triple',
    chainId,
    to: multiVault,
    value: tripleCost,
    data: encodeCreateTriple(identityAtom, INTUITION_SAME_AS_TERM_ID as Hex, caipAtom, tripleCost),
    why: 'identity atom --same as--> caip19 atom, the edge resolution reads',
  });
}

const total = calls.reduce((sum, call) => sum + call.value, 0n);
console.log(`\nplan: ${calls.length} call(s), ${formatEther(total)} TRUST`);
for (const call of calls) {
  console.log(`  ${call.kind.padEnd(14)} ${formatEther(call.value).padStart(14)}  ${call.why}`);
}
if (calls.length === 0) {
  console.log('  nothing to do — this agent already resolves. Idempotent by content address.');
}

const jsonPath = arg('json');
if (jsonPath !== undefined && calls.length > 0) {
  writeFileSync(
    jsonPath,
    `${JSON.stringify(
      calls.map((c) => ({ ...c, value: c.value.toString() })),
      null,
      2,
    )}\n`,
  );
  console.log(`\nwrote ${calls.length} call(s) to ${jsonPath}`);
  console.log(`  next: bun run scripts/agent-send-plan.ts --chain ${chainId} --plan ${jsonPath}`);
}

console.log('\nNothing was signed and nothing was sent. A term fee is NOT recoverable.');
