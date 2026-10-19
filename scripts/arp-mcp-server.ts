/** ARP's MCP server — the surface an agent reads tool reputation through.
 *
 *  Phase 1 of `docs/15_ROADMAP.md`, the first half of `tasks/16`.
 *
 *      bun run scripts/arp-mcp-server.ts            # listens on :3002
 *      PORT=4000 bun run scripts/arp-mcp-server.ts
 *
 *  MCP over HTTP is JSON-RPC with three methods — `initialize`, `tools/list`, `tools/call` — so it
 *  is hand-rolled rather than pulling a dependency. `erc8004` holds the protocol logic; this file is
 *  a transport over it, which is why it lives in `scripts/` and not in the connector
 *  (`rules/portability.md`).
 *
 *  **It signs nothing and sends nothing.** Every tool here is a read. The write path returns
 *  prepared calls for the agent to sign with its own key — ARP is not a party (ADR `0035`), and the
 *  connector's own invariant is that it never signs.
 *
 *  Two things it is deliberately not:
 *    - not in anyone's runtime. The agent *chooses* to call it. That is the whole difference between
 *      a connector and an integration, and `docs/12` lists the alternative as a drift signal.
 *    - not a scorer. It returns what was staked and by whom, with provenance. Composing that into a
 *      single number is a decision nobody has made (`docs/01` rejects being one more score).
 */

import { getToolUsage, type ToolUsage } from '../erc8004/src/tool-usage.js';

const PORT = Number(process.env.PORT ?? 3002);
const GRAPHQL_URL = process.env.INTUITION_GRAPHQL_URL ?? 'https://mainnet.intuition.sh/v1/graphql';
const PROTOCOL_VERSION = '2025-06-18';

type JsonRpcId = string | number | null;
type Rpc = { jsonrpc?: string; id?: JsonRpcId; method?: string; params?: Record<string, unknown> };

const TOOLS = [
  {
    name: 'arp_tool_reputation',
    description:
      'What agents staked on using a tool. Returns every incoming `uses` edge with its ' +
      'subject, its support vault and its counter vault, plus totals. Amounts always come ' +
      'with their position count: one vault here can hold 22.4 TRUST from a single account, ' +
      'and the figure alone would read as a market.',
    inputSchema: {
      type: 'object',
      properties: {
        tool_atom_id: {
          type: 'string',
          description: "The tool's Intuition atom id, 0x-prefixed 32 bytes.",
        },
        attested_by: {
          type: 'string',
          description:
            'Optional. Keep only edges this account holds a position in — a filter on ' +
            'who stands behind the edge, never an exclusivity claim (ADR 0034).',
        },
      },
      required: ['tool_atom_id'],
    },
  },
] as const;

function result(id: JsonRpcId, value: unknown) {
  return Response.json({ jsonrpc: '2.0', id, result: value });
}

/** JSON-RPC error codes. -32602 is invalid params, -32601 method not found, -32603 internal. */
function fail(id: JsonRpcId, code: number, message: string) {
  return Response.json({ jsonrpc: '2.0', id, error: { code, message } });
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

async function callTool(id: JsonRpcId, params: Record<string, unknown> | undefined) {
  const name = typeof params?.['name'] === 'string' ? params['name'] : null;
  const args = (params?.['arguments'] ?? {}) as Record<string, unknown>;
  if (name !== 'arp_tool_reputation') {
    return fail(id, -32602, `unknown tool: ${String(name)}`);
  }
  const toolAtomId = args['tool_atom_id'];
  if (typeof toolAtomId !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(toolAtomId)) {
    return fail(id, -32602, 'tool_atom_id must be a 0x-prefixed 32-byte hex string');
  }
  const attestedBy = typeof args['attested_by'] === 'string' ? args['attested_by'] : undefined;
  try {
    const usage = await getToolUsage(toolAtomId, {
      graphqlUrl: GRAPHQL_URL,
      ...(attestedBy === undefined ? {} : { attestedBy }),
    });
    return result(id, {
      content: [{ type: 'text', text: JSON.stringify(serialise(usage), null, 2) }],
    });
  } catch (error) {
    // The message, not a stack: a caller gets enough to retry or report, nothing about our host.
    return fail(id, -32603, `read failed: ${String(error).slice(0, 200)}`);
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    if (request.method === 'GET') {
      // Not part of MCP. A plain GET is what the verifier's non-protocol probe sends, and
      // answering it makes this endpoint `live` rather than `dead` for that path too.
      return Response.json({
        name: 'ARP',
        description: 'Agent and tool reputation over the Intuition knowledge graph.',
        mcp: { protocolVersion: PROTOCOL_VERSION, tools: TOOLS.map((t) => t.name) },
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
          serverInfo: { name: 'ARP', version: '0.1.0' },
          instructions:
            'Read what agents staked on using a tool. Amounts come with position ' +
            'counts; an edge with staked=false carries no weight. ARP composes no score.',
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
});

console.log(`ARP MCP server on http://localhost:${server.port}`);
console.log(`  graph: ${GRAPHQL_URL}`);
console.log(`  tools: ${TOOLS.map((t) => t.name).join(', ')}`);
console.log(`\nreads only — signs nothing, sends nothing.`);
