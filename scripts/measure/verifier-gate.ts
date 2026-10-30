/** Report a cohort walk's three groups, and the one `curl` that reproduces each confirmed row.
 *
 *      bun run scripts/measure/verifier-gate.ts <cohort.json>
 *
 *  The gate of `docs/tasks/17` asks for two things a walk alone does not give: the three groups
 *  **visibly separated**, and any `confirmed` row reproducible by a reviewer in one request. The
 *  first is `verify-cohort.ts`'s own summary; this adds the second, and re-derives the first from
 *  the written file so neither needs a second pass over a hundred third-party hosts.
 *
 *  Reads a file. Makes no network request of its own.
 */
import { readFileSync } from 'node:fs';

type Outcome = {
  status: 'confirmed' | 'not-checkable' | 'inconclusive';
  code: string;
  httpStatus?: number;
  request?: { method: string; url: string };
  detail?: string;
};
type Endpoint = {
  name: string | null;
  protocol: string | null;
  outcome: Outcome;
};
type Agent = {
  tokenId: string;
  document: { status: string; url?: string; httpStatus?: number };
  endpoints: Endpoint[];
};
type Walk = {
  generatedAt: string;
  registry: string;
  cohortSize: number;
  userAgent: string;
  requestsMade: number;
  agents: Agent[];
};

const path = process.argv[2];
if (path === undefined) {
  console.error('usage: bun run scripts/measure/verifier-gate.ts <cohort.json>');
  process.exit(1);
}

const walk = JSON.parse(readFileSync(path, 'utf8')) as Walk;
const agents = walk.agents;
const endpoints = agents.flatMap((a) => a.endpoints.map((e) => ({ tokenId: a.tokenId, ...e })));
const of = (status: Outcome['status']) => endpoints.filter((e) => e.outcome.status === status);

const tally = (rows: { outcome: Outcome }[]) => {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.outcome.code, (counts.get(r.outcome.code) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
};

const line = '─'.repeat(78);
console.log(`\ncohort walk ${walk.generatedAt}`);
console.log(`registry ${walk.registry} · sampled from ${walk.cohortSize.toLocaleString()} minted`);
console.log(`n = ${agents.length} agents · ${walk.requestsMade} network requests`);

console.log(`\n${line}\nDOCUMENT LAYER\n${line}`);
for (const status of ['read', 'no-token-uri', 'unreachable']) {
  const n = agents.filter((a) => a.document.status === status).length;
  console.log(`  ${status.padEnd(14)} ${String(n).padStart(4)}`);
}

// The numbering is `docs/tasks/17` §"The three groups"'s, not this script's: 1 is the confirmed fact,
// 2 is unprobeable, 3 is "we might be wrong". It was 1 and 2 swapped here, which separated them
// correctly and mislabelled them against the spec a reviewer reads alongside the output.
//
// Group 2 is kept apart from group 1 on purpose, whichever is larger on the day: an endpoint
// nobody can probe says nothing against the agent that declared it, and rendering it beside a
// failure would mass-slander the cohort.
const groups = [
  ['GROUP 1 · CONFIRMED — reproducible below', of('confirmed')],
  ['GROUP 2 · NOT CHECKABLE — the agent did nothing wrong', of('not-checkable')],
  ['GROUP 3 · INCONCLUSIVE — we may be the ones at fault', of('inconclusive')],
] as const;

for (const [title, rows] of groups) {
  console.log(`\n${line}\n${title}\n${line}`);
  console.log(`  ${rows.length} of ${endpoints.length} declared endpoints`);
  for (const [code, n] of tally(rows)) console.log(`    ${String(n).padStart(4)}  ${code}`);
}

// Only an endpoint that NAMED a protocol can serve one, so that is the denominator. Measured
// against every probed endpoint it would be diluted by web links and npm pages.
const named = endpoints.filter((e) => e.protocol !== null && e.outcome.status !== 'not-checkable');
const serves = named.filter((e) => e.outcome.code === 'serves-declared-protocol').length;
// Three numbers, because two of them get quoted as each other. `namedAll` is how many declared a
// protocol, `named.length` how many of those were probeable, `serves` how many of those answered.
// "89 of 89" without the middle term reads as "every endpoint that named one", which it is not —
// on the 2026-10-27 walk 93 named one and 4 of them were templated.
const namedAll = endpoints.filter((e) => e.protocol !== null).length;
console.log(`\n${line}`);
console.log(`named a protocol:             ${String(namedAll).padStart(4)}`);
console.log(`  of those, probeable:        ${String(named.length).padStart(4)}`);
console.log(`  of those probed, serves it: ${String(serves).padStart(4)}`);
console.log(line);

// **The concentration, printed before anything is read as a cohort property.** A uniform sample of
// a registry one operator minted most of is a sample of that operator. On the 2026-10-27 walk 89 of
// 100 agents and 178 of 178 probed endpoints were one host, so "89 of 89 serve their declared
// protocol" is a fact about one deployment and not about ERC-8004. `rules/claims.md` §2: one
// number, one context — and the context is the host, not the chain.
const hostOf = (url: string | undefined) => {
  if (url === undefined) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};
const docHosts = new Map<string, number>();
for (const a of agents) {
  const host = hostOf(a.document.url);
  if (host !== null) docHosts.set(host, (docHosts.get(host) ?? 0) + 1);
}
const probeHosts = new Map<string, number>();
for (const e of endpoints) {
  const host = hostOf(e.outcome.request?.url);
  if (host !== null) probeHosts.set(host, (probeHosts.get(host) ?? 0) + 1);
}
const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log(`\n${line}\nWHOSE SAMPLE IS THIS — read every figure above against it\n${line}`);
console.log('  registration files, by host:');
for (const [host, n] of top(docHosts)) console.log(`    ${String(n).padStart(4)}  ${host}`);
console.log('  probed endpoints, by host:');
for (const [host, n] of top(probeHosts)) console.log(`    ${String(n).padStart(4)}  ${host}`);
const [leader] = top(docHosts);
if (leader !== undefined && leader[1] > agents.length / 2) {
  console.log(
    `\n  ${leader[1]} of ${agents.length} sampled agents are ${leader[0]}. Every rate above is`,
  );
  console.log("  that operator's, not the cohort's. Do not quote one as the other.");
}

console.log('\nREPRODUCE ANY CONFIRMED ROW — one request each:\n');
for (const row of of('confirmed')) {
  const request = row.outcome.request;
  if (request === undefined) continue;
  console.log(`  # agent ${row.tokenId} · ${row.outcome.code} · HTTP ${row.outcome.httpStatus}`);
  console.log(
    `  curl -sS -o /dev/null -w '%{http_code}\\n' -A '${walk.userAgent}' '${request.url}'`,
  );
}
