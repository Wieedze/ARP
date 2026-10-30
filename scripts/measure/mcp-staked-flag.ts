/** Does ARP's MCP server tell the truth about which edges are staked?
 *
 *      bun run apps/mcp/src/server.ts                          # in another shell
 *      bun run scripts/measure/mcp-staked-flag.ts                 # IPFS on mainnet
 *      bun run scripts/measure/mcp-staked-flag.ts 0x<atom id>
 *
 *  **Exists because the flag was wrong and nothing would have told us.** `arp_tool_reputation`
 *  answers `staked` per edge, and its own caveat says "an edge with staked=false carries no weight
 *  at all". Until ADR `0042` the field read `totalAssets > 0n`, which is true of **every** edge
 *  that exists — creating a triple seeds both of its vaults with `minShare` — so the flag was never
 *  false, the caveat was inert, and the surface other agents read reported `docs/14`'s *nothing* as
 *  evidence. It shipped in `docs/tasks/16` and survived four verifier rounds, because no round ran it
 *  against a tool with free edges.
 *
 *  This compares the server's answer against the graph's own position counts, which is the
 *  discriminator ADR `0042` settled on. It is the regression check for the next person who touches
 *  that flag, and `rules/claims.md`'s "commit the script, not the number" applied to a figure I had
 *  only observed by hand.
 *
 *  Read-only: one MCP call and one GraphQL query. Signs nothing. Exits non-zero on a mismatch.
 */

import { USES } from '../../packages/protocol/src/sources/intuition/terms';

const SERVER = process.env.ARP_MCP_URL ?? 'http://127.0.0.1:3002/mcp';
const GRAPHQL = process.env.INTUITION_GRAPHQL_URL ?? 'https://mainnet.intuition.sh/v1/graphql';
/** IPFS on mainnet 1155 — seven incoming edges, three priced and four free. The design fixture. */
const DEFAULT_TOOL = '0x6cf977f274782296374d17fefca32b45c42181eab2d1d513b161cf83eabb17b1';

const toolAtomId = process.argv[2] ?? DEFAULT_TOOL;
if (!/^0x[0-9a-fA-F]{64}$/.test(toolAtomId)) {
  console.error('usage: bun run scripts/measure/mcp-staked-flag.ts [0x<32-byte atom id>]');
  process.exit(1);
}

type Edge = {
  triple_id: string;
  agent?: { label?: string | null } | null;
  support: { total_assets_wei: string; position_count: number };
  staked: boolean;
};

const mcp = await fetch(SERVER, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'arp_tool_reputation', arguments: { tool_atom_id: toolAtomId } },
  }),
  signal: AbortSignal.timeout(60000),
}).catch((error: unknown) => {
  console.error(`the server at ${SERVER} did not answer: ${String(error).slice(0, 160)}`);
  console.error('start it with: bun run apps/mcp/src/server.ts');
  process.exit(1);
});

const envelope = (await mcp.json()) as {
  result?: { content: [{ text: string }] };
  error?: { message?: string };
};
if (envelope.error !== undefined || envelope.result === undefined) {
  console.error('the server returned an error:', envelope.error?.message ?? 'no result');
  process.exit(1);
}
const served = JSON.parse(envelope.result.content[0].text) as {
  label: string | null;
  edges: Edge[];
};

/**
 * The graph's own answer, read independently of the server.
 *
 * Deliberately not the server's own numbers: the point is to check the FLAG against the counts,
 * and asking the thing under test for both halves would prove nothing.
 */
const graph = await fetch(GRAPHQL, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    query: `query Check($tool: String!, $uses: String!) {
      triples(where: {predicate_id: {_eq: $uses}, object_id: {_eq: $tool}}, limit: 200) {
        term_id
        term { vaults { position_count } }
      }
    }`,
    variables: { tool: toolAtomId, uses: USES },
  }),
  signal: AbortSignal.timeout(30000),
});
const payload = (await graph.json()) as {
  data?: {
    triples?: { term_id: string; term?: { vaults?: { position_count?: number | null }[] } }[];
  };
};
const positionsByTriple = new Map<string, number>();
for (const row of payload.data?.triples ?? []) {
  const positions = (row.term?.vaults ?? []).reduce((n, v) => n + (v.position_count ?? 0), 0);
  positionsByTriple.set(row.term_id, positions);
}

console.log(`tool    ${served.label ?? '(unlabelled)'}  ${toolAtomId}`);
console.log(`server  ${SERVER}`);
console.log(`graph   ${GRAPHQL}\n`);

let mismatches = 0;
for (const edge of served.edges) {
  const positions = positionsByTriple.get(edge.triple_id);
  const truth = (positions ?? 0) > 0;
  const agree = edge.staked === truth;
  if (!agree) mismatches += 1;
  console.log(
    `  ${agree ? 'ok    ' : 'WRONG '} staked=${String(edge.staked).padEnd(5)} ` +
      `positions=${String(positions ?? '?').padStart(2)} ` +
      `assets=${edge.support.total_assets_wei.padStart(19)}  ` +
      `${(edge.agent?.label ?? edge.triple_id).slice(0, 28)}`,
  );
}

const staked = served.edges.filter((e) => e.staked).length;
console.log(`\n${served.edges.length} edges · ${staked} staked · ${mismatches} disagreeing`);
if (mismatches > 0) {
  console.log(
    'A disagreement means the server is calling an edge staked that nobody has a position in,\n' +
      'or the reverse. The vault assets are NOT the discriminator — every created term carries\n' +
      '`minShare` of dust. ADR 0042.',
  );
  process.exit(1);
}
console.log('The flag agrees with the position counts on every edge.');
