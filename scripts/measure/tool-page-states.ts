/** Which state would the tool page render, for every tool atom that exists?
 *
 *      bun run scripts/measure/tool-page-states.ts            # mainnet 1155
 *      bun run scripts/measure/tool-page-states.ts testnet    # 13579
 *
 *  **Committed because three figures the page asserts had no script**: how many atoms are the object
 *  of a `uses` edge (84), how many of those would render no sidebar because nothing has a position
 *  (20), and how many carry an edge holding TRUST on a curve the page does not read (1). A
 *  `task-verifier` round called the second of those "the next number to rot" — it was asserted from
 *  a hand measurement in three places while its sibling figure got a script in the same commit.
 *  `rules/claims.md`: commit the script, not the number.
 *
 *  It is the page's own state machine, counted. Each atom lands in exactly one row:
 *
 *    priced        at least one edge has a position on the read curve — the sidebar renders
 *    off-curve     no position, but assets far above the creation dust (ADR `0042`)
 *    free only     every edge is free, so the sidebar is gated off and the banner stands alone
 *
 *  Read-only: one GraphQL query. Signs nothing.
 */

// `uses` — imported, never copied. `terms.ts` is the only place a term id may appear.
import { USES } from '../../packages/protocol/src/sources/intuition/terms';

const TARGETS = {
  mainnet: { label: 'Intuition mainnet 1155', url: 'https://mainnet.intuition.sh/v1/graphql' },
  testnet: { label: 'Intuition testnet 13579', url: 'https://testnet.intuition.sh/v1/graphql' },
} as const;

/** Must match `app/src/services/tool-usage-view.ts`'s ceiling, or the two disagree silently. */
const DUST_CEILING = 1_000_000_000n;
/** The curve `getToolUsage` scopes its position counts to. Also a copy — see ADR `0042`. */
const READ_CURVE = '1';

const which = (process.argv[2] ?? 'mainnet') as keyof typeof TARGETS;
const target = TARGETS[which];
if (!target) {
  console.error('usage: bun run scripts/measure/tool-page-states.ts [mainnet|testnet]');
  process.exit(1);
}

const QUERY = `
query ToolPageStates($uses: String!, $curve: numeric!) {
  triples(where: {predicate_id: {_eq: $uses}}, limit: 500) {
    object { term_id label }
    term {
      total_assets
      vaults(where: {curve_id: {_eq: $curve}}, limit: 1) { position_count }
    }
    counter_term {
      vaults(where: {curve_id: {_eq: $curve}}, limit: 1) { position_count }
    }
  }
}`;

type Side = { vaults?: { position_count?: number | null }[] };
type Row = {
  object?: { term_id?: string; label?: string | null } | null;
  term?: (Side & { total_assets?: string | null }) | null;
  counter_term?: Side | null;
};

const response = await fetch(target.url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query: QUERY, variables: { uses: USES, curve: READ_CURVE } }),
  signal: AbortSignal.timeout(30000),
});
const payload = (await response.json()) as { data?: { triples?: Row[] }; errors?: unknown };
if (payload.errors) {
  console.error('graphql errors:', JSON.stringify(payload.errors).slice(0, 400));
  process.exit(1);
}
const rows = payload.data?.triples ?? [];

type Tool = {
  label: string | null;
  edges: number;
  positions: number;
  opposePositions: number;
  offCurve: number;
};
const tools = new Map<string, Tool>();
for (const row of rows) {
  const id = row.object?.term_id;
  if (id === undefined) continue;
  const tool: Tool = tools.get(id) ?? {
    label: row.object?.label ?? null,
    edges: 0,
    positions: 0,
    // Omitted until 2026-10-27, so the first edge on any tool did `undefined + n` and every
    // count after it was NaN. Found by `tsconfig.scripts.json`'s first run (`tasks/21`) — the
    // comment below already explained why the field matters, in a file whose default object
    // did not have it.
    opposePositions: 0,
    offCurve: 0,
  };
  const positions = row.term?.vaults?.[0]?.position_count ?? 0;
  // The gate is `supportPositions > 0 || opposePositions > 0`, so the opposition half counts. It
  // changes nothing today — 0 of 84 atoms have an oppose position without a support one — but a
  // script whose docstring says "the page's own state machine, counted" has to model the whole gate
  // or it silently stops matching the page.
  const opposePositions = row.counter_term?.vaults?.[0]?.position_count ?? 0;
  const assets = BigInt(row.term?.total_assets ?? '0');
  tool.edges += 1;
  tool.positions += positions;
  tool.opposePositions += opposePositions;
  if (positions === 0 && assets > DUST_CEILING) tool.offCurve += 1;
  tools.set(id, tool);
}

let priced = 0;
let offCurveOnly = 0;
let freeOnly = 0;
const offCurveTools: string[] = [];
for (const [id, tool] of tools) {
  if (tool.offCurve > 0) offCurveTools.push(`${tool.label ?? '(unlabelled)'}  ${id}`);
  if (tool.positions > 0 || tool.opposePositions > 0) priced += 1;
  else if (tool.offCurve > 0) offCurveOnly += 1;
  else freeOnly += 1;
}

console.log(`${target.label} — predicate \`uses\` ${USES}`);
console.log(`${rows.length} edges over ${tools.size} distinct tool atoms (query limit 500)\n`);
console.log(
  `  the sidebar RENDERS       ${String(priced).padStart(3)} atoms  (a position either way on curve ${READ_CURVE})`,
);
console.log(
  `  off-curve, no position    ${String(offCurveOnly).padStart(3)} atoms  (assets above the dust ceiling)`,
);
console.log(
  `  free only, sidebar GATED  ${String(freeOnly).padStart(3)} atoms  (nothing staked on any claim)`,
);
const gated = offCurveOnly + freeOnly;
console.log(
  `\n  ${priced + gated} total. The SIDEBAR IS GATED on ${gated} of them — the free-only`,
);
console.log(`  ones plus the off-curve one, since neither has a position for the gate to pass.`);
console.log(
  `  Ungated, those ${gated} pages print an amount beside a banner saying nobody staked.`,
);
console.log(
  `  (A hand measurement said "20 of 84 with zero positions", which is this ${gated} — but`,
);
console.log(
  `  it lumped the off-curve atom in with the genuinely free ones: the split is ${freeOnly} + ${offCurveOnly}.)`,
);

if (offCurveTools.length > 0) {
  console.log(`\n  atoms with an off-curve edge, named so the n=1 claim is checkable:`);
  for (const t of offCurveTools) console.log(`    ${t}`);
}
