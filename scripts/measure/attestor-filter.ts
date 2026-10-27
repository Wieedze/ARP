import type { GraphqlReply } from './shapes.js';
/** Which `uses` edges does ONE account vouch for? Read-only.
 *
 *  The evidence for ADR 0034 — the deposit is the attestation. A position is recorded against the
 *  depositor's address, so filtering by account is filtering by who stands behind an edge.
 *
 *      bun run scripts/measure/attestor-filter.ts
 *
 *  Measured 2026-10-19 on mainnet: the filter is ONE query, no extra index. The convention is
 *  already in use — wieedze.eth holds positions on (wieedze.eth, uses, Hardhat) and (…, uses,
 *  Discord); w00ds.eth on MetaMask, Claude, Obsidian, Cursor and ChatGPT. And deposits batch:
 *  tx 0xc71feb6a… carries positions on four vaults at once.
 *
 *  It is a FILTER, not an exclusion: anyone else may deposit on the same edge, and anyone may write
 *  a competing edge ARP has not attested. Never render it as exclusivity. */
const URL_ = 'https://mainnet.intuition.sh/v1/graphql';
const USES = '0x5c0bde1cc696456c0268248c4656acdf9621fdb39e605bc99b0a83dc8ff6e800';
const gql = async <T>(q: string, v: Record<string, unknown> = {}): Promise<GraphqlReply<T>> => {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: q, variables: v }),
    signal: AbortSignal.timeout(40000),
  });
  const j = (await r.json()) as GraphqlReply<T>;
  if (j.errors) console.log('  ERR:', JSON.stringify(j.errors.map((e) => e.message)).slice(0, 200));
  return j;
};

// find an account that actually holds positions on `uses` triples, to use as the stand-in attestor
type Positioned = { account_id?: string };
type UsesRow = { term?: { vaults?: { positions?: Positioned[] }[] } };
const who = await gql<{ triples?: UsesRow[] }>(
  `query($uses: String!) {
  triples(where: {predicate_id: {_eq: $uses}}, limit: 200) {
    term { vaults(limit: 1) { positions(limit: 3) { account_id } } } } }`,
  { uses: USES },
);
const counts = new Map<string, number>();
for (const t of who?.data?.triples ?? []) {
  for (const p of t.term?.vaults?.[0]?.positions ?? []) {
    if (p.account_id) counts.set(p.account_id, (counts.get(p.account_id) ?? 0) + 1);
  }
}
const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
if (!top) {
  console.log('no account holds a position on any `uses` triple');
  process.exit(0);
}
console.log(`stand-in attestor: ${top[0]}  vouches for ${top[1]} \`uses\` edges\n`);

// THE FILTER: every `uses` edge this account holds a position in, in ONE query
type Labelled = { label?: unknown };
type VouchedRow = {
  shares?: unknown;
  transaction_hash?: unknown;
  term?: { triple?: { subject?: Labelled; object?: Labelled } };
};
const j = await gql<{ positions?: VouchedRow[] }>(
  `query($acct: String!, $uses: String!) {
  positions(where: {account_id: {_eq: $acct}, term: {triple: {predicate_id: {_eq: $uses}}}}, limit: 20) {
    shares
    transaction_hash
    created_at
    curve_id
    term { triple { subject { label } object { label } } }
  } }`,
  { acct: top[0], uses: USES },
);
const rows = j?.data?.positions ?? [];
console.log(`${rows.length} edges this account vouches for — one query, no extra index:\n`);
for (const p of rows) {
  const t = p.term?.triple;
  console.log(
    `  ${String(t?.subject?.label).slice(0, 22).padEnd(22)} uses ${String(t?.object?.label).slice(0, 18).padEnd(18)}` +
      ` shares=${String(p.shares).slice(0, 10).padEnd(12)} tx=${String(p.transaction_hash).slice(0, 14)}…`,
  );
}

// A module, not a global script. Without this TypeScript treats every top-level
// `const` here as sharing one scope with every other import-free file in `scripts/`,
// which produced 21 phantom redeclarations and 20 "await outside a module" errors the
// first time this directory was typechecked (`tasks/21`). Bun already runs it as a module.
export {};
