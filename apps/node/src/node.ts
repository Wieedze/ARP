/** The inbound half of the node — what makes an agent reachable, and the receipt that lets the
 *  caller rate it afterwards.
 *
 *      AGENT_NODE_PORT=3100 bun run apps/node/src/node.ts
 *      curl -s localhost:3100/healthz
 *
 *  **Why it exists.** Declaring and staking are things an agent does *outward*: it calls, nothing
 *  needs to reach it. Being hired is the other direction, and for that something has to listen at an
 *  address the agent publishes in its ERC-8004 registration file. ARP can verify such an endpoint —
 *  that is the verifier — and cannot provide one. This is the code an operator runs so that theirs
 *  exists (ADR `0045`).
 *
 *  **It signs receipts and never transactions.** The agent key is here because a receipt must be
 *  signed by the agent, and a signature is not a spend. There is no send path in this file: no
 *  `sendTransaction`, no `writeContract`, no deposit. A caller who wants the agent to stake gets a
 *  prepared plan from the connector and the agent's own runtime signs it (ADR `0038`).
 *
 *  **The payment is the point of the payment.** A free request proves nothing and a rating of a free
 *  request is worth what a star is worth. So the node checks, before doing any work, that a real
 *  transaction moved real value from the declared requester to this agent. That check is what turns
 *  the caller's later `(requester, uses, agent)` declaration from an opinion into something anchored
 *  to a fact — `docs/14:159`'s top rung is "payment, on-chain call, or delegation redemption".
 *
 *  **The work is the operator's.** `ARP_NODE_HANDLER` points at a module exporting
 *  `handle(payload, context)`. Without one the node echoes, which is enough to prove the protocol
 *  and proves nothing about an agent.
 *
 *  **The receipt is EIP-712** (`@arp-protocol/core`, `hire-receipt.ts`): the payment's chain in the
 *  domain, the agent as ERC-8004 names it (`AGENT_REGISTRY` + `AGENT_ID`), the payment as the nonce.
 *
 *  **One payment, one job.** Every accepted payment is appended to `AGENT_NODE_LEDGER`
 *  (`.arp/node-payments.jsonl` by default) and refused the second time — `task.ts`.
 *
 *  **It binds `127.0.0.1`, and a tunnel the operator rents is the one way in** (task 39a, ADR
 *  `0094`): `cloudflared` or `ngrok`, detected on `PATH` or named by `ARP_NODE_TUNNEL`, or one the
 *  operator runs and names with `ARP_NODE_PUBLIC_URL`. `tunnel.ts` says which. ARP builds no relay.
 *
 *  **The key** is `AGENT_PRIVATE_KEY` when set, else the node key in `~/.arp/node.key`, generated on
 *  first start (`node-key.ts`). It is the key `arp init --node` binds to the agent.
 */
import { join } from 'node:path';

import { serveFetch } from '@arp-protocol/core/node';

import { createPublicClient, formatEther, http, parseEther } from 'viem';

import { resolveNodeKey } from './node-key.ts';

import {
  type AgentIdentity,
  createNode,
  DEFAULT_LIMITS,
  echo,
  type NodeLimits,
  PaymentLedger,
  type TaskHandler,
} from './task.ts';
import { chooseTunnel, clientAddress, startTunnel } from './tunnel.ts';

export type { TaskContext, TaskHandler } from './task.ts';

const PORT = Number(process.env.AGENT_NODE_PORT ?? 3100);
const MIN_BUDGET = parseEther(process.env.AGENT_NODE_MIN_BUDGET ?? '0.001');
const LEDGER = process.env.AGENT_NODE_LEDGER ?? join(process.cwd(), '.arp', 'node-payments.jsonl');

function positive(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    console.error(`${name} must be a positive integer, got ${raw}`);
    process.exit(1);
  }
  return value;
}
const LIMITS: NodeLimits = {
  maxBodyBytes: positive('AGENT_NODE_MAX_BODY_BYTES', DEFAULT_LIMITS.maxBodyBytes),
  handlerTimeoutMs: positive('AGENT_NODE_HANDLER_TIMEOUT_MS', DEFAULT_LIMITS.handlerTimeoutMs),
  requestsPerMinute: positive('AGENT_NODE_RATE_LIMIT', DEFAULT_LIMITS.requestsPerMinute),
};

const rpcUrl = process.env.INTUITION_RPC_URL ?? process.env.INTUITION_TESTNET_RPC_URL;
if (!rpcUrl) {
  console.error('no RPC: set INTUITION_RPC_URL or INTUITION_TESTNET_RPC_URL');
  process.exit(1);
}
let nodeKey: ReturnType<typeof resolveNodeKey>;
try {
  nodeKey = resolveNodeKey(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const account = nodeKey.account;

/**
 * Who the receipt says signed. Both or neither: `AGENT_REGISTRY` is the string the agent's
 * registration file carries (`eip155:<chainId>:<identityRegistry>`), `AGENT_ID` its token id.
 * Without them the receipt is signed by a key and names no ERC-8004 identity.
 */
function identityFromEnv(): AgentIdentity | null {
  const registry = process.env.AGENT_REGISTRY;
  const id = process.env.AGENT_ID;
  if (registry === undefined && id === undefined) return null;
  if (registry === undefined || id === undefined) {
    console.error('set AGENT_REGISTRY and AGENT_ID together, or neither');
    process.exit(1);
  }
  if (!/^eip155:[1-9][0-9]*:0x[0-9a-fA-F]{40}$/.test(registry) || !/^(0|[1-9][0-9]*)$/.test(id)) {
    console.error(
      'AGENT_REGISTRY must be eip155:<chainId>:<address> and AGENT_ID a decimal token id',
    );
    process.exit(1);
  }
  return { agentRegistry: registry, agentId: BigInt(id) };
}
const identity = identityFromEnv();

const handlerPath = process.env.ARP_NODE_HANDLER;
let handle: TaskHandler = echo;
if (handlerPath !== undefined) {
  const module = (await import(handlerPath)) as { handle?: TaskHandler };
  if (typeof module.handle !== 'function') {
    console.error(`${handlerPath} does not export a \`handle\` function`);
    process.exit(1);
  }
  handle = module.handle;
}

const publicClient = createPublicClient({ transport: http(rpcUrl) });
const chainId = await publicClient.getChainId();

const node = createNode({
  account,
  publicClient,
  chainId,
  identity,
  minBudget: MIN_BUDGET,
  handle,
  handlerPath: handlerPath ?? null,
  ledger: new PaymentLedger(LEDGER),
  limits: LIMITS,
});

/**
 * Start the node. `arp node` calls this (`apps/cli`); `bun src/node.ts` reaches it through
 * `import.meta.main`, which Node 22 does not set.
 *
 * Loopback only. Until 2026-10-30 it passed no hostname and listened on every interface, because it
 * was the address the agent published; the tunnel is that address now, and nothing else should
 * reach the port.
 */
export async function main(): Promise<void> {
  const tunnel = chooseTunnel(process.env);
  if (tunnel instanceof Error) {
    process.stderr.write(`${tunnel.message}\n`);
    process.exit(1);
  }
  await serveFetch(
    { port: PORT, hostname: '127.0.0.1', maxBodyBytes: LIMITS.maxBodyBytes },
    (request, ip) => node.fetch(request, clientAddress(request, ip)),
  );
  const local = `http://127.0.0.1:${PORT}`;
  let running: Awaited<ReturnType<typeof startTunnel>>;
  try {
    running = await startTunnel(tunnel, local, {
      onDown: (code) =>
        process.stderr.write(`tunnel exited (${code ?? 'signal'}); the node is unreachable\n`),
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      running.stop();
      process.exit(0);
    });
  }
  process.on('exit', () => running.stop());

  process.stderr.write(`agent node on ${local}\n`);
  process.stderr.write(
    `  public     ${running.publicUrl ?? 'none (ARP_NODE_TUNNEL=none): localhost only'}${running.publicUrl !== null && !running.stable ? ' — changes on every start; bind a named tunnel with ARP_NODE_PUBLIC_URL' : ''}\n`,
  );
  process.stderr.write(`  tunnel     ${tunnel.kind}\n`);
  process.stderr.write(`  agent      ${account.address}\n`);
  process.stderr.write(
    `  key        ${nodeKey.source === 'env' ? 'AGENT_PRIVATE_KEY' : `${nodeKey.path}${nodeKey.created ? ' (created)' : ''}`}\n`,
  );
  process.stderr.write(`  min budget ${formatEther(MIN_BUDGET)}\n`);
  process.stderr.write(`  handler    ${handlerPath ?? 'echo (no handler configured)'}\n`);
  process.stderr.write(`  chain      ${chainId}\n`);
  process.stderr.write(
    `  identity   ${identity === null ? 'none (AGENT_REGISTRY / AGENT_ID unset)' : `${identity.agentRegistry} #${identity.agentId}`}\n`,
  );
  process.stderr.write(`  ledger     ${LEDGER}\n`);
  process.stderr.write(
    `  limits     ${LIMITS.maxBodyBytes} B body, ${LIMITS.handlerTimeoutMs} ms handler, ${LIMITS.requestsPerMinute}/min per client\n`,
  );
  process.stderr.write(`\nIt signs receipts and never transactions.\n`);
}

if (import.meta.main) await main();
