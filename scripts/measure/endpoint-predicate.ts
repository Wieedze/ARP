import type { GraphqlReply } from '../helpers/shapes.js';
/** Which predicate already exists on Intuition testnet 13579 for "this agent is reachable at this
 *  endpoint", and which one carries `in context of`?
 *
 *      bun run scripts/measure/endpoint-predicate.ts
 *
 *  Read-only: one GraphQL query per candidate list. Signs nothing. Task 39c, `portability.md`:
 *  read the vocabulary from the graph before an atom is minted. Testnet only — the binding is a
 *  testnet 13579 artefact (ADR `0094`), and mainnet's vocabulary is a separate population.
 *
 *  Exact-label match, because an atom's label is what the indexer keys on and `has endpoint` and
 *  `hasEndpoint` are two atoms. The output is the evidence `data/deployments/13579.json`
 *  `arp.endpointBinding` records.
 */
const Q = `query($labels: [String!]) {
  atoms(where: {label: {_in: $labels}}, limit: 200) {
    term_id
    label
    type
    data
    as_predicate_triples_aggregate { aggregate { count } }
  }
}`;

const CANDIDATES = [
  'reachable at',
  'is reachable at',
  'has endpoint',
  'hasEndpoint',
  'endpoint',
  'has service endpoint',
  'served at',
  'serves at',
  'hosted at',
  'available at',
  'has url',
  'url',
  'has node',
  'runs node',
  'in context of',
];

const URL = 'https://testnet.intuition.sh/v1/graphql';

type Row = {
  term_id: string;
  label: string;
  type: string;
  data: string | null;
  as_predicate_triples_aggregate: { aggregate: { count: number } | null } | null;
};

const response = await fetch(URL, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query: Q, variables: { labels: CANDIDATES } }),
  signal: AbortSignal.timeout(60000),
});
const body = (await response.json()) as GraphqlReply<{ atoms: Row[] }>;
if (body.errors !== undefined) throw new Error(JSON.stringify(body.errors));
const rows = (body.data?.atoms ?? [])
  .map((a) => ({
    label: a.label,
    type: a.type,
    id: a.term_id,
    data: (a.data ?? '').slice(0, 60),
    n: a.as_predicate_triples_aggregate?.aggregate?.count ?? 0,
  }))
  .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));

console.log(`testnet 13579, ${new Date().toISOString()}`);
console.log(`candidate labels: ${CANDIDATES.length} · present as an atom: ${rows.length}`);
for (const row of rows) {
  console.log(
    `  ${String(row.n).padStart(6)}  ${row.label.padEnd(22)} ${row.type.padEnd(12)} ${row.id}  ${row.data}`,
  );
}
const absent = CANDIDATES.filter((label) => !rows.some((row) => row.label === label));
console.log(`absent (${absent.length}): ${absent.join(', ')}`);
