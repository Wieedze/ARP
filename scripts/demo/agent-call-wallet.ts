/** The one tool that lets a test agent pay: an MCP server holding the hirer's key, so the agent never holds it.
 *
 *      ( set -a; source .env; set +a; bun run scripts/demo/agent-call-wallet.ts )
 *
 *  `pay_and_call` asks the node who to pay, pays it, sends the payload, checks the receipt, and returns the result.
 *  With `AGENT_PAID_LINES=1` and `AGENT_PAID_TOKEN`, the receipt names the hirer's `uses` line, and `write_line` writes
 *  that line in form B and attaches the receipt, planned by a real MCP server holding no key.
 *  Testnet 13579 only, checked against the RPC. 0.002 tTRUST at most per call, 0.02 per line and 0.02 of payments per
 *  run of this process, whatever the agent asks. The key is read from the environment variable `AGENT_PAID_KEY` names,
 *  checked against `AGENT_PAID_HIRER` and never printed (ADR `0037`). Every attempt, refused or not, appends to
 *  `data/measurements/agent-paid-<date>.jsonl`.
 */
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

import { createPublicClient, createWalletClient, formatEther, getAddress, http, isAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import deployment from '../../data/deployments/13579.json';
import { canonicalAgentThing, thingUri } from '../../packages/protocol/src/declare/agent-atom.ts';
import { atomDataForUri, encodeCreateAtom, encodeCreateTriple, multiVaultReads } from '../../packages/protocol/src/declare/multivault.ts';
import { budgetRefusal } from '../../packages/protocol/src/declare/usage-context.ts';
import { hireReceiptMatches, verifyHireReceipt, type SignedHireReceipt } from '../../packages/protocol/src/hire-receipt.ts';

import { sendPlan, type SerialisedCall } from '../helpers/send-plan.ts';

const PORT = 3192;
const CHAIN_ID = 13579;
const HIRER = getAddress(process.env['AGENT_PAID_HIRER'] ?? '0x906f3A52ec089f8D4E9127F91C6bE5Ae0d18f91f');
const MAX_PER_CALL = 2_000_000_000_000_000n;
const MAX_PER_PROCESS = 20_000_000_000_000_000n;
const ZERO_TERM = `0x${'0'.repeat(64)}` as Hex;

const KEY_NAME = process.env['AGENT_PAID_KEY'] ?? 'AGENT_PRIVATE_KEY';
const LINES = process.env['AGENT_PAID_LINES'] === '1';
const HIRER_TOKEN = process.env['AGENT_PAID_TOKEN'] ?? '6';
const MAX_PER_LINE = 20_000_000_000_000_000n;
const MCP_PORT = 3193;
const key = process.env[KEY_NAME];
if (!key) throw new Error(`${KEY_NAME} is not set`);
const account = privateKeyToAccount((key.startsWith('0x') ? key : `0x${key}`) as Hex); // a key is hex
if (getAddress(account.address) !== HIRER) throw new Error(`the key signs as ${account.address}, not ${HIRER}`);

const rpcUrl = deployment.chain.rpcUrl;
const client = createPublicClient({ transport: http(rpcUrl) });
if ((await client.getChainId()) !== CHAIN_ID) throw new Error('the RPC is not on 13579');
const wallet = createWalletClient({ account, transport: http(rpcUrl) });

let spent = 0n;
const output = `data/measurements/agent-paid-${new Date().toISOString().slice(0, 10)}.jsonl`;
const record = (row: Record<string, unknown>) =>
  appendFileSync(output, `${JSON.stringify({ at: new Date().toISOString(), scene: process.env['AGENT_PAID_SCENE'] ?? null, ...row })}\n`);

const registry = deployment.arp.identityRegistry as Address; // an address in this repo's record
const inContextOf = deployment.arp.endpointBinding.inContextOf as Hex; // an id in this repo's record
const reads = multiVaultReads({ address: deployment.intuition.multiVault as Address, chainId: CHAIN_ID, rpcUrl }); // same record

// A real MCP server with every tool and no secret, so a plan here is what an agent would be handed.
const planner = LINES
  ? spawn('bun', ['--no-env-file', 'run', 'apps/mcp/src/server.ts'], {
      env: { PATH: process.env['PATH'], HOME: process.env['HOME'], ARP_TARGET: 'testnet', ARP_NO_RECEIPTS: '1', PORT: String(MCP_PORT) },
      stdio: 'ignore',
    })
  : null;
process.on('exit', () => planner?.kill());

type DeclarePlan = {
  tools: { triple_id: Hex }[];
  calls: { kind: string; chain_id: number; to: Hex; value_wei: string; data: Hex; why: string }[];
};
async function planLine(agentToken: string, extra: Record<string, unknown>): Promise<DeclarePlan> {
  const hired = thingUri(canonicalAgentThing(CHAIN_ID, agentToken));
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'arp_declare_used',
      arguments: { agent_chain_id: CHAIN_ID, agent_token_id: HIRER_TOKEN, registry, tools: [hired], declarer: account.address, ...extra },
    },
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${MCP_PORT}/`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      const answer = (await response.json()) as { result?: { content?: { text?: string }[] }; error?: { message?: string } }; // read next
      const text = answer.result?.content?.[0]?.text;
      if (text === undefined) throw new Error(`plan refused: ${answer.error?.message ?? 'no answer'}`);
      return JSON.parse(text) as DeclarePlan; // the server's shape
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('plan refused')) throw error;
      await new Promise((resume) => setTimeout(resume, 500));
    }
  }
  throw new Error('the planning server did not come up');
}

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
  const hash = ((await response.json()) as { data?: { uploadJsonToIpfs?: { hash?: string } } }).data?.uploadJsonToIpfs?.hash; // the API's own shape
  if (hash === undefined) throw new Error(`pinning failed: http ${response.status}`);
  return `ipfs://${hash}`;
}

/** What this process paid for, so a line can only follow a call it made. */
const paidCalls = new Map<string, { agentToken: string; edge: Hex; receipt: SignedHireReceipt; written: boolean }>();

const LINE_TOOL = {
  name: 'write_line',
  description:
    'After a paid call, write publicly and permanently how it went, attached to the receipt of that call. It costs test tokens. ' +
    'domain is one category word, outcome is worked or failed, and a failure can take one reason: missing-key, missing-program, missing-file or not-the-right-tool. Nothing else is written, and never the text of your request.',
  inputSchema: {
    type: 'object',
    properties: {
      payment_hash: { type: 'string', description: 'The hash pay_and_call returned.' },
      domain: { type: 'string' },
      outcome: { type: 'string', enum: ['worked', 'failed'] },
      reason: { type: 'string', enum: ['missing-key', 'missing-program', 'missing-file', 'not-the-right-tool'] },
      budget_wei: { type: 'string', description: 'What you have left to spend, in wei. A line costing more is refused, with its price, and nothing is sent.' },
    },
    required: ['payment_hash', 'domain', 'outcome', 'budget_wei'],
  },
};

async function send(calls: SerialisedCall[]): Promise<string[]> {
  const hashes: string[] = [];
  if (calls.length === 0) return hashes;
  const outcome = await sendPlan({
    calls,
    chainId: CHAIN_ID,
    rpcUrl,
    keyName: KEY_NAME,
    execute: true,
    pauseMs: 1_500,
    onCall: (_index, _call, hash) => hashes.push(hash),
  });
  if (outcome.status !== 'sent') throw new Error(`the plan was ${outcome.status}`);
  return hashes;
}

async function writeLine(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { payment_hash: hash, domain, outcome, reason, budget_wei: budget } = args;
  const refuse = (why: string) => {
    record({ tool: 'write_line', payment_hash: hash, domain, outcome, reason, refused: why });
    return { refused: why };
  };
  const paid = typeof hash === 'string' ? paidCalls.get(hash.toLowerCase()) : undefined;
  if (paid === undefined) return refuse('a line follows a call this tool paid for');
  if (paid.written) return refuse('this call already has its line');
  if (typeof budget !== 'string' || !/^\d{1,78}$/.test(budget)) return refuse('budget_wei must be a decimal string');
  const plan = await planLine(paid.agentToken, {
    domain,
    outcome,
    ...(reason === undefined ? {} : { reason }),
  });
  const calls: SerialisedCall[] = plan.calls.map((call) => ({ kind: call.kind, chainId: call.chain_id, to: call.to, value: call.value_wei, data: call.data, why: call.why }));
  const receiptUri = await pinJson(JSON.stringify(paid.receipt));
  const [atomCost, tripleCost, stake] = await Promise.all([reads.atomCost(), reads.tripleCost(), reads.minDeposit()]);
  const receiptData = atomDataForUri(receiptUri);
  const receiptAtom = await reads.atomId(receiptData);
  const push = (kind: string, value: bigint, data: Hex, why: string) =>
    calls.push({ kind, chainId: CHAIN_ID, to: reads.address, value: value.toString(), data, why });
  if (!(await reads.termExists(receiptAtom))) {
    push('create-atom', atomCost + stake, encodeCreateAtom(receiptData, atomCost + stake), 'the pinned hire receipt');
  }
  const receiptTriple = await reads.tripleId(receiptAtom, inContextOf, paid.edge);
  if (!(await reads.termExists(receiptTriple))) {
    push('create-triple', tripleCost + stake, encodeCreateTriple(receiptAtom, inContextOf, paid.edge, tripleCost + stake), '(receipt, in context of, the uses edge)');
  }
  const total = calls.reduce((sum, call) => sum + BigInt(call.value), 0n);
  if (total > MAX_PER_LINE) return refuse(`this line would cost ${formatEther(total)}, over the limit`);
  const overBudget = budgetRefusal(total, BigInt(budget));
  if (overBudget !== null) {
    record({ tool: 'write_line', payment_hash: hash, domain, outcome, reason, ...overBudget });
    return overBudget;
  }
  const hashes = await send(calls);
  paid.written = true;
  record({ tool: 'write_line', payment_hash: hash, domain, outcome, reason, edge: paid.edge, receiptUri, calls: calls.map((call) => [call.kind, call.why.slice(0, 60)]), costWei: total.toString(), hashes });
  return { written: true, cost_wei: total.toString(), transactions: hashes.length };
}

const TOOL = {
  name: 'pay_and_call',
  description:
    'Pay an agent node from your budget and send it one request. It spends real test tokens and cannot be undone. ' +
    'It pays the address the node itself names, at most 0.002 per call, and returns the answer and whether the signed receipt is about this exchange.',
  inputSchema: {
    type: 'object',
    properties: {
      address: { type: 'string', description: 'The https address of the node.' },
      wei: { type: 'string', description: 'How much to pay, in wei, as a decimal string.' },
      payload: { type: 'object', description: 'The request, in the form the node states.' },
      ...(LINES ? { agent_token_id: { type: 'string', description: "The agent's token id, so the receipt names your line about it." } } : {}),
    },
    required: ['address', 'wei', 'payload'],
  },
};

async function payAndCall(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { address, wei, payload, agent_token_id: agentToken } = args;
  const refuse = (why: string) => {
    record({ tool: 'pay_and_call', address, wei, refused: why });
    return { refused: why };
  };
  if (typeof address !== 'string' || !/^https:\/\/[a-z0-9-]+\.trycloudflare\.com\/?$/.test(address)) {
    return refuse('this test pays only an https quick-tunnel address');
  }
  if (typeof wei !== 'string' || !/^\d{1,30}$/.test(wei)) return refuse('wei must be a decimal string');
  const amount = BigInt(wei);
  if (amount > MAX_PER_CALL) return refuse(`over the limit of ${formatEther(MAX_PER_CALL)} per call`);
  if (spent + amount > MAX_PER_PROCESS) return refuse('over the limit for this test');
  if (LINES && (typeof agentToken !== 'string' || !/^\d+$/.test(agentToken))) return refuse('agent_token_id is required');
  // The line's id, known before it exists, so the receipt can name it.
  const edge = LINES ? (await planLine(agentToken as string, {})).tools[0]?.triple_id : undefined; // a string, checked above
  const base = address.replace(/\/$/, '');
  const health = (await (await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(10_000) })).json()) as {
    agent?: unknown;
    minBudgetWei?: unknown;
  }; // read field by field next
  if (typeof health.agent !== 'string' || !isAddress(health.agent)) return refuse('the node names no agent to pay');
  if (typeof health.minBudgetWei === 'string' && amount < BigInt(health.minBudgetWei)) {
    return refuse(`the node asks at least ${health.minBudgetWei} wei`);
  }
  const hash = await wallet.sendTransaction({ to: health.agent, value: amount, chain: null });
  const mined = await client.waitForTransactionReceipt({ hash });
  spent += amount;
  if (mined.status !== 'success') {
    record({ tool: 'pay_and_call', address, wei, hash, status: mined.status });
    return { paid: false, hash, status: mined.status };
  }
  const answer = await fetch(`${base}/task`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paymentTxHash: hash, requesterAddress: account.address, verifier: account.address, termId: edge ?? ZERO_TERM, payload }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await answer.json()) as { result?: unknown; receipt?: SignedHireReceipt; error?: string }; // read next
  const verdict = body.receipt === undefined ? null : await verifyHireReceipt(body.receipt);
  const receiptOk =
    verdict?.status === 'valid' &&
    body.receipt !== undefined &&
    getAddress(verdict.signer) === getAddress(health.agent) &&
    hireReceiptMatches(body.receipt.receipt, payload, body.result);
  if (LINES && edge !== undefined && body.receipt !== undefined && receiptOk) {
    paidCalls.set(hash.toLowerCase(), { agentToken: agentToken as string, edge, receipt: body.receipt, written: false }); // a string, checked above
  }
  record({ tool: 'pay_and_call', address, wei, payload, hash, http: answer.status, result: body.result, error: body.error, receiptOk, spent: spent.toString() });
  return { paid: true, hash, paid_wei: wei, http: answer.status, result: body.result ?? null, error: body.error ?? null, receipt_is_about_this_exchange: receiptOk };
}

Bun.serve({
  port: PORT,
  hostname: '127.0.0.1',
  fetch: async (request) => {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const message = (await request.json()) as { id?: number | string; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } }; // JSON-RPC, read next
    const reply = (result: unknown) => Response.json({ jsonrpc: '2.0', id: message.id ?? null, result });
    if (message.id === undefined) return new Response(null, { status: 202 });
    if (message.method === 'initialize') {
      return reply({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'wallet', version: '0' } });
    }
    if (message.method === 'tools/list') return reply({ tools: LINES ? [TOOL, LINE_TOOL] : [TOOL] });
    if (message.method === 'tools/call' && message.params?.name === TOOL.name) {
      try {
        const out = await payAndCall(message.params.arguments ?? {});
        return reply({ content: [{ type: 'text', text: JSON.stringify(out) }] });
      } catch (error) {
        const text = error instanceof Error ? error.message.slice(0, 300) : String(error);
        record({ tool: 'pay_and_call', failed: text });
        return reply({ content: [{ type: 'text', text: JSON.stringify({ failed: text }) }], isError: true });
      }
    }
    if (LINES && message.method === 'tools/call' && message.params?.name === LINE_TOOL.name) {
      try {
        const out = await writeLine(message.params.arguments ?? {});
        return reply({ content: [{ type: 'text', text: JSON.stringify(out) }] });
      } catch (error) {
        const text = error instanceof Error ? error.message.slice(0, 300) : String(error);
        record({ tool: 'write_line', failed: text });
        return reply({ content: [{ type: 'text', text: JSON.stringify({ failed: text }) }], isError: true });
      }
    }
    return Response.json({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'unknown method' } });
  },
});
console.log(`wallet tool for ${account.address} on 127.0.0.1:${PORT}, ${formatEther(MAX_PER_PROCESS)} at most. Ctrl-C ends it.`);
