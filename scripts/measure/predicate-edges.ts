import type { GraphqlReply } from '../helpers/shapes.js';
/** Edge count per predicate on Intuition mainnet, for every id the connector freezes.
 *
 *  The basis for task 19 step 1 — which predicate ARP should write `(agent, use, tool)` on.
 *  Re-run before changing that choice; the counts move.
 *
 *      bun run scripts/measure/predicate-edges.ts
 *
 *  Read-only: one aggregate query per predicate. Signs nothing.
 *
 *  Measured 2026-10-16: `use` 158 edges (published in Appendix B, unambiguous), `uses` 185
 *  (never published, derived by edge count). 27 edges is noise, so publication decides — ADR 0015.
 *
 *  **Re-run 2026-10-27: 158, 185 and `has category` 120 — unchanged, to the edge.** Worth the line,
 *  because `docs/09:35` quotes a trio of "194 `use`, 184 `uses`, 120 `has category`" and two of the
 *  three reproduce here. Intuition has no deletion, so 194 → 158 cannot be a graph that shrank; it
 *  is a different query. Do not read the pair as a time series — `tasks/17` briefly did.
 *
 *  It also could not run at all between `562d0fd` and 2026-10-27: that commit moved this file into
 *  `scripts/measure/` and the `../packages/…` below became `scripts/packages/…`, so it threw ENOENT.
 *  `check:scripts` is a typecheck and cannot see a runtime path. */
const URL_ = 'https://mainnet.intuition.sh/v1/graphql';
// Read the ids straight from the connector's frozen constants, so this script
// cannot drift from what the code actually queries.
const src = await Bun.file(
  new URL('../../packages/protocol/src/sources/intuition/terms.ts', import.meta.url),
).text();
const lines = [...src.matchAll(/export const (\w+)\s*=\s*\n?\s*"(0x[0-9a-f]{64})"/g)].map((m) => [
  m[1],
  m[2],
]);
const q = `query P($pid: String!) {
  triples_aggregate(where: {predicate_id: {_eq: $pid}}) { aggregate { count } }
  t: triples(where: {predicate_id: {_eq: $pid}}, limit: 1) { predicate { label } }
}`;
for (const [name, pid] of lines) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: q, variables: { pid } }),
    signal: AbortSignal.timeout(30000),
  });
  type Reply = {
    triples_aggregate?: { aggregate?: { count?: number } };
    t?: { predicate?: { label?: unknown } }[];
  };
  const j = (await r.json()) as GraphqlReply<Reply>;
  const c = j?.data?.triples_aggregate?.aggregate?.count;
  const label = j?.data?.t?.[0]?.predicate?.label ?? '—';
  if (c === undefined) {
    console.log(`${name.padEnd(20)} ERR ${JSON.stringify(j?.errors?.[0]?.message).slice(0, 60)}`);
    continue;
  }
  console.log(`${name.padEnd(20)} ${String(c).padStart(7)} edges   label="${label}"`);
}

// A module, not a global script. Without this TypeScript treats every top-level
// `const` here as sharing one scope with every other import-free file in `scripts/`,
// which produced 21 phantom redeclarations and 20 "await outside a module" errors the
// first time this directory was typechecked (`tasks/21`). Bun already runs it as a module.
export {};
