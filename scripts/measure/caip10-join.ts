import type { GraphqlReply } from '../helpers/shapes.js';
/** Does anything point AT a `caip10:` atom on Intuition? Read-only.
 *
 *  The evidence for `tasks/19` step 1b. ADR 0026 specifies
 *  `(canonical agent atom, same as, CAIP-10 of the operating account)` and agent-import.ts
 *  implements it — but measured 2026-10-16 on both chains, ZERO edges of any predicate point at a
 *  caip10 atom, over 20 such atoms on testnet. The import passes its tests and has never written a
 *  real edge, so the join `getCapabilities` would need does not exist.
 *
 *      bun run scripts/measure/caip10-join.ts
 *
 *  Re-run before choosing between options A and B in task 19 step 1b: if this ever returns non-zero,
 *  the premise has changed. */
const URL_ = 'https://testnet.intuition.sh/v1/graphql';

const FIND = `query {
  atoms(where: {label: {_ilike: "caip10:%"}}, limit: 20) {
    term_id
    label
    as_subject_triples_aggregate { aggregate { count } }
    as_object_triples_aggregate { aggregate { count } }
  }
}`;
const INCOMING = `query($ids: [String!]) {
  triples(where: {object_id: {_in: $ids}}, limit: 40) {
    subject { label }
    predicate { term_id label }
    object { label }
  }
}`;

const gql = async <T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<GraphqlReply<T>> => {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(40000),
  });
  return (await r.json()) as GraphqlReply<T>;
};

type Agg = { aggregate?: { count?: number } };
type AtomRow = {
  term_id: string;
  label?: unknown;
  as_subject_triples_aggregate?: Agg;
  as_object_triples_aggregate?: Agg;
};
const j = await gql<{ atoms?: AtomRow[] }>(FIND);
const atoms = j?.data?.atoms ?? [];
console.log(`caip10-labelled atoms on testnet: ${atoms.length}\n`);
for (const a of atoms.slice(0, 10)) {
  const out = a.as_subject_triples_aggregate?.aggregate?.count ?? 0;
  const inc = a.as_object_triples_aggregate?.aggregate?.count ?? 0;
  console.log(`  ${String(a.label).slice(0, 44).padEnd(44)} out=${out} in=${inc}`);
}
const ids = atoms.map((a) => a.term_id);
if (ids.length) {
  type Labelled = { label?: unknown };
  type IncomingRow = {
    predicate?: Labelled & { term_id?: unknown };
    subject?: Labelled;
    object?: Labelled;
  };
  const k = await gql<{ triples?: IncomingRow[] }>(INCOMING, { ids });
  const rows = k?.data?.triples ?? [];
  console.log(`\nedges pointing AT a caip10 atom: ${rows.length}`);
  const byPred = new Map<string, number>();
  for (const t of rows) {
    const key = `${t.predicate?.label} (${String(t.predicate?.term_id).slice(0, 12)}…)`;
    byPred.set(key, (byPred.get(key) ?? 0) + 1);
  }
  for (const [k2, n] of byPred) console.log(`  ${n}×  ${k2}`);
  for (const t of rows.slice(0, 5)) {
    console.log(
      `    ${String(t.subject?.label).slice(0, 30).padEnd(30)} ${String(t.predicate?.label).padEnd(10)} ${String(t.object?.label).slice(0, 40)}`,
    );
  }
}

// A module, not a global script. Without this TypeScript treats every top-level
// `const` here as sharing one scope with every other import-free file in `scripts/`,
// which produced 21 phantom redeclarations and 20 "await outside a module" errors the
// first time this directory was typechecked (`tasks/21`). Bun already runs it as a module.
export {};
