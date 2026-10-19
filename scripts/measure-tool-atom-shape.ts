/** What shape is the atom a `uses` edge points at — a pinned Thing, or a bare URL?
 *
 *  The question decides how `prepareDeclareUsed` derives a tool's atom. A content address
 *  (`ipfs://`) *is* the pinned document, so deriving the id from the URI coincides with the canon.
 *  An `https://` endpoint is a location, so deriving from it mints a metadata-less atom beside
 *  whatever atom the tool really has — and Intuition has no deletion, so the tool's reputation
 *  splits across two ids permanently (ADR `0039`'s failure mode one level up).
 *
 *      bun run scripts/measure-tool-atom-shape.ts                 # mainnet 1155
 *      bun run scripts/measure-tool-atom-shape.ts testnet         # 13579
 *
 *  **Committed because its figures were quoted in five places from no script at all** — the
 *  84/78/77 breakdown appears in `packages/protocol/src/declare/{plan,types}.ts`, the package
 *  README, a test and the MCP server, and `rules/claims.md` forbids exactly that: commit the
 *  script, not the number. Three verifier rounds in a row found a wrong version of this one
 *  sentence, and the reason was that no reader could re-derive it.
 *
 *  Read-only: one GraphQL query. Signs nothing.
 */

// `uses` — "uses this tool" (ADR 0030). IMPORTED, never copied: `terms.ts` is the only place a term
// id may appear.
import { USES } from '../packages/protocol/src/sources/intuition/terms';

const TARGETS = {
  mainnet: { label: 'Intuition mainnet 1155', url: 'https://mainnet.intuition.sh/v1/graphql' },
  testnet: { label: 'Intuition testnet 13579', url: 'https://testnet.intuition.sh/v1/graphql' },
} as const;

const which = (process.argv[2] ?? 'mainnet') as keyof typeof TARGETS;
const target = TARGETS[which];
if (!target) {
  console.error('usage: bun run scripts/measure-tool-atom-shape.ts [mainnet|testnet]');
  process.exit(1);
}

const QUERY = `
query ToolAtomShape($uses: String!) {
  triples(where: {predicate_id: {_eq: $uses}}, limit: 500) {
    object { term_id label type data value { thing { url name } } }
  }
}`;

type Atom = {
  term_id?: string;
  label?: string | null;
  type?: string | null;
  data?: string | null;
  value?: { thing?: { url?: string | null; name?: string | null } | null } | null;
};

const response = await fetch(target.url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query: QUERY, variables: { uses: USES } }),
  signal: AbortSignal.timeout(30000),
});
const payload = (await response.json()) as {
  data?: { triples?: { object?: Atom | null }[] };
  errors?: unknown;
};
if (payload.errors) {
  console.error('graphql errors:', JSON.stringify(payload.errors).slice(0, 400));
  process.exit(1);
}

/** Deduped by term id: many edges point at one tool, and the question is about atoms. */
const atoms = new Map<string, Atom>();
for (const row of payload.data?.triples ?? []) {
  const atom = row.object;
  if (atom?.term_id) atoms.set(atom.term_id, atom);
}

const scheme = (data: string | null | undefined): 'ipfs' | 'http' | 'other' => {
  const d = data ?? '';
  if (/^(ipfs|ar):\/\//i.test(d)) return 'ipfs';
  if (/^https?:\/\//i.test(d)) return 'http';
  return 'other';
};
const pinned = (a: Atom): boolean => Boolean(a.value?.thing);

const counts = { ipfs: 0, http: 0, other: 0 };
const pinnedBy = { ipfs: 0, http: 0, other: 0 };
const rawUrls: string[] = [];
for (const atom of atoms.values()) {
  const s = scheme(atom.data);
  counts[s] += 1;
  if (pinned(atom)) pinnedBy[s] += 1;
  if (s === 'http') rawUrls.push(`${atom.data ?? '?'}  (type ${atom.type ?? '?'})`);
}
const totalPinned = pinnedBy.ipfs + pinnedBy.http + pinnedBy.other;

console.log(`${target.label} — predicate \`uses\` ${USES}`);
console.log(`${atoms.size} distinct tool atoms across the edges read (query limit 500)\n`);
console.log(`  the atom's \`data\`      count   of which carry a pinned Thing`);
console.log(`  ipfs:// or ar://        ${String(counts.ipfs).padStart(5)}   ${pinnedBy.ipfs}`);
console.log(`  raw http(s)://         ${String(counts.http).padStart(5)}   ${pinnedBy.http}`);
console.log(`  neither                ${String(counts.other).padStart(5)}   ${pinnedBy.other}`);
console.log(`\n  ${totalPinned} of ${atoms.size} tool atoms carry pinned metadata.`);

if (rawUrls.length > 0) {
  console.log(`\nevery raw-URL atom in the set, so a reader can judge whether any is a tool:`);
  for (const u of rawUrls) console.log(`  ${u}`);
}
console.log(
  `\nAn atom with no pinned Thing returns nulls from \`mapMetadata\`, so it has no name and no\n` +
    `description for any reader. That is why a location URL needs a lookup rather than a derivation.`,
);
