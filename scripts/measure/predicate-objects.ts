import type { GraphqlReply } from '../helpers/shapes.js';
/** What do the existing edges on each candidate `use`/`uses` predicate actually assert?
 *
 *  The evidence for ADR 0030: the two predicates do not mean the same thing, so publication and
 *  volume cannot decide between them. Re-run before changing which one ARP writes on.
 *
 *      bun run scripts/measure/predicate-objects.ts
 *
 *  Read-only: one GraphQL query per predicate per chain. Signs nothing.
 *
 *  Measured 2026-10-16 — objects that are a protocol or standard:
 *    use  0x9ddda4ac  mainnet 153/158, testnet 166/166   (A2A, MCP, OASF)
 *    uses 0x5c0bde1c  mainnet   0/185, testnet   0/143   (Intuition, Base, Claude, GitHub)
 *
 *  So `use` means "supports this protocol" and `uses` means "this entity uses this tool". */
const Q = `query($pid: String!) {
  triples(where: {predicate_id: {_eq: $pid}}, limit: 400) {
    subject { label type }
    object { label type }
  }
}`;

const NETS: [string, string][] = [
  ['mainnet', 'https://mainnet.intuition.sh/v1/graphql'],
  ['testnet', 'https://testnet.intuition.sh/v1/graphql'],
];
const PREDS: [string, string][] = [
  [
    'use  0x9ddda4ac (published)',
    '0x9ddda4ac2477ec6908e9561ab31ccd767bf3642e0ed0531fd61d447badd896ab',
  ],
  [
    'uses 0x5c0bde1c (derived)  ',
    '0x5c0bde1cc696456c0268248c4656acdf9621fdb39e605bc99b0a83dc8ff6e800',
  ],
];
const STANDARDS = new Set(['MCP', 'A2A', 'OASF', 'ERC-8004', 'x402', 'ERC8004']);

for (const [net, url] of NETS) {
  for (const [name, pid] of PREDS) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: Q, variables: { pid } }),
      signal: AbortSignal.timeout(40000),
    });
    type Reply = { triples?: { object?: { label?: unknown } }[] };
    const j = (await r.json()) as GraphqlReply<Reply>;
    const rows = j?.data?.triples ?? [];
    const obj = new Map<string, number>();
    let std = 0;
    for (const t of rows) {
      const label = String(t.object?.label ?? '?');
      obj.set(label.slice(0, 20), (obj.get(label.slice(0, 20)) ?? 0) + 1);
      if (STANDARDS.has(label.trim())) std++;
    }
    const top = [...obj.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    const pct = rows.length ? ((100 * std) / rows.length).toFixed(0) : '0';
    console.log(`\n${net}  ${name}  n=${rows.length}`);
    console.log(`   objects that are a PROTOCOL/STANDARD: ${std}/${rows.length} = ${pct}%`);
    console.log('   ' + top.map(([k, v]) => `${k}×${v}`).join(' · '));
  }
}

// A module, not a global script. Without this TypeScript treats every top-level
// `const` here as sharing one scope with every other import-free file in `scripts/`,
// which produced 21 phantom redeclarations and 20 "await outside a module" errors the
// first time this directory was typechecked (`tasks/21`). Bun already runs it as a module.
export {};
