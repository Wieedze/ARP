/** Of the `same as` edges naming a token on ARP's registry on 13579, how many have the canonical atom as subject,
 *  and what other registries agents name. Reads only.
 *
 *      bun run scripts/measure/agent-identity-canonical.ts --json data/measurements/agent-identity-canonical-<date>.json
 */
import { writeFileSync } from 'node:fs';

import deployment from '../../data/deployments/13579.json';
import { canonicalAgentThing, thingUri } from '../../packages/protocol/src/declare/agent-atom.ts';
import { SAME_AS } from '../../packages/protocol/src/sources/intuition/terms.ts';

const REGISTRY = deployment.arp.identityRegistry.toLowerCase();
const PATTERN = /^eip155:13579\/erc721:(0x[0-9a-fA-F]{40})\/(\d+)$/;
const QUERY = `query($p: String!, $limit: Int!, $offset: Int!) {
  triples(where: {predicate_id: {_eq: $p}}, order_by: {created_at: asc}, limit: $limit, offset: $offset) {
    subject { data }
    object { label }
  }
}`;

type Row = { subject: { data: string | null } | null; object: { label: string | null } | null };
const rows: Row[] = [];
for (let offset = 0; ; offset += 250) {
  const response = await fetch(deployment.chain.graphqlUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { p: SAME_AS, limit: 250, offset } }),
  });
  const body = (await response.json()) as { data?: { triples?: Row[] } }; // the query's shape, checked next
  const page = body.data?.triples;
  if (page === undefined) throw new Error('the index returned no triples');
  rows.push(...page);
  if (page.length < 250) break;
}

const otherRegistries = new Map<string, number>();
let onRegistry = 0;
let canonical = 0;
const notCanonical: string[] = [];
for (const row of rows) {
  const match = PATTERN.exec(row.object?.label ?? '');
  if (match === null) continue;
  const [, registry = '', tokenId = ''] = match;
  if (registry.toLowerCase() !== REGISTRY) {
    otherRegistries.set(registry, (otherRegistries.get(registry) ?? 0) + 1);
    continue;
  }
  onRegistry += 1;
  if (row.subject?.data === thingUri(canonicalAgentThing(13579, tokenId))) canonical += 1;
  else notCanonical.push(tokenId);
}
const result = {
  at: new Date().toISOString(),
  chainId: 13579,
  registry: REGISTRY,
  sameAsEdges: rows.length,
  edgesToRegistry: onRegistry,
  canonicalSubject: canonical,
  notCanonicalTokens: notCanonical,
  edgesToOtherRegistriesOn13579: Object.fromEntries(otherRegistries),
};
console.log(JSON.stringify(result, null, 1));
const out = process.argv.indexOf('--json');
if (out !== -1 && process.argv[out + 1]) writeFileSync(process.argv[out + 1] as string, `${JSON.stringify(result, null, 1)}\n`);
