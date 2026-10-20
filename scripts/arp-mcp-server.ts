/** ARP's MCP node — the surface an agent reads tool reputation through, and declares through.
 *
 *  Phase 1 of `docs/15_ROADMAP.md`, the first half of `tasks/16`. **Run it yourself** (ADR `0045`):
 *  the invariant is that ARP is never in the path of a request, and code on the operator's machine
 *  is not in the path while a host they must reach is.
 *
 *      bun run scripts/arp-mcp-server.ts --stdio              # for an MCP client to launch
 *      bun run scripts/arp-mcp-server.ts                      # mainnet 1155, listens on :3002
 *      ARP_TARGET=testnet bun run scripts/arp-mcp-server.ts   # testnet 13579
 *      PORT=4000 bun run scripts/arp-mcp-server.ts
 *
 *  Two transports over **one** dispatch: `handler.fetch` is the only place a method is handled, and
 *  the stdio loop wraps it rather than re-implementing it. In stdio mode **stdout is the protocol
 *  channel**, so every diagnostic goes to stderr — a stray `console.log` there corrupts the stream.
 *
 *  MCP over HTTP is JSON-RPC with three methods — `initialize`, `tools/list`, `tools/call` — so it
 *  is hand-rolled rather than pulling a dependency. `@arp-protocol/core` holds the protocol logic; this file is
 *  a transport over it, which is why it lives in `scripts/` and not in the connector
 *  (`rules/portability.md`).
 *
 *  **It signs nothing and sends nothing.** One tool reads. The two planners return prepared calls
 *  for the agent to sign with its own key — ARP holds no key, so it cannot spend an operator's
 *  TRUST even by mistake (ADR `0038`), which is what makes "ARP is not a party" (ADR `0035`) a
 *  property rather than a promise.
 *
 *  Two things it is deliberately not:
 *    - not meant to be a host an agent depends on — and today it is one. Planning lives here: atom
 *      resolution, the refuse-on-ambiguous rule, the cost reads. If this process is down an agent
 *      cannot build its plan. "The agent chooses to call it", which this comment used to argue, is
 *      true of signing and false of planning. ADR `0045` moves this to a node the operator runs; the
 *      dependency is real until then and is stated here rather than defended.
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
import { toCaip19 } from '../packages/protocol/src/caip.js';
import { createErc8004Client } from '../packages/protocol/src/client.js';
import { listAgents } from '../packages/protocol/src/listing.js';
import { intuitionSource } from '../packages/protocol/src/sources/intuition/index.js';
import type { AgentListOrder } from '../packages/protocol/src/types.js';
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
 * beside it. Measured by `scripts/measure-tool-atom-shape.ts`: 78 of the 84 tool atoms on mainnet
 * `uses` edges are `ipfs://` and 77 of those resolve a pinned Thing. A graph read, no credential.
 */
const toolAtoms = intuitionToolAtomLookup({ graphqlUrl: GRAPHQL_URL });

/**
 * The directory read, pointed at the same graph as everything else here.
 *
 * Only the Intuition source: the registry source answers per-agent questions and cannot list, and
 * `listAgents` throws `NoListingSourceError` rather than silently returning an empty page when no
 * source can. Explicit about `graphqlUrl` because the default is mainnet, and a testnet node
 * serving a mainnet directory is the kind of mix-up `rules/portability.md` rule 1 exists for.
 */
const directory = createErc8004Client({
  sources: [intuitionSource({ graphqlUrl: GRAPHQL_URL })],
});

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
      //
      // Keyed on the POSITION COUNT, not the assets. Creating a triple seeds its vault with
      // `minShare`, so `total_assets` is never zero for an edge that exists — measured on mainnet
      // 2026-10-19, every unbacked IPFS edge reports exactly 1000000 wei with zero positions. This
      // line read `totalAssets > 0n` and so answered `staked: true` for all 7 of IPFS's edges,
      // including the 4 nobody has backed. The caveat below promises the flag means something; it
      // did not. ADR `0042`.
      staked: (e.support.positionCount ?? 0) > 0,
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

/**
 * Does this agent have an identity atom — the thing a `uses` edge must carry as its subject?
 *
 * The most useful read here, because of what `scripts/measure-cohort-coverage.ts` measures: the atom
 * is written by Intuition's **mirror**, the mirror holds 28,648, and the Base registry's highest
 * minted id was 309,925 on 2026-10-20. So for roughly nine agents in ten the answer is **no**, and
 * every other tool on this server fails for them until it is yes (ADR `0047`).
 *
 * A read. No credential, nothing signed. It reports the gap rather than closing it, because closing
 * it is a write — but the id is knowable either way: the atom's id is a pure function of the agent's
 * identity, computed locally by `agent-atom.ts` with no key and no network. Pinning only makes the
 * document readable, and anyone can pin the same bytes (ADR `0047`).
 */
async function identity(id: JsonRpcId, args: Record<string, unknown>) {
  const agentChainId = args['agent_chain_id'];
  const agentTokenId = args['agent_token_id'];
  if (typeof agentChainId !== 'number' || !Number.isInteger(agentChainId) || agentChainId <= 0) {
    return fail(id, -32602, 'agent_chain_id must be a positive integer');
  }
  if (typeof agentTokenId !== 'string' || !/^\d+$/.test(agentTokenId)) {
    return fail(id, -32602, 'agent_token_id must be a decimal string');
  }
  const registryRaw = args['registry'];
  if (registryRaw !== undefined && !isAddress(registryRaw)) {
    return fail(id, -32602, 'registry, when given, must be a 20-byte hex address');
  }
  const agent = {
    chainId: agentChainId,
    tokenId: agentTokenId,
    ...(registryRaw === undefined ? {} : { registry: registryRaw }),
  };

  try {
    const subject = await resolveDeclarationSubject({ agent, graphqlUrl: GRAPHQL_URL });
    return text(id, {
      caip19: toCaip19(agent),
      identity_atom: subject,
      declarable: true,
      note: 'This agent can declare. Its identity atom is the subject every `uses` edge carries.',
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'NoAgentIdentityError') {
      return text(id, {
        caip19: toCaip19(agent),
        identity_atom: null,
        declarable: false,
        note:
          'No identity atom on the graph, so this agent cannot declare yet. The atom is written ' +
          "by Intuition's mirror; measured 2026-10-20 the mirror holds 28,648 of a registry whose " +
          'highest minted id is 309,925, so this is the common case and not a fault of yours. ' +
          'Writing it needs two atoms and a `same as` triple — `scripts/agent-identity-atom.ts`, ' +
          'ADR 0047. The atom ids are computable locally from your identity alone, with no API key.',
      });
    }
    throw error;
  }
}

/**
 * The directory: agents the graph holds, in the order the caller asks for.
 *
 * Two orders, and the names say what they measure rather than implying a ranking: how **many**
 * statements a source holds about an agent, or how much TRUST sits on its own atom. Neither is a
 * score and this server composes none (ADR `0046`) — a caller that wants one has the parts.
 *
 * `total` is the cohort's size from the source's own aggregate, never `agents.length`, so a page of
 * 25 out of 28,648 cannot read as 25 agents existing.
 */
async function findAgents(id: JsonRpcId, args: Record<string, unknown>) {
  const orderRaw = args['order'] ?? 'evidence-quantity';
  if (orderRaw !== 'evidence-quantity' && orderRaw !== 'economic-conviction') {
    return fail(id, -32602, "order must be 'evidence-quantity' or 'economic-conviction'");
  }
  const limitRaw = args['limit'] ?? 25;
  if (
    typeof limitRaw !== 'number' ||
    !Number.isInteger(limitRaw) ||
    limitRaw < 1 ||
    limitRaw > 100
  ) {
    return fail(id, -32602, 'limit must be an integer between 1 and 100');
  }
  const offsetRaw = args['offset'] ?? 0;
  if (typeof offsetRaw !== 'number' || !Number.isInteger(offsetRaw) || offsetRaw < 0) {
    return fail(id, -32602, 'offset must be a non-negative integer');
  }

  const page = await listAgents(directory, {
    order: orderRaw as AgentListOrder,
    limit: limitRaw,
    offset: offsetRaw,
  });

  return text(id, {
    source_id: page.sourceId,
    order: page.order,
    limit: page.limit,
    offset: page.offset,
    // The cohort's size, not this page's. A page count read as a population is the mistake.
    total: page.total,
    agents: page.agents.map((agent) => ({
      source_handle: agent.sourceHandle,
      caip19: agent.ref === null ? null : toCaip19(agent.ref),
      // Said rather than resolved: several `same as` edges means there is no single agent to
      // point at, and naming one would be a guess with a permanent reader.
      identity_ambiguous: agent.isIdentityAmbiguous,
      identity_edge_count: agent.identityEdgeCount,
      name: agent.metadata.name,
      // `Agent <chain>:<token>` is the canonical **fallback**, not a name an operator chose. Saying
      // which it is keeps a reader from crediting an agent with naming itself.
      name_is_fallback: agent.metadata.isFallback,
      statement_count: agent.statementCount,
      // `null` stays `null` and is never coerced to `0`. The first draft of this read a field that
      // does not exist (`totalAssets`) and `?? 0n`'d the `undefined`, so it reported **0 TRUST for
      // an agent carrying 13** — ADR `0042`'s family with the sign flipped, and it shipped because
      // `scripts/` is outside every typecheck (`tasks/21`).
      own_atom_market:
        agent.market === null
          ? null
          : {
              // Market cap, not assets: this type carries no assets figure, and the two are not
              // the same number — 13.02 against 12.28 TRUST on the agent measured 2026-10-20.
              total_market_cap_wei:
                agent.market.totalMarketCap === null
                  ? null
                  : agent.market.totalMarketCap.toString(),
              // Positions, not distinct stakers: one account holding two is two here.
              position_count: agent.market.positionCount,
              // Summed across this many bonding curves. It matters: on the agent above, curve 1
              // held 0.00098 TRUST and curve 2 held 12.28, so a figure from one curve beside a
              // count from all of them is a contradiction.
              vault_count: agent.market.vaultCount,
            },
    })),
  });
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
      case 'arp_identity':
        return await identity(id, args);
      case 'arp_find_agents':
        return await findAgents(id, args);
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

/**
 * The stdio transport — newline-delimited JSON-RPC over stdin/stdout, which is how an MCP client
 * launches a local server.
 *
 * It wraps `handler.fetch` instead of re-implementing the dispatch, so there is exactly one place a
 * method is handled and the two transports cannot drift. A 202 (a notification) has no body and
 * writes nothing, which is what the protocol requires.
 *
 * **Everything printed here goes to stderr.** stdout is the protocol channel: one stray line on it
 * desynchronises the client, and the failure looks like a malformed server rather than a log.
 */
async function serveStdio(): Promise<void> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffered = '';

  const send = (line: string) => Bun.write(Bun.stdout, encoder.encode(`${line}\n`));

  for await (const chunk of Bun.stdin.stream()) {
    buffered += decoder.decode(chunk as Uint8Array, { stream: true });
    let newline = buffered.indexOf('\n');
    while (newline !== -1) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      newline = buffered.indexOf('\n');
      if (line.length === 0) continue;

      const response = await handler.fetch(
        new Request(`http://stdio/`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: line,
        }),
      );
      if (response.status === 202) continue;
      await send(await response.text());
    }
  }
}

if (import.meta.main) {
  const stdio = process.argv.includes('--stdio') || process.env.ARP_TRANSPORT === 'stdio';
  // stderr in both modes: the banner is a diagnostic, and on stdio stdout belongs to the protocol.
  const log = (line: string) => process.stderr.write(`${line}\n`);

  log(`ARP MCP node — ${stdio ? 'stdio' : `http://localhost:${PORT}`}`);
  log(`  chain:      ${chainId} (${record.chain?.name ?? 'unknown'}) via ARP_TARGET=${targetName}`);
  log(`  graph:      ${GRAPHQL_URL}`);
  log(`  rpc:        ${RPC_URL}`);
  log(`  multivault: ${MULTI_VAULT}`);

  if (stdio) {
    await serveStdio();
    process.exit(0);
  }

  Bun.serve(handler);
  log(`  tools:      ${TOOLS.map((t) => t.name).join(', ')}`);
  log(`\nsigns nothing, sends nothing — the planners return calls for your own key.`);
}
