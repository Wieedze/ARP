/** Where does a stake on a `uses` edge actually sit — on the edge, or on the tool atom?
 *
 *  Two vaults can carry a deposit about one tool, and they are not the same claim:
 *
 *    the triple's vault      "I stand behind the claim that this agent used this tool"
 *    the object atom's vault "I think this tool is valuable", by anyone, for any reason
 *
 *  `getToolUsage` prices the **triple**. the deleted `agent-stake-on-use.ts` deposited on the **object
 *  atom**. Both cannot be right, and this measures which one the ecosystem actually uses before
 *  `docs/tasks/16` picks one — the question is load-bearing, because a deposit in the wrong vault is
 *  invisible to the reader and permanent.
 *
 *      bun run scripts/measure/stake-vault-placement.ts                 # mainnet 1155
 *      bun run scripts/measure/stake-vault-placement.ts testnet         # 13579
 *
 *  Read-only: one GraphQL query. Signs nothing.
 */

// `uses` — "uses this tool" (ADR 0030). IMPORTED, never copied: `terms.ts` is the only place a term
// id may appear, and typing this one from memory produced a wrong 32 bytes on the first draft of
// this very script. A measurement against the wrong predicate reads as "no edges exist".
import { USES } from '../../packages/protocol/src/sources/intuition/terms';

const TARGETS = {
  mainnet: { label: 'Intuition mainnet 1155', url: 'https://mainnet.intuition.sh/v1/graphql' },
  testnet: { label: 'Intuition testnet 13579', url: 'https://testnet.intuition.sh/v1/graphql' },
} as const;

const which = (process.argv[2] ?? 'mainnet') as keyof typeof TARGETS;
const target = TARGETS[which];
if (!target) {
  console.error(`usage: bun run scripts/measure/stake-vault-placement.ts [mainnet|testnet]`);
  process.exit(1);
}

const QUERY = `
query VaultPlacement($uses: String!) {
  triples(where: {predicate_id: {_eq: $uses}}, limit: 500) {
    term_id
    subject { term_id label }
    object  { term_id label }
    term         { total_assets vaults { curve_id position_count total_assets } }
    counter_term { total_assets vaults { curve_id position_count total_assets } }
    object_vaults: object { term { total_assets vaults { curve_id position_count total_assets } } }
  }
}`;

type Side = {
  total_assets?: string | null;
  vaults?: {
    curve_id?: string | null;
    position_count?: number | null;
    total_assets?: string | null;
  }[];
};
type Row = {
  term_id: string;
  subject?: { term_id?: string; label?: string | null } | null;
  object?: { term_id?: string; label?: string | null } | null;
  term?: Side | null;
  counter_term?: Side | null;
  object_vaults?: { term?: Side | null } | null;
};

/**
 * Summed across **every** curve, not read off one vault.
 *
 * The first version used `vaults(limit: 1)` with no `order_by` and no `curve_id` filter, so it read
 * a nondeterministic single vault per term and silently reported the curve-1 slice as the whole.
 * Measured 2026-10-19 on mainnet: curve 1 holds 26.23 TRUST of the `uses` edges and curve 2 holds
 * 219.54, so the slice was 11% of the total. ADR `0023` is this repo's own decision to read the
 * market across all curves; this script contradicted it.
 */
const positions = (s: Side | null | undefined): number =>
  (s?.vaults ?? []).reduce((n, v) => n + (v.position_count ?? 0), 0);
const assets = (s: Side | null | undefined): bigint =>
  (s?.vaults ?? []).reduce((a, v) => a + BigInt(v.total_assets ?? '0'), 0n);
const trust = (wei: bigint): string => (Number(wei) / 1e18).toFixed(6);

const response = await fetch(target.url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query: QUERY, variables: { uses: USES } }),
  signal: AbortSignal.timeout(30000),
});
const payload = (await response.json()) as { data?: { triples?: Row[] }; errors?: unknown };
if (payload.errors) {
  console.error('graphql errors:', JSON.stringify(payload.errors).slice(0, 400));
  process.exit(1);
}
const rows = payload.data?.triples ?? [];

/**
 * TRUST per bonding curve, so the split is produced rather than asserted.
 *
 * It was cited for a figure it did not compute: the split lived in this file's own docstring, and
 * `tool-usage-view.ts` quoted "91.6%" where the real number is 89.33% and where this repo already
 * held "89%" elsewhere. `rules/claims.md` — commit the script, not the number.
 */
const assetsByCurve = new Map<string, bigint>();
const addByCurve = (s: Side | null | undefined) => {
  for (const v of s?.vaults ?? []) {
    const key = String(v.curve_id ?? '?');
    assetsByCurve.set(key, (assetsByCurve.get(key) ?? 0n) + BigInt(v.total_assets ?? '0'));
  }
};

let edgesWithTriplePositions = 0;
let edgesWithObjectAtomPositions = 0;
let edgesWithBoth = 0;
let edgesWithNeither = 0;
let edgesOnlyOnAtom = 0;
let tripleAssets = 0n;

/**
 * Atom assets are summed ONCE per atom, not once per edge.
 *
 * Many edges point at the same tool, so adding `object.term.total_assets` per row counts one vault
 * as many times as it has incoming edges. The first run of this script printed 49,569,934 TRUST
 * that way — `claims.md` check 2, caught because the figure was absurd and not because the code
 * complained.
 */
const atomAssets = new Map<string, bigint>();

for (const row of rows) {
  const onEdge = positions(row.term) + positions(row.counter_term);
  const onAtom = positions(row.object_vaults?.term);
  tripleAssets += assets(row.term) + assets(row.counter_term);
  addByCurve(row.term);
  addByCurve(row.counter_term);
  const objectId = row.object?.term_id;
  if (objectId !== undefined) atomAssets.set(objectId, assets(row.object_vaults?.term));
  if (onEdge > 0 && onAtom > 0) edgesWithBoth += 1;
  if (onEdge > 0) edgesWithTriplePositions += 1;
  if (onAtom > 0) edgesWithObjectAtomPositions += 1;
  if (onAtom > 0 && onEdge === 0) edgesOnlyOnAtom += 1;
  if (onEdge === 0 && onAtom === 0) edgesWithNeither += 1;
}

const objectAtomAssets = [...atomAssets.values()].reduce((a, b) => a + b, 0n);

console.log(`${target.label} — predicate \`uses\` ${USES}`);
console.log(`${rows.length} edges read (limit 500)\n`);
console.log(
  `  stake on the EDGE   ${edgesWithTriplePositions} of ${rows.length} edges · ${trust(tripleAssets)} TRUST  (what getToolUsage prices)`,
);
console.log(
  `  stake on the ATOM   ${edgesWithObjectAtomPositions} of ${rows.length} edges · ${trust(objectAtomAssets)} TRUST over ${atomAssets.size} distinct atoms  (what the deleted agent-stake-on-use wrote)`,
);
console.log(`  both                ${edgesWithBoth}`);
console.log(`  ATOM but not EDGE   ${edgesOnlyOnAtom}  — invisible to getToolUsage`);
console.log(`  neither             ${edgesWithNeither}`);
const byCurveTotal = [...assetsByCurve.values()].reduce((a, b) => a + b, 0n);
console.log(`\n  the EDGE total, split by bonding curve (${trust(byCurveTotal)} TRUST):`);
for (const [curve, amount] of [...assetsByCurve.entries()].sort()) {
  const share = byCurveTotal === 0n ? 0 : (100 * Number(amount)) / Number(byCurveTotal);
  console.log(
    `    curve ${curve.padEnd(3)} ${trust(amount).padStart(14)} TRUST  ${share.toFixed(2)}%`,
  );
}
console.log(
  `  The reader's per-vault fields are scoped to one curve while its asset totals are not, so this\n` +
    `  split is what says how much of the market those fields exclude.`,
);

console.log(
  `\nThe atom total is summed once per DISTINCT atom. An object atom's vault is a market on the` +
    `\ntool itself, open to anyone for any reason; the edge's vault is a market on this one claim.` +
    `\nThey answer different questions, so the larger figure is not the better one.`,
);
