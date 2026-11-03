/** Which deposits `/tools` counts as Usage did ARP's sponsoring service actually send?
 *
 *  Task 58. `/tools` counts a deposit on a `uses` edge as Usage when its sender is the address in
 *  `data/deployments/13579.json` `arp.sponsor`. That address is also ARP's deployer and an attestor,
 *  so it sent transactions before the sponsoring service existed. This lists every deposit the
 *  listing would count, and says which ones the service's own ledger accounts for.
 *
 *      bun run scripts/measure/sponsor-deposit-provenance.ts [ledger.jsonl …]
 *
 *  Read-only: one indexer query on testnet 13579, and each sponsor ledger named on the command line
 *  (default `$ARP_HOME/sponsor-ledger.jsonl`, `~/.arp` unset, ADR `0116`). Pass every ledger a
 *  service has run against: a second `ARP_HOME` is a second ledger. Only the machine that runs the
 *  service has them, so a stranger can reproduce the first list and not the comparison.
 *  Signs nothing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const deployment = JSON.parse(
  readFileSync(new URL('../../data/deployments/13579.json', import.meta.url), 'utf8'),
) as { chain: { graphqlUrl: string }; arp: { sponsor?: string } };
const sponsor = deployment.arp.sponsor;
if (sponsor === undefined) throw new Error('data/deployments/13579.json has no arp.sponsor');

// The same frozen ids the listing queries, read from the connector so this cannot drift from it.
const terms = await Bun.file(
  new URL('../../packages/protocol/src/sources/intuition/terms.ts', import.meta.url),
).text();
const idOf = (name: string): string => {
  const match = terms.match(new RegExp(`export const ${name}\\s*=\\s*\\n?\\s*"(0x[0-9a-f]{64})"`));
  if (match?.[1] === undefined) throw new Error(`${name} not found in terms.ts`);
  return match[1];
};

// The listing's filter (`packages/graphql/src/queries/tool-listing.ts`): a `uses` edge whose subject
// carries a `same as`, and every deposit on its term, a zero-asset creation deposit included.
const QUERY = `
query SponsorDeposits($uses: String!, $sameAs: String!, $sponsor: String!) {
  deposits(
    where: {
      sender_id: {_ilike: $sponsor}
      term: {triple: {predicate_id: {_eq: $uses}, subject: {as_subject_triples: {predicate_id: {_eq: $sameAs}}}}}
    }
    order_by: {created_at: asc}
  ) {
    created_at
    transaction_hash
    assets_after_fees
    term { triple { subject { label } object { label } } }
  }
}`;

type Deposit = {
  created_at: string;
  transaction_hash: string;
  assets_after_fees: string;
  term: { triple: { subject: { label: string | null }; object: { label: string | null } } | null };
};

const response = await fetch(deployment.chain.graphqlUrl, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    query: QUERY,
    variables: { uses: idOf('USES'), sameAs: idOf('SAME_AS'), sponsor },
  }),
});
const reply = (await response.json()) as { data?: { deposits: Deposit[] }; errors?: unknown };
if (reply.data === undefined) throw new Error(`indexer error: ${JSON.stringify(reply.errors)}`);
const deposits = reply.data.deposits;

const ledgerPaths = process.argv.slice(2);
if (ledgerPaths.length === 0) {
  ledgerPaths.push(
    join(process.env['ARP_HOME'] ?? join(homedir(), '.arp'), 'sponsor-ledger.jsonl'),
  );
}
const ledgerHashes = new Map<string, string>();
for (const ledgerPath of ledgerPaths) {
  if (!existsSync(ledgerPath)) throw new Error(`no ledger at ${ledgerPath}`);
  for (const line of readFileSync(ledgerPath, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    const entry = JSON.parse(line) as { settle?: string; kind?: string; hash?: string };
    if (entry.settle !== undefined && entry.hash !== undefined) {
      ledgerHashes.set(entry.hash.toLowerCase(), entry.kind ?? 'unknown');
    }
  }
}

console.log(`testnet 13579, ${new Date().toISOString()}, sender ${sponsor}`);
console.log(`ledgers: ${ledgerPaths.join(', ')}\n`);
const byKind = new Map<string, number>();
for (const deposit of deposits) {
  const kind = ledgerHashes.get(deposit.transaction_hash.toLowerCase());
  const bucket = kind ?? 'not in a ledger';
  byKind.set(bucket, (byKind.get(bucket) ?? 0) + 1);
  const edge = deposit.term.triple;
  const label = edge === null ? '?' : `${edge.subject.label} uses ${edge.object.label}`;
  console.log(
    `${deposit.created_at.slice(0, 19)}  ${kind ?? 'NOT IN LEDGER'}  ${deposit.assets_after_fees}  ${label}  ${deposit.transaction_hash}`,
  );
}
// `deposit` is the proof-gated kind; `create` is an edge creation the service paid for.
const split = [...byKind].map(([kind, count]) => `${count} ${kind}`).join(', ');
console.log(`\n${deposits.length} deposits counted as Usage: ${split}.`);
