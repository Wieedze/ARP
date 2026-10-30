/** How many atoms does one URL already have, and would normalising the URL have merged them?
 *
 *      bun run scripts/measure/url-atom-fragmentation.ts            # mainnet 1155
 *      bun run scripts/measure/url-atom-fragmentation.ts testnet    # 13579
 *
 *  The question this answers is the one that justifies `declare/tool-thing.ts`. An atom's id is the
 *  hash of its data, and its data is a document containing a **free-text `name`**. So two people
 *  registering the same tool produce two atoms, two vaults and two reputations that can never be
 *  merged — Intuition has no deletion. Deriving every field from the normalised URL removes the
 *  free field, and therefore the fork.
 *
 *  This counts the damage already done, which is also the ceiling on what the derivation prevents:
 *  it groups every atom whose pinned Thing carries a URL by that URL's **normalised** form, and
 *  reports how many groups hold more than one atom.
 *
 *  Two numbers come out of it and they answer different questions, so neither is reported alone:
 *
 *   - groups with >1 atom on the **raw** URL — spellings that were already identical, so the
 *     duplication is purely the free-text `name`;
 *   - groups with >1 atom only after **normalisation** — duplication the normalisation merges and a
 *     raw-string lookup misses. This is what `findExistingToolAtoms` searching both spellings buys.
 *
 *  Measured on mainnet 1155, 2026-10-21 — all 90,608 atoms whose Thing carries a URL:
 *
 *  | | |
 *  | --- | --- |
 *  | distinct raw URLs | 85,367 |
 *  | distinct normalised URLs | 84,768 |
 *  | raw URLs held by more than one atom | 3,256, covering 8,497 atoms |
 *  | of those, groups where a name repeats too | 1,722 |
 *  | one host, every atom named apart | 1,534 |
 *  | **atoms in excess of their names** | **2,022** |
 *  | forks only normalisation sees | 213 |
 *
 *  **2,022 is the figure that means duplication** and the only one here that survives being called a
 *  count of duplicates. The worst groups:
 *
 *  | URL | atoms | names |
 *  | --- | --- | --- |
 *  | `https://trenches.bid` | 53 | **1** — all "Clawlett" |
 *  | `https://hourglass.box/` | 64 | 2 |
 *  | `https://github.com` | 5 | 2 — "GitHub" ×2, "github.com" ×3 |
 *
 *  **Two wrong readings this script was rewritten to prevent.** The first draft reported only "3,256
 *  URLs held by more than one atom" and named `https://zyf.ai` as the worst fork at 297 atoms. Those
 *  297 carry **297 distinct names** — "Zyfai Rebalancer Agent for 0x…" — so they are 297 different
 *  agents on one provider's homepage and not a fork at all: a figure counted over one population and
 *  stated about another (`rules/claims.md` failure 2). The second draft then counted whole groups as
 *  duplicates, which says `https://meerkat.town` has 69 duplicates when its 69 atoms carry 68 names
 *  — one duplicated pair. `size - distinctNames`, summed, is the surplus.
 *
 *  Read-only: paged atom reads, cursored on `term_id`. Signs nothing, needs no key. Spaced to be
 *  polite to a third party's endpoint — this script's predecessor took a 429 twice, and this run
 *  took six despite 400 ms spacing, which the backoff absorbed.
 */
import { isToolUrl, normaliseToolUrl } from '../../packages/protocol/src/declare/tool-thing.js';

const TARGETS = {
  mainnet: { label: 'Intuition mainnet 1155', url: 'https://mainnet.intuition.sh/v1/graphql' },
  testnet: { label: 'Intuition testnet 13579', url: 'https://testnet.intuition.sh/v1/graphql' },
} as const;

const which = (process.argv[2] ?? 'mainnet') as keyof typeof TARGETS;
const target = TARGETS[which];
if (!target) {
  console.error('usage: bun run scripts/measure/url-atom-fragmentation.ts [mainnet|testnet]');
  process.exit(1);
}

/**
 * The endpoint's hard cap, not a choice. Probed 2026-10-21 against mainnet: `limit: 250` returns
 * 250 rows, `limit: 500` and `limit: 1000` **also return 250** — silently, with no error and no
 * flag. A page size above it makes `rows.length < PAGE` fire on the first page and the script
 * reports the first 250 atoms as the whole population, which is exactly what happened here before
 * this constant was measured.
 */
const PAGE = 250;
const SPACING_MS = 400;

const QUERY = `
query UrlAtoms($after: String!, $limit: Int!) {
  atoms(
    where: {term_id: {_gt: $after}, value: {thing: {url: {_nin: ["", "null"]}}}}
    order_by: {term_id: asc}
    limit: $limit
  ) {
    term_id
    label
    value { thing { url } }
  }
}`;

type Row = { term_id: string; label: string | null; value?: { thing?: { url?: string | null } } };

async function page(after: string): Promise<Row[]> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await fetch(target.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'arp-measure/1.0' },
      body: JSON.stringify({ query: QUERY, variables: { after, limit: PAGE } }),
      signal: AbortSignal.timeout(45_000),
    });
    if (res.status === 429) {
      const wait = 2000 * 2 ** attempt;
      console.error(`  429 — waiting ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`${target.url} → HTTP ${res.status}`);
    const json = (await res.json()) as { data?: { atoms: Row[] }; errors?: unknown };
    if (json.errors || !json.data) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);
    return json.data.atoms;
  }
  throw new Error('gave up after five 429s');
}

/** Atoms per raw URL, and per normalised URL. Keyed by `term_id`, so one atom counts once. */
const byRaw = new Map<string, Map<string, string | null>>();
const byNormalised = new Map<string, Map<string, string | null>>();
let read = 0;
let unnormalisable = 0;
let cursor = '';

for (;;) {
  const rows = await page(cursor);
  if (rows.length === 0) break;
  for (const row of rows) {
    const url = row.value?.thing?.url;
    if (typeof url !== 'string' || url.length === 0) continue;
    read += 1;
    (byRaw.get(url) ?? byRaw.set(url, new Map()).get(url)!).set(row.term_id, row.label);
    if (!isToolUrl(url)) {
      unnormalisable += 1;
      continue;
    }
    const key = normaliseToolUrl(url);
    (byNormalised.get(key) ?? byNormalised.set(key, new Map()).get(key)!).set(
      row.term_id,
      row.label,
    );
  }
  cursor = rows[rows.length - 1]!.term_id;
  if (rows.length < PAGE) break;
  await new Promise((r) => setTimeout(r, SPACING_MS));
}

type Group = { url: string; atoms: Map<string, string | null> };

const grouped = (m: Map<string, Map<string, string | null>>): Group[] =>
  [...m.entries()].filter(([, atoms]) => atoms.size > 1).map(([url, atoms]) => ({ url, atoms }));

const atomsIn = (groups: Group[]) => groups.reduce((total, g) => total + g.atoms.size, 0);
const labels = (g: Group) => new Set([...g.atoms.values()].map((l) => l ?? ''));

/**
 * Distinct labels against group size is the discriminator, and it is load-bearing.
 *
 * `labels < size` means at least two atoms share **both** a URL and a name, so one of them is a
 * duplicate of the other and nothing else explains it. `labels === size` means every atom in the
 * group has its own name — which is what 248 "Zyfai Rebalancer Agent for 0x…" atoms sharing
 * `https://www.zyf.ai` look like, and those are 248 different agents on one provider's homepage, not
 * one thing forked 248 ways.
 *
 * Without this split the headline number is wrong in the way `rules/claims.md` failure 2 describes:
 * a figure counted over one population, stated about another.
 */
const forks = (groups: Group[]) => groups.filter((g) => labels(g).size < g.atoms.size);
const sharedHost = (groups: Group[]) => groups.filter((g) => labels(g).size === g.atoms.size);

const rawGroups = grouped(byRaw);
const normGroups = grouped(byNormalised);
const rawForks = forks(rawGroups);
const rawShared = sharedHost(rawGroups);

console.log(`${target.label} — ${new Date().toISOString().slice(0, 10)}`);
console.log(`  atoms whose Thing carries a URL        ${read}`);
console.log(`  of those, not an http(s) URL           ${unnormalisable}`);
console.log(`  distinct raw URLs                      ${byRaw.size}`);
console.log(`  distinct normalised URLs               ${byNormalised.size}`);
console.log('');
console.log(
  `  raw URLs held by >1 atom               ${rawGroups.length}  (${atomsIn(rawGroups)} atoms)`,
);
console.log(
  `  normalised URLs held by >1 atom        ${normGroups.length}  (${atomsIn(normGroups)} atoms)`,
);
console.log(`  forks only normalisation sees          ${normGroups.length - rawGroups.length}`);
console.log('');
console.log('  splitting the raw groups by whether a NAME is also shared:');
console.log(`    groups where a name repeats          ${rawForks.length}`);
console.log(`    one host, every atom named apart      ${rawShared.length}`);
console.log('');
/**
 * The number that actually means "duplicate": atoms **in excess** of the distinct names present.
 *
 * Counting whole groups overstates it. `https://meerkat.town` holds 69 atoms under 68 names — that
 * is one duplicated pair, not 69 duplicates. `size - distinctNames` is the surplus, and summing it
 * is the only figure here that survives being called a count of duplicates.
 */
const excess = rawGroups.reduce((total, g) => total + (g.atoms.size - labels(g).size), 0);
console.log(`  ATOMS IN EXCESS OF THEIR NAMES         ${excess}`);
console.log('    — atoms sharing both a url and a name, counted as surplus, not as whole groups');
console.log('');

console.log('  largest duplicate groups — same url, fewer names than atoms:');
for (const g of [...rawForks].sort((a, b) => b.atoms.size - a.atoms.size).slice(0, 10)) {
  const names = [...labels(g)].slice(0, 3).join(' | ');
  console.log(
    `    ${String(g.atoms.size).padStart(4)} atoms, ${String(labels(g).size).padStart(3)} names  ${g.url.slice(0, 54).padEnd(54)}  ${names.slice(0, 50)}`,
  );
}
console.log('');
console.log('  largest shared-host groups, for contrast:');
for (const g of [...rawShared].sort((a, b) => b.atoms.size - a.atoms.size).slice(0, 5)) {
  const sample = [...labels(g)][0] ?? '';
  console.log(
    `    ${String(g.atoms.size).padStart(4)} atoms, ${String(labels(g).size).padStart(3)} names  ${g.url.slice(0, 54).padEnd(54)}  ${sample.slice(0, 50)}`,
  );
}
