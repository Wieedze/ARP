/** ARP's MCP server — the surface an agent reads tool reputation through, and declares through.
 *
 *  Phase 1 of `docs/15_ROADMAP.md`, the first half of `tasks/16`.
 *
 *      bun run scripts/arp-mcp-server.ts                      # mainnet 1155, listens on :3002
 *      ARP_TARGET=testnet bun run scripts/arp-mcp-server.ts   # testnet 13579
 *      PORT=4000 bun run scripts/arp-mcp-server.ts
 *
 *  MCP over HTTP is JSON-RPC with three methods — `initialize`, `tools/list`, `tools/call` — so it
 *  is hand-rolled rather than pulling a dependency. `erc8004` holds the protocol logic; this file is
 *  a transport over it, which is why it lives in `scripts/` and not in the connector
 *  (`rules/portability.md`).
 *
 *  **It signs nothing and sends nothing.** One tool reads. The two planners return prepared calls
 *  for the agent to sign with its own key — ARP holds no key, so it cannot spend an operator's
 *  TRUST even by mistake (ADR `0038`), which is what makes "ARP is not a party" (ADR `0035`) a
 *  property rather than a promise.
 *
 *  Two things it is deliberately not:
 *    - not in anyone's runtime. The agent *chooses* to call it. That is the whole difference between
 *      a connector and an integration, and `docs/12` lists the alternative as a drift signal.
 *    - not a scorer. It returns what was staked and by whom, with provenance. Composing that into a
 *      single number is a decision nobody has made (`docs/01` rejects being one more score).
 */

import { readFileSync } from 'node:fs';

import {
  intuitionToolAtomLookup,
  multiVaultReads,
  prepareDeclareUsed,
  prepareStakeOnUsed,
  resolveDeclarationSubject,
  type DeclarePlan,
  type PreparedCall,
  type StakePlan,
} from '../packages/protocol/src/declare/index.js';
import { getToolUsage, type ToolUsage } from '../packages/protocol/src/tool-usage.js';
import { TOOLS } from './arp-mcp-tools.js';

const PORT = Number(process.env.PORT ?? 3002);
const PROTOCOL_VERSION = '2025-06-18';

/**
 * Which chain this server plans against — config with a default, never a module constant.
 *
 * `rules/portability.md` rule 1, and rule 3 is why it matters here: a triple costs 0.1 TRUST on
 * 1155 and 0.001 on 13579. The addresses and URLs come from `deployments/<chainId>.json` at
 * startup, read rather than imported, so a mainnet server cannot be served a testnet constant.
 */
const TARGETS = { mainnet: 1155, testnet: 13579 } as const;
const targetName = (process.env.ARP_TARGET ?? 'mainnet') as keyof typeof TARGETS;
const chainId = TARGETS[targetName];
if (chainId === undefined) {
  console.error(`ARP_TARGET must be one of ${Object.keys(TARGETS).join(', ')}`);
  process.exit(1);
}

type DeploymentRecord = {
  chain?: { rpcUrl?: string; graphqlUrl?: string; name?: string };
  intuition?: { multiVault?: string };
};

const record = JSON.parse(
  readFileSync(new URL(`../deployments/${chainId}.json`, import.meta.url), 'utf8'),
) as DeploymentRecord;

const GRAPHQL_URL = process.env.INTUITION_GRAPHQL_URL ?? record.chain?.graphqlUrl;
const RPC_URL = process.env.INTUITION_RPC_URL ?? record.chain?.rpcUrl;
const MULTI_VAULT = (process.env.ARP_MULTI_VAULT ?? record.intuition?.multiVault) as
  | `0x${string}`
  | undefined;

if (!GRAPHQL_URL || !RPC_URL || !MULTI_VAULT) {
  console.error(`deployments/${chainId}.json is missing a graphqlUrl, rpcUrl or multiVault`);
  process.exit(1);
}

const reads = multiVaultReads({ address: MULTI_VAULT, chainId, rpcUrl: RPC_URL });

/**
 * So an `https://` tool reuses the atom it already has instead of minting a metadata-less one
 * beside it. Measured: 78 of the 84 tool atoms on mainnet `uses` edges are `ipfs://` and 77 resolve
 * a pinned Thing. A graph read, no credential.
 */
const toolAtoms = intuitionToolAtomLookup({ graphqlUrl: GRAPHQL_URL });

type JsonRpcId = string | number | null;
type Rpc = { jsonrpc?: string; id?: JsonRpcId; method?: string; params?: Record<string, unknown> };

function result(id: JsonRpcId, value: unknown) {
  return Response.json({ jsonrpc: '2.0', id, result: value });
}

/** JSON-RPC error codes. -32602 is invalid params, -32601 method not found, -32603 internal. */
function fail(id: JsonRpcId, code: number, message: string) {
  return Response.json({ jsonrpc: '2.0', id, error: { code, message } });
}

function text(id: JsonRpcId, value: unknown) {
  return result(id, { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
}

/** Amounts are strings: a TRUST figure does not survive JSON's number type. */
function serialise(usage: ToolUsage) {
  const side = (s: { totalAssets: bigint | null; positionCount: number | null }) => ({
    total_assets_wei: (s.totalAssets ?? 0n).toString(),
    position_count: s.positionCount ?? 0,
  });
  return {
    tool_atom_id: usage.toolAtomId,
    label: usage.label,
    pinned_uri: usage.pinnedUri,
    totals: {
      support_assets_wei: usage.totals.supportAssets.toString(),
      oppose_assets_wei: usage.totals.opposeAssets.toString(),
      support_positions: usage.totals.supportPositions,
      oppose_positions: usage.totals.opposePositions,
    },
    edges: usage.edges.map((e) => ({
      triple_id: e.tripleId,
      agent: e.agent,
      support: side(e.support),
      oppose: side(e.oppose),
      // The tier a reader must not flatten: an edge with no stake behind it is not weak
      // evidence, it is none (docs/14).
      staked: (e.support.totalAssets ?? 0n) > 0n,
    })),
    provenance: usage.provenance,
    caveat:
      'Each edge is an assertion somebody wrote; the market prices it. An edge with ' +
      'staked=false carries no weight at all. ARP composes no score.',
  };
}

const serialiseCall = (call: PreparedCall) => ({
  kind: call.kind,
  // On every call, not only on the plan: each MultiVault is codeless on the other chain, and a
  // value-bearing call to a codeless address succeeds as a plain transfer instead of reverting.
  chain_id: call.chainId,
  to: call.to,
  value_wei: call.value.toString(),
  data: call.data,
  why: call.why,
});

/** Said on every plan, because a caller who assumes ARP executed it will not check that it did. */
const UNSIGNED_CAVEAT =
  'These calls are UNSIGNED and nothing has been sent. ARP holds no key and has no send ' +
  'path: sign them with your own wallet, in the order given, and send them yourself. ' +
  'Creating a term costs a non-recoverable fee — compare total_value_wei against your budget ' +
  'first.';

function serialiseDeclarePlan(plan: DeclarePlan) {
  return {
    chain_id: plan.chainId,
    subject_atom_id: plan.subject,
    predicate_term_id: plan.predicate,
    tools: plan.tools.map((tool) => ({
      uri: tool.uri,
      atom_id: tool.atomId,
      atom_source: tool.atomSource,
      triple_id: tool.tripleId,
      atom_exists: tool.atomExists,
      triple_exists: tool.tripleExists,
      ...(tool.bareUrlWarning === undefined ? {} : { bare_url_warning: tool.bareUrlWarning }),
    })),
    calls: plan.calls.map(serialiseCall),
    existing_terms: plan.existingTerms,
    total_value_wei: plan.totalValue.toString(),
    caveat: UNSIGNED_CAVEAT,
  };
}

function serialiseStakePlan(plan: StakePlan) {
  return {
    chain_id: plan.chainId,
    curve_id: plan.curveId.toString(),
    min_deposit_wei: plan.minDeposit.toString(),
    targets: plan.targets.map((target) => ({
      triple_id: target.tripleId,
      receiver: target.receiver,
      amount_wei: target.amount.toString(),
      exists: target.exists,
    })),
    calls: plan.calls.map(serialiseCall),
    total_value_wei: plan.totalValue.toString(),
    caveat: UNSIGNED_CAVEAT,
  };
}

const isTermId = (value: unknown): value is `0x${string}` =>
  typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
const isAddress = (value: unknown): value is `0x${string}` =>
  typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);

async function toolReputation(id: JsonRpcId, args: Record<string, unknown>) {
  const toolAtomId = args['tool_atom_id'];
  if (!isTermId(toolAtomId)) {
    return fail(id, -32602, 'tool_atom_id must be a 0x-prefixed 32-byte hex string');
  }
  const attestedBy = typeof args['attested_by'] === 'string' ? args['attested_by'] : undefined;
  const usage = await getToolUsage(toolAtomId, {
    graphqlUrl: GRAPHQL_URL,
    ...(attestedBy === undefined ? {} : { attestedBy }),
  });
  return text(id, serialise(usage));
}

async function declareUsed(id: JsonRpcId, args: Record<string, unknown>) {
  const agentChainId = args['agent_chain_id'];
  const agentTokenId = args['agent_token_id'];
  const tools = args['tools'];
  if (typeof agentChainId !== 'number' || !Number.isInteger(agentChainId) || agentChainId <= 0) {
    return fail(id, -32602, 'agent_chain_id must be a positive integer');
  }
  if (typeof agentTokenId !== 'string' || !/^\d+$/.test(agentTokenId)) {
    return fail(id, -32602, 'agent_token_id must be a decimal string');
  }
  if (!Array.isArray(tools) || tools.some((tool) => typeof tool !== 'string')) {
    return fail(id, -32602, 'tools must be an array of URI strings');
  }

  const subject = await resolveDeclarationSubject({
    agent: { chainId: agentChainId, tokenId: agentTokenId },
    graphqlUrl: GRAPHQL_URL,
  });
  const plan = await prepareDeclareUsed({
    subject,
    tools: tools as string[],
    reads,
    lookup: toolAtoms,
  });
  return text(id, serialiseDeclarePlan(plan));
}

async function stakeOnUsed(id: JsonRpcId, args: Record<string, unknown>) {
  const receiver = args['receiver'];
  const targets = args['targets'];
  if (!isAddress(receiver)) return fail(id, -32602, 'receiver must be a 20-byte hex address');
  if (!Array.isArray(targets) || targets.length === 0) {
    return fail(id, -32602, 'targets must be a non-empty array');
  }

  const parsed: { tripleId: `0x${string}`; amount: bigint }[] = [];
  for (const target of targets) {
    const row = target as Record<string, unknown>;
    if (!isTermId(row['triple_id'])) {
      return fail(id, -32602, 'each target needs a triple_id of 0x + 32 bytes');
    }
    const amountRaw = row['amount_wei'];
    if (typeof amountRaw !== 'string' || !/^\d+$/.test(amountRaw)) {
      return fail(id, -32602, 'each target needs amount_wei as a decimal string of wei');
    }
    parsed.push({ tripleId: row['triple_id'], amount: BigInt(amountRaw) });
  }

  const plan = await prepareStakeOnUsed({ targets: parsed, receiver, reads });
  return text(id, serialiseStakePlan(plan));
}

async function callTool(id: JsonRpcId, params: Record<string, unknown> | undefined) {
  const name = typeof params?.['name'] === 'string' ? params['name'] : null;
  const args = (params?.['arguments'] ?? {}) as Record<string, unknown>;
  try {
    switch (name) {
      case 'arp_tool_reputation':
        return await toolReputation(id, args);
      case 'arp_declare_used':
        return await declareUsed(id, args);
      case 'arp_stake_on_used':
        return await stakeOnUsed(id, args);
      default:
        return fail(id, -32602, `unknown tool: ${String(name)}`);
    }
  } catch (error) {
    // The message, not a stack: a caller gets enough to retry or report, nothing about our host.
    return fail(id, -32603, `${String(name)} failed: ${String(error).slice(0, 300)}`);
  }
}

export const handler = {
  port: PORT,
  async fetch(request: Request) {
    if (request.method === 'GET') {
      // Not part of MCP. A plain GET is what the verifier's non-protocol probe sends, and
      // answering it makes this endpoint `live` rather than `dead` for that path too.
      return Response.json({
        name: 'ARP',
        description: 'Agent and tool reputation over the Intuition knowledge graph.',
        mcp: { protocolVersion: PROTOCOL_VERSION, tools: TOOLS.map((t) => t.name) },
        chain: { id: chainId, name: record.chain?.name ?? null },
      });
    }
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });

    let body: Rpc;
    try {
      body = (await request.json()) as Rpc;
    } catch {
      return fail(null, -32700, 'parse error');
    }
    const id = body.id ?? null;

    switch (body.method) {
      case 'initialize':
        return result(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'ARP', version: '0.2.0' },
          instructions:
            'Read what agents staked on using a tool, and plan your own declarations. ' +
            'Amounts come with position counts; an edge with staked=false carries no weight. ' +
            'The planners return UNSIGNED calls — ARP holds no key and sends nothing. ' +
            'ARP composes no score.',
        });
      case 'notifications/initialized':
        // A notification has no id and takes no response body.
        return new Response(null, { status: 202 });
      case 'tools/list':
        return result(id, { tools: TOOLS });
      case 'tools/call':
        return callTool(id, body.params);
      case 'ping':
        return result(id, {});
      default:
        return fail(id, -32601, `method not found: ${String(body.method)}`);
    }
  },
};

if (import.meta.main) {
  const server = Bun.serve(handler);
  console.log(`ARP MCP server on http://localhost:${server.port}`);
  console.log(
    `  chain:      ${chainId} (${record.chain?.name ?? 'unknown'}) via ARP_TARGET=${targetName}`,
  );
  console.log(`  graph:      ${GRAPHQL_URL}`);
  console.log(`  rpc:        ${RPC_URL}`);
  console.log(`  multivault: ${MULTI_VAULT}`);
  console.log(`  tools:      ${TOOLS.map((t) => t.name).join(', ')}`);
  console.log(`\nsigns nothing, sends nothing — the planners return calls for your own key.`);
}
