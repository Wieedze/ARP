import type { GraphqlReply } from './shapes.js';
/** Could `getCapabilities` ever reach an edge on a given predicate?
 *
 *  It only runs on a subject returned by `resolveSubject`, which filters on `same as`. So an edge
 *  whose subject carries no `same as` is unreachable, however wrong the mapping around it is. This
 *  is what separates a latent defect from a live one, and the distinction is easy to overstate —
 *  task 20's first draft claimed 185 mislabelled edges when the reachable count was zero.
 *
 *      bun run scripts/measure/predicate-reachability.ts
 *
 *  Read-only: two GraphQL queries per predicate per chain. Signs nothing.
 *
 *  Measured 2026-10-16 — distinct subjects, and how many carry a `same as` edge:
 *    mainnet  uses  83 subjects →  0      use  80 subjects → 79
 *    testnet  uses  69 subjects →  0      use  84 subjects → 85 */
const SAME_AS = '0xbeebfb7d177cbd96ffc239d2196c72ec346efe81f39dc595773f13d83506f5f0';
const USES = '0x5c0bde1cc696456c0268248c4656acdf9621fdb39e605bc99b0a83dc8ff6e800';
const USE = '0x9ddda4ac2477ec6908e9561ab31ccd767bf3642e0ed0531fd61d447badd896ab';

const Q = `query($pid: String!) {
  triples(where: {predicate_id: {_eq: $pid}}, limit: 400) {
    subject { term_id label }
  }
}`;
const SA = `query($ids: [String!]) {
  triples(where: {predicate_id: {_eq: "${SAME_AS}"}, subject_id: {_in: $ids}}) {
    subject { term_id label }
    object { label }
  }
}`;

for (const [net, url] of [
  ['mainnet', 'https://mainnet.intuition.sh/v1/graphql'],
  ['testnet', 'https://testnet.intuition.sh/v1/graphql'],
] as [string, string][]) {
  for (const [name, pid] of [
    ['uses', USES],
    ['use', USE],
  ] as [string, string][]) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: Q, variables: { pid } }),
      signal: AbortSignal.timeout(40000),
    });
    type Subjects = { triples?: { subject?: { term_id?: string } }[] };
    const j = (await r.json()) as GraphqlReply<Subjects>;
    const subs = [
      ...new Set((j?.data?.triples ?? []).map((t) => t.subject?.term_id).filter(Boolean)),
    ] as string[];
    const r2 = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: SA, variables: { ids: subs } }),
      signal: AbortSignal.timeout(40000),
    });
    type SameAs = {
      triples?: { subject?: { label?: unknown }; object?: { label?: unknown } }[];
    };
    const j2 = (await r2.json()) as GraphqlReply<SameAs>;
    const hits = j2?.data?.triples ?? [];
    console.log(
      `${net.padEnd(8)} ${name.padEnd(5)} distinct subjects ${String(subs.length).padStart(4)}` +
        `   with a \`same as\` edge: ${String(hits.length).padStart(4)}`,
    );
    for (const h of hits.slice(0, 3)) {
      console.log(
        `            e.g. ${String(h.subject?.label).slice(0, 28)} same as ${String(h.object?.label).slice(0, 46)}`,
      );
    }
  }
}

// A module, not a global script. Without this TypeScript treats every top-level
// `const` here as sharing one scope with every other import-free file in `scripts/`,
// which produced 21 phantom redeclarations and 20 "await outside a module" errors the
// first time this directory was typechecked (`tasks/21`). Bun already runs it as a module.
export {};
