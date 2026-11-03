/** Read the domain tree back off the chain and exercise both directions.
 *
 *      ARP_TARGET=testnet bun run scripts/verify/verify-domain-tree.ts
 *      ARP_TARGET=testnet bun run scripts/verify/verify-domain-tree.ts --domain payment
 *
 *  Read-only. Signs nothing. Two GraphQL queries, no RPC.
 *
 *  This is the test, not the transactions. A tree that only exists as a plan proves nothing; what
 *  has to hold is that **one** set of edges answers both readings (`docs/25_THE_DOMAIN_TREE.md`):
 *
 *    - **down** — given a domain, every tool under it, at any depth. What `arp_find_tools` needs.
 *    - **up** — given a domain, the path to the root, edge by edge. The witness an agent presents,
 *      because the MultiVault has no reverse index and the contract cannot discover it.
 *
 *  ## It reads a dirty graph on purpose
 *
 *  Testnet 13579 carries 42 `is a sub-domain of` edges that predate ARP, and 19 of them are junk:
 *  nine timestamped `rehearsal` nodes, one child with five different parents, a case split
 *  (`Design` beside `design`), a typo, an inverted edge, an empty label and one of 270 characters
 *  (`data/measurements/classification-vocabulary-2026-10-28.json`). Reading only ARP's own edges would
 *  be a test of nothing — the whole claim is that the stake rule makes a tree out of a graph like
 *  this one, so it runs over all of them.
 *
 *  ## The reading rule
 *
 *  An edge carries a path only when it is a **positive triple** holding **more than one position**.
 *  Not assets: every term is born with `minShare`, so a balance proves nothing and the position
 *  count is the evidence (ADR `0042`). Where a node has several qualifying parents, the one with
 *  the most shares wins and the rest are reported as dissent rather than dropped — nothing is
 *  deleted on this graph, so a reading rule is the only thing that can rank them.
 */
const TARGETS = { mainnet: 1155, testnet: 13579 } as const;
const GRAPHQL: Record<number, string> = {
  1155: 'https://mainnet.intuition.sh/v1/graphql',
  13579: 'https://testnet.intuition.sh/v1/graphql',
};

const IS_A_SUB_DOMAIN_OF = '0x9c2e2f2018dbfaa74fd3fd86cd54a62b16e771936f5d342e3751db8d0c046f80';
const HAS_TAG = '0x7ec36d201c842dc787b45cb5bb753bea4cf849be3908fb1b0a7d067c3c3cc1f5';
const ROOT = 'tool';

// A triple's vault type is 1 for TRIPLE and 2 for COUNTER_TRIPLE, and a counter-triple authorises
// nothing. Kept as a comment rather than an unused constant: nothing here reads the vault type yet,
// and `noUnusedLocals` is right that a named value nobody reads is a claim nobody checks.

const EDGES_Q = `query($pid: String!) {
  triples(where: {predicate_id: {_eq: $pid}}, limit: 500) {
    term_id
    subject { label }
    object { label }
    term { vaults { curve_id position_count total_shares } }
  }
}`;

const TAGS_Q = `query($pid: String!, $domains: [String!]) {
  triples(where: {predicate_id: {_eq: $pid}, object: {label: {_in: $domains}}}, limit: 500) {
    subject { label value { thing { url } } }
    object { label }
    term { vaults { position_count } }
  }
}`;

type Vault = { curve_id?: number; position_count: number; total_shares: string };
type EdgeRow = {
  term_id: string;
  subject: { label: string | null } | null;
  object: { label: string | null } | null;
  term: { vaults: Vault[] } | null;
};

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const targetName = (process.env['ARP_TARGET'] ?? 'testnet') as keyof typeof TARGETS;
const chainId = TARGETS[targetName];
if (chainId === undefined) {
  console.error(`ARP_TARGET must be one of ${Object.keys(TARGETS).join(', ')}`);
  process.exit(1);
}
const url = GRAPHQL[chainId] as string;

/**
 * One query, retried on a rate limit. A 429 used to come back as a body without `data`, which
 * surfaced three frames later as a `TypeError` — a rate limit read as a crash in the verifier.
 */
async function ask<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(60000),
    });
    if (response.status === 429 && attempt < 5) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
      continue;
    }
    if (!response.ok) throw new Error(`indexer answered ${response.status} ${response.statusText}`);
    const body = (await response.json()) as { data?: T; errors?: unknown };
    if (body.errors !== undefined) throw new Error(JSON.stringify(body.errors));
    if (body.data === undefined) throw new Error('indexer answered without data');
    return body.data;
  }
}

/** Shares behind a triple, summed across curves. The ranking input. */
function sharesOf(row: EdgeRow): bigint {
  return (row.term?.vaults ?? []).reduce((sum, vault) => sum + BigInt(vault.total_shares), 0n);
}

/**
 * Does this edge carry a path? Positive triple, at least one position.
 *
 * **One, not two.** The first run of this script used `> 1` and reported that ARP's own four fresh
 * edges carried nothing, which was the script being wrong rather than the edges. `createTriples`
 * with `assets = cost + minDeposit` gives the creator exactly **one** position
 * (`declare/multivault.ts`, measured on testnet 13579 2026-10-20), and `assets = cost` alone gives
 * **zero**. So the threshold that separates "somebody paid for this edge" from "this edge was
 * minted and abandoned" is one.
 *
 * The separate figure `> 1` answers a different question — whether anyone *other than the
 * publisher* has backed it — and that is the one worth ranking on later, not the one that decides
 * whether a path exists at all.
 *
 * The counter-triple is excluded by the query rather than here: it has its own term id and a filter
 * on `predicate_id` does not return it.
 */
function authorises(row: EdgeRow): boolean {
  const vaults = row.term?.vaults ?? [];
  if (vaults.length === 0) return false;
  return Math.max(...vaults.map((vault) => vault.position_count)) >= 1;
}

const edgeData = await ask<{ triples: EdgeRow[] }>(EDGES_Q, { pid: IS_A_SUB_DOMAIN_OF });
const rows = edgeData.triples;

const live = rows.filter(authorises);
console.log(`chain ${chainId} (${targetName})`);
console.log(
  `\`is a sub-domain of\` edges: ${rows.length} on chain, ${live.length} carrying at least one position\n`,
);

// child -> every qualifying parent, best first.
const parentsOf = new Map<string, { parent: string; shares: bigint; tripleId: string }[]>();
const childrenOf = new Map<string, string[]>();
for (const row of live) {
  const child = row.subject?.label ?? '';
  const parent = row.object?.label ?? '';
  if (child.length === 0 || parent.length === 0) continue;
  const list = parentsOf.get(child) ?? [];
  list.push({ parent, shares: sharesOf(row), tripleId: row.term_id });
  parentsOf.set(child, list);
  const kids = childrenOf.get(parent) ?? [];
  kids.push(child);
  childrenOf.set(parent, kids);
}
for (const list of parentsOf.values()) list.sort((a, b) => (b.shares > a.shares ? 1 : -1));

/**
 * Is the top parent actually ahead of the second?
 *
 * `docs/25` states the rule as "where two parent edges are within noise of each other, the node has
 * no settled parent and the UI says so rather than picking". The first run of this script picked
 * anyway, and testnet handed it the case immediately: `motion design`'s edges to `design` and to
 * `UX` hold **identical** share counts, because both were created the same way and nobody has
 * deposited since. A rule that silently takes whichever the indexer returned first is the owner
 * rule wearing the stake rule's name.
 */
function settled(list: { shares: bigint }[]): boolean {
  if (list.length === 0) return false;
  if (list.length === 1) return true;
  return (list[0] as { shares: bigint }).shares > (list[1] as { shares: bigint }).shares;
}

const contested = [...parentsOf.entries()].filter(([, list]) => list.length > 1);
if (contested.length > 0) {
  console.log('contested nodes — several qualifying parents:');
  for (const [child, list] of contested) {
    console.log(`  ${child}${settled(list) ? '' : '   NON TRANCHÉ — égalité de mise'}`);
    // Only the leaders are tied — the ones below them are ordinary dissent, and calling all four
    // "tied" was the first version of this line saying something the numbers contradict.
    const top = (list[0] as { shares: bigint }).shares;
    list.forEach((entry) => {
      const mark = entry.shares === top ? (settled(list) ? 'retenu   ' : 'à égalité') : 'dissent  ';
      console.log(`    ${mark}  ${entry.parent.padEnd(18)} ${entry.shares} shares`);
    });
  }
  console.log('');
}

const start = arg('domain') ?? 'payment';

// ---- DOWN: the subtree, then the tools hanging off it ------------------------------------------
// Ancestry-bounded, because a cycle is a chain nobody signed and this graph can carry one.
function subtree(label: string, seen: Set<string> = new Set()): string[] {
  if (seen.has(label)) return [];
  seen.add(label);
  const out = [label];
  for (const child of childrenOf.get(label) ?? []) out.push(...subtree(child, seen));
  return out;
}

const domains = subtree(start);
console.log(`DOWN  from "${start}": ${domains.length} domain(s) — ${domains.join(' · ')}`);

const tagData = await ask<{
  triples: {
    subject: { label: string | null; value: { thing: { url: string | null } | null } | null } | null;
    object: { label: string | null } | null;
    term: { vaults: { position_count: number }[] } | null;
  }[];
}>(TAGS_Q, { pid: HAS_TAG, domains });

if (tagData.triples.length === 0) {
  console.log('      no tool carries a `has tag` edge onto any of them.');
} else {
  for (const row of tagData.triples) {
    const positions = Math.max(0, ...(row.term?.vaults ?? []).map((vault) => vault.position_count));
    const target = row.subject?.value?.thing?.url ?? row.subject?.label ?? '?';
    console.log(`      ${row.object?.label?.padEnd(14)}  ${target}   (${positions} position(s))`);
  }
}

// ---- UP: the witness path --------------------------------------------------------------------
function pathToRoot(label: string): { ok: true; path: string[] } | { ok: false; reason: string } {
  const path = [label];
  const seen = new Set([label]);
  let cursor = label;
  while (cursor !== ROOT) {
    const list = parentsOf.get(cursor) ?? [];
    const best = list[0];
    if (best === undefined) return { ok: false, reason: `"${cursor}" has no parent edge carrying a position` };
    // A tie is not a parent. Refusing here is what keeps the path a witness the enforcer would
    // accept rather than a guess the UI made on the reader's behalf.
    if (!settled(list)) {
      return { ok: false, reason: `"${cursor}" has ${list.length} parents tied on shares — unsettled` };
    }
    if (seen.has(best.parent)) return { ok: false, reason: `cycle at "${best.parent}"` };
    seen.add(best.parent);
    path.push(best.parent);
    cursor = best.parent;
  }
  return { ok: true, path };
}

for (const leaf of domains) {
  const result = pathToRoot(leaf);
  console.log(
    result.ok
      ? `UP    from "${leaf}": ${result.path.join(' → ')}   (witness of ${result.path.length})`
      : `UP    from "${leaf}": no path — ${result.reason}`,
  );
}

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
