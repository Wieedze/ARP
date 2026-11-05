/** Agents, the way the pulse does skills: an address its owner signed, a receipt the hired agent signed, a line
 *  on chain with a domain and an outcome, and the receipt attached to that line. Testnet 13579 only.
 *
 *      bun run scripts/demo/agent-pulse-walk.ts              pins two small documents, sends no transaction
 *      bun run scripts/demo/agent-pulse-walk.ts --execute    signs with the three keys below
 *      ... --execute --serve-only --handler <path>           signs the address, then only keeps the node up
 *
 *  Hirer: agent 13579/6, `AGENT_PRIVATE_KEY`. Hired: agent 13579/2, node key `AGENT2_PRIVATE_KEY`, owner `PRIVATE_KEY`.
 *  All three are one operator's, so this tests the mechanism and is not independent witness. Every key is read from
 *  the environment, checked against the address expected and never printed (ADR `0037`). The node is public through a
 *  quick tunnel for as long as this runs. `scripts/demo/agent-pulse-read.ts` reads the result holding no key. An executed
 *  run appends to `data/measurements/agent-pulse-walk-<date>.jsonl`.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { appendFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createPublicClient,
  createWalletClient,
  formatEther,
  getAddress,
  http,
  parseAbi,
  verifyMessage,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import deployment from '../../data/deployments/13579.json';
import { canonicalAgentThing, thingUri } from '../../packages/protocol/src/declare/agent-atom.ts';
import { prepareEndpointBinding } from '../../packages/protocol/src/declare/endpoint-binding-plan.ts';
import {
  atomDataForUri,
  encodeCreateAtom,
  encodeCreateTriple,
  multiVaultReads,
} from '../../packages/protocol/src/declare/multivault.ts';
import {
  createHandshakeVerifier,
  endpointBindingDocument,
  type HandshakeChain,
} from '../../packages/protocol/src/handshake.ts';
import {
  hireReceiptMatches,
  verifyHireReceipt,
  type SignedHireReceipt,
} from '../../packages/protocol/src/hire-receipt.ts';
import { RAW_KEY_CHAIN_ID, sendPlan, type SerialisedCall } from '../helpers/send-plan.ts';
import { documentFacts } from './agent-pulse-handler.ts';

const execute = process.argv.includes('--execute');
const serveOnly = process.argv.includes('--serve-only');
const handlerIndex = process.argv.indexOf('--handler');
const handlerPath = handlerIndex === -1 ? 'scripts/demo/agent-pulse-handler.ts' : (process.argv[handlerIndex + 1] ?? '');
const DOMAIN = 'document';
const NODE_PORT = 3171;
const MCP_PORT = 3172;
const PAY = 1_000_000_000_000_000n; // 0.001 tTRUST, the node's default minimum
const HIRER = {
  id: '6',
  address: getAddress('0x906f3A52ec089f8D4E9127F91C6bE5Ae0d18f91f'),
  key: 'AGENT_PRIVATE_KEY',
};
const HIRED = {
  id: '2',
  node: getAddress('0x9C985BEFD57e3c45372105Fe7091e132b6d7e868'),
  nodeKey: 'AGENT2_PRIVATE_KEY',
  owner: getAddress('0xE596096F4176b682E300d73963e7B04B383C1AA1'),
  ownerKey: 'PRIVATE_KEY',
};

const registry = deployment.arp.identityRegistry as Address; // an address in this repo's record
const agentRegistry = `eip155:${RAW_KEY_CHAIN_ID}:${registry}`;
const rpcUrl = deployment.chain.rpcUrl;
const predicates = {
  hasEndpoint: deployment.arp.endpointBinding.hasEndpoint as Hex, // an id in this repo's record
  inContextOf: deployment.arp.endpointBinding.inContextOf as Hex, // same
};
const client = createPublicClient({ transport: http(rpcUrl) });
const reads = multiVaultReads({
  address: deployment.intuition.multiVault as Address, // an address in this repo's record
  chainId: RAW_KEY_CHAIN_ID,
  rpcUrl,
});

const printable = (_key: string, value: unknown) =>
  typeof value === 'bigint' ? value.toString() : value;
const log: Record<string, unknown>[] = [];
const note = (step: string, facts: Record<string, unknown>) => {
  const row = { at: new Date().toISOString(), step, ...facts };
  log.push(row);
  console.log(JSON.stringify(row, printable));
};

function account(keyName: string, expected: Address) {
  const key = process.env[keyName];
  if (!key) throw new Error(`${keyName} is not set`);
  const signer = privateKeyToAccount((key.startsWith('0x') ? key : `0x${key}`) as Hex); // a key is hex
  if (getAddress(signer.address) !== expected) {
    throw new Error(`${keyName} signs as ${signer.address}, not ${expected}`);
  }
  return signer;
}
const hirer = account(HIRER.key, HIRER.address);
const nodeAccount = account(HIRED.nodeKey, HIRED.node);
const owner = account(HIRED.ownerKey, HIRED.owner);
if ((await client.getChainId()) !== RAW_KEY_CHAIN_ID) throw new Error('the RPC is not on 13579');

const REGISTRY_ABI = parseAbi(['function ownerOf(uint256) view returns (address)']);
const chain: HandshakeChain = {
  ownerOf: ({ registry: at, agentId }) =>
    client.readContract({
      address: at,
      abi: REGISTRY_ABI,
      functionName: 'ownerOf',
      args: [agentId],
    }),
  // Agent 2's owner is an EOA, so a recovery is enough here.
  verifyMessage: ({ address, message, signature }) =>
    verifyMessage({ address, message, signature }),
};

async function pinJson(document: string): Promise<string> {
  const apiKey = process.env['INTUITION_PIN_API_KEY'];
  if (!apiKey) throw new Error('INTUITION_PIN_API_KEY is not set');
  const response = await fetch('https://pin.intuition.systems/v1/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({
      query: 'mutation upload($json: jsonb!) { uploadJsonToIpfs(json: $json) { hash } }',
      variables: { json: JSON.parse(document) as unknown },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const hash = ((await response.json()) as { data?: { uploadJsonToIpfs?: { hash?: string } } }).data
    ?.uploadJsonToIpfs?.hash; // the API's own shape
  if (hash === undefined) throw new Error(`pinning failed: http ${response.status}`);
  return `ipfs://${hash}`;
}

async function send(label: string, calls: SerialisedCall[], keyName: string): Promise<boolean> {
  const total = calls.reduce((sum, call) => sum + BigInt(call.value), 0n);
  note(label, {
    calls: calls.map((call) => [call.kind, call.why.slice(0, 70)]),
    total: formatEther(total),
    execute,
  });
  if (calls.length === 0) return true;
  const hashes: string[] = [];
  const outcome = await sendPlan({
    calls,
    chainId: RAW_KEY_CHAIN_ID,
    rpcUrl,
    keyName,
    execute,
    pauseMs: 1_500,
    onCall: (_index, _call, hash) => hashes.push(hash),
  });
  note(`${label}: ${outcome.status}`, { hashes });
  return outcome.status === 'sent' || outcome.status === 'dry-run';
}

const children: ChildProcess[] = [];
process.on('exit', () => children.forEach((child) => child.kill()));

async function startNode(): Promise<string> {
  const child = spawn('bun', ['--no-env-file', 'run', 'apps/node/src/node.ts'], {
    env: {
      PATH: process.env['PATH'],
      HOME: process.env['HOME'],
      AGENT_PRIVATE_KEY: process.env[HIRED.nodeKey],
      AGENT_REGISTRY: agentRegistry,
      AGENT_ID: HIRED.id,
      AGENT_NODE_PORT: String(NODE_PORT),
      ARP_NODE_TUNNEL: 'cloudflared',
      INTUITION_RPC_URL: rpcUrl,
      ARP_NODE_HANDLER: join(process.cwd(), handlerPath),
      AGENT_NODE_LEDGER: join(tmpdir(), `agent-pulse-ledger-${Date.now()}.jsonl`),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('the node printed no public URL in 60 s')),
      60_000,
    );
    child.stderr?.on('data', (chunk: Buffer) => {
      const url = /public\s+(https:\/\/\S+)/.exec(chunk.toString());
      if (url?.[1]) {
        clearTimeout(timer);
        resolve(url[1]);
      }
    });
    child.on('exit', (code) => reject(new Error(`the node exited ${code}`)));
  });
}

// The real MCP server, holding no key, so the plan is what an agent is handed.
children.push(
  spawn('bun', ['--no-env-file', 'run', 'apps/mcp/src/server.ts'], {
    env: {
      PATH: process.env['PATH'],
      HOME: process.env['HOME'],
      ARP_TARGET: 'testnet',
      ARP_NO_RECEIPTS: '1',
      PORT: String(MCP_PORT),
    },
    stdio: 'ignore',
  }),
);
async function tool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${MCP_PORT}/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name, arguments: args },
        }),
      });
      const body = (await response.json()) as {
        result?: { content?: { text?: string }[] };
        error?: unknown;
      }; // checked next
      const text = body.result?.content?.[0]?.text;
      if (text === undefined) throw new Error(`no answer: ${JSON.stringify(body).slice(0, 300)}`);
      return JSON.parse(text) as Record<string, unknown>; // the server's JSON
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('no answer')) throw error;
      await new Promise((resume) => setTimeout(resume, 500));
    }
  }
  throw new Error('the MCP server did not come up');
}
const asCalls = (plan: Record<string, unknown>): SerialisedCall[] =>
  (
    plan['calls'] as {
      kind: string;
      chain_id: number;
      to: Hex;
      value_wei: string;
      data: Hex;
      why: string;
    }[]
  ) // the server's shape
    .map((entry) => ({
      kind: entry.kind,
      chainId: entry.chain_id,
      to: entry.to,
      value: entry.value_wei,
      data: entry.data,
      why: entry.why,
    }));

const hiredUri = thingUri(canonicalAgentThing(RAW_KEY_CHAIN_ID, HIRED.id));
const hiredAtom = await reads.atomId(atomDataForUri(hiredUri));
note('preflight', {
  hirer: hirer.address,
  node: nodeAccount.address,
  owner: owner.address,
  hiredAtom,
  execute,
});

// Proof 1: the address, signed by the token's owner and by the node key. No directory is hosted,
// so the verifier runs here, which is the same code a directory would run.
const endpoint = await startNode();
note('node up', { endpoint });
let healthy = false;
for (let attempt = 0; attempt < 30 && !healthy; attempt += 1) {
  healthy = await fetch(`${endpoint}/healthz`, { signal: AbortSignal.timeout(5_000) }).then(
    (response) => response.ok,
    () => false,
  );
  if (!healthy) await new Promise((resume) => setTimeout(resume, 2_000));
}
if (!healthy) throw new Error('the tunnel never answered');
// The plugin's guard resolves the name separately, and a new name takes 60 s there (`tunnel-reachable.ts`).
// So the address is announced when a caller can check it, and not when this script can reach it.
const waitStarted = Date.now();
const host = new URL(endpoint).hostname;
let resolves = false;
while (!resolves && Date.now() - waitStarted < 150_000) {
  resolves = await lookup(host).then(
    () => true,
    () => false,
  );
  if (!resolves) await new Promise((resume) => setTimeout(resume, 3_000));
}
note('name resolves for a caller', { resolves, afterSeconds: (Date.now() - waitStarted) / 1_000 });
const verifier = createHandshakeVerifier({
  chain,
  domain: 'localhost',
  uri: 'http://localhost/handshake',
});
const asked = await verifier.challenge({
  agentRegistry,
  agentId: HIRED.id,
  nodePublicKey: nodeAccount.publicKey,
  endpoint,
});
if (!asked.ok) throw new Error(`challenge refused: ${JSON.stringify(asked.error)}`);
const bound = await verifier.complete({
  nonce: asked.value.nonce,
  ownerSignature: await owner.signMessage({ message: asked.value.message }),
  nodeSignature: await nodeAccount.signMessage({ message: asked.value.message }),
});
if (!bound.ok) throw new Error(`handshake refused: ${JSON.stringify(bound.error)}`);
const bindingUri = await pinJson(endpointBindingDocument(bound.value));
const bindingPlan = await prepareEndpointBinding({
  reads,
  agentAtom: hiredAtom,
  binding: bound.value,
  documentUri: bindingUri,
  predicates,
});
note('binding planned', {
  bindingUri,
  bindingTriple: bindingPlan.bindingTriple,
  contextTriple: bindingPlan.contextTriple,
});
const bindingCalls: SerialisedCall[] = bindingPlan.calls.map((call) => ({
  ...call,
  value: call.value.toString(),
}));
if (!(await send('binding', bindingCalls, HIRED.ownerKey))) throw new Error('the binding failed');

if (serveOnly && execute) {
  appendFileSync(
    `data/measurements/agent-pulse-walk-${new Date().toISOString().slice(0, 10)}.jsonl`,
    `${log.map((entry) => JSON.stringify(entry, printable)).join('\n')}\n`,
  );
  console.log(`\nThe node of agent ${HIRED.id} is up at ${endpoint} for 30 minutes. Ctrl-C ends it.`);
  await new Promise((resume) => setTimeout(resume, 1_800_000));
  process.exit(0);
}

// The edge the receipt will name.
const firstPlan = await tool('arp_declare_used', {
  agent_chain_id: RAW_KEY_CHAIN_ID,
  agent_token_id: HIRER.id,
  registry,
  tools: [hiredUri],
});
const row = (firstPlan['tools'] as Record<string, unknown>[])[0]; // the server's shape
const usesEdge = (row?.['tripleId'] ?? row?.['triple_id'] ?? row?.['triple']) as Hex | undefined; // checked next
if (usesEdge === undefined) {
  throw new Error(`no edge in the plan: ${JSON.stringify(firstPlan).slice(0, 400)}`);
}
note('edge', { usesEdge });

if (!execute) {
  note('stop', { why: 'dry run: nothing was paid, so nothing further can happen' });
  process.exit(0);
}

// Proof 2: the hire. Paid, answered, signed by the hired node, naming the edge.
const text = readFileSync('docs/12_THE_IDEA.md', 'utf8');
const wallet = createWalletClient({ account: hirer, transport: http(rpcUrl) });
const paymentTxHash = await wallet.sendTransaction({
  to: nodeAccount.address,
  value: PAY,
  chain: null,
});
const paid = await client.waitForTransactionReceipt({ hash: paymentTxHash });
note('paid', { paymentTxHash, status: paid.status });
const payload = { text };
const answer = await fetch(`${endpoint}/task`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    paymentTxHash,
    requesterAddress: hirer.address,
    verifier: hirer.address,
    termId: usesEdge,
    payload,
  }),
  signal: AbortSignal.timeout(60_000),
});
const body = (await answer.json()) as {
  result?: unknown;
  receipt?: SignedHireReceipt;
  error?: string;
}; // checked next
if (!answer.ok || body.receipt === undefined) {
  throw new Error(`the node refused: ${answer.status} ${body.error}`);
}
const verdict = await verifyHireReceipt(body.receipt);
const correct = JSON.stringify(body.result) === JSON.stringify(documentFacts(text));
const about = hireReceiptMatches(body.receipt.receipt, payload, body.result);
note('hired', {
  result: body.result,
  receipt: verdict.status,
  signer: verdict.status === 'valid' ? verdict.signer : null,
  aboutThisExchange: about,
  hirerRecomputedTheAnswer: correct,
});
if (verdict.status !== 'valid' || !about) throw new Error('the receipt is not about this hire');

// Proof 3: the line, with a domain and the outcome the hirer actually checked.
const outcome = correct ? 'worked' : 'failed';
const plan = await tool('arp_declare_used', {
  agent_chain_id: RAW_KEY_CHAIN_ID,
  agent_token_id: HIRER.id,
  registry,
  tools: [hiredUri],
  domain: DOMAIN,
  outcome,
});
if (!(await send('declaration', asCalls(plan), HIRER.key))) {
  throw new Error('the declaration failed');
}

// The receipt, where a stranger can find it from the line. The shape a binding already uses.
const receiptUri = await pinJson(JSON.stringify(body.receipt, printable));
const [atomCost, tripleCost, stake] = await Promise.all([
  reads.atomCost(),
  reads.tripleCost(),
  reads.minDeposit(),
]);
const receiptData = atomDataForUri(receiptUri);
const receiptAtom = await reads.atomId(receiptData);
const attach: SerialisedCall[] = [];
const push = (kind: string, value: bigint, data: Hex, why: string) =>
  attach.push({
    kind,
    chainId: RAW_KEY_CHAIN_ID,
    to: reads.address,
    value: value.toString(),
    data,
    why,
  });
if (!(await reads.termExists(receiptAtom))) {
  push(
    'create-atom',
    atomCost + stake,
    encodeCreateAtom(receiptData, atomCost + stake),
    'the pinned hire receipt',
  );
}
const receiptTriple = await reads.tripleId(receiptAtom, predicates.inContextOf, usesEdge);
if (!(await reads.termExists(receiptTriple))) {
  push(
    'create-triple',
    tripleCost + stake,
    encodeCreateTriple(receiptAtom, predicates.inContextOf, usesEdge, tripleCost + stake),
    '(receipt, in context of, the uses edge)',
  );
}
note('receipt pinned', { receiptUri, receiptAtom, receiptTriple });
if (!(await send('receipt attached', attach, HIRER.key))) {
  throw new Error('attaching the receipt failed');
}

appendFileSync(
  `data/measurements/agent-pulse-walk-${new Date().toISOString().slice(0, 10)}.jsonl`,
  `${log.map((entry) => JSON.stringify(entry, printable)).join('\n')}\n`,
);
console.log('\nThe node stays up for 10 minutes so a reader holding no key can reach it. Ctrl-C ends it.');
await new Promise((resume) => setTimeout(resume, 600_000));
process.exit(0);
