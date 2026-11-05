/** The one tool that lets a test agent pay: an MCP server holding the hirer's key, so the agent never holds it.
 *
 *      ( set -a; source .env; set +a; bun run scripts/demo/agent-call-wallet.ts )
 *
 *  One tool, `pay_and_call`: it asks the node who to pay, pays it, sends the payload, checks the receipt, and returns
 *  the result. Testnet 13579 only, checked against the RPC. 0.002 tTRUST at most per call and 0.02 per run of this
 *  process, whatever the agent asks. The key is read from the environment, checked against `HIRER` and never printed
 *  (ADR `0037`). Every attempt, refused or not, appends to `data/measurements/agent-paid-<date>.jsonl`.
 */
import { appendFileSync } from 'node:fs';

import { createPublicClient, createWalletClient, formatEther, getAddress, http, isAddress, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import deployment from '../../data/deployments/13579.json';
import { hireReceiptMatches, verifyHireReceipt, type SignedHireReceipt } from '../../packages/protocol/src/hire-receipt.ts';

const PORT = 3192;
const CHAIN_ID = 13579;
const HIRER = getAddress(process.env['AGENT_PAID_HIRER'] ?? '0x906f3A52ec089f8D4E9127F91C6bE5Ae0d18f91f');
const MAX_PER_CALL = 2_000_000_000_000_000n;
const MAX_PER_PROCESS = 20_000_000_000_000_000n;
const ZERO_TERM = `0x${'0'.repeat(64)}` as Hex;

const key = process.env['AGENT_PRIVATE_KEY'];
if (!key) throw new Error('AGENT_PRIVATE_KEY is not set');
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
    },
    required: ['address', 'wei', 'payload'],
  },
};

async function payAndCall(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { address, wei, payload } = args;
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
    body: JSON.stringify({ paymentTxHash: hash, requesterAddress: account.address, verifier: account.address, termId: ZERO_TERM, payload }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await answer.json()) as { result?: unknown; receipt?: SignedHireReceipt; error?: string }; // read next
  const verdict = body.receipt === undefined ? null : await verifyHireReceipt(body.receipt);
  const receiptOk =
    verdict?.status === 'valid' &&
    body.receipt !== undefined &&
    getAddress(verdict.signer) === getAddress(health.agent) &&
    hireReceiptMatches(body.receipt.receipt, payload, body.result);
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
    if (message.method === 'tools/list') return reply({ tools: [TOOL] });
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
    return Response.json({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'unknown method' } });
  },
});
console.log(`wallet tool for ${account.address} on 127.0.0.1:${PORT}, ${formatEther(MAX_PER_PROCESS)} at most. Ctrl-C ends it.`);
