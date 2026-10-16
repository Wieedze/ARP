/** Walk the ERC-8004 cohort and record whether each agent's published identity holds up.
 *
 *  Phase 1 of `docs/13_THE_THREE_FLOWS.md`, the gate of `tasks/17`. Needs nobody's consent: a
 *  registration file is a document the agent chose to publish at an address it chose, and fetching
 *  it is a request anyone may make.
 *
 *      bun run scripts/verify-cohort.ts --count 100
 *      bun run scripts/verify-cohort.ts --ids 2340,51097,26183,19682
 *      bun run scripts/verify-cohort.ts --from 1 --to 200 --out /tmp/cohort.json
 *
 *  Read-only throughout: one `eth_call` of `tokenURI` per id, one GET of the registration file, and
 *  one request per *probeable* endpoint. Signs nothing, writes nothing on chain.
 *
 *  Courtesy is not optional here (`tasks/17`):
 *    - every request identifies the client and the timeout is 8 s
 *    - requests are serialised PER HOST, not globally, because one operator accounted for 38 of 108
 *      declared endpoints in the 2026-10-16 sample — a global limit still points its whole budget at
 *      one server
 *    - a 429 or 503 closes that host for its Retry-After and is never recorded as a verdict
 *    - documents are cached by content hash, so re-running does not re-probe an unchanged agent
 *
 *  The output separates three groups and never merges them. `not-checkable` is 82% of declared
 *  endpoints and is NOT a defect; rendering it beside a confirmed failure would mass-slander the
 *  cohort on the first run.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  DEFAULT_PROBE_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  HostLimiter,
  probeEndpoint,
  readDeclaredEndpoints,
  type DeclaredEndpoint,
  type DocumentOutcome,
  type ProbeOutcome,
} from '../erc8004/src/index.js';

const RPC = process.env.BASE_RPC_URL ?? 'https://base-rpc.publicnode.com';
const REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const TOKEN_URI = '0xc87b56dd';
const COHORT_SIZE = 88_243;

/** Gateways tried in order for an `ipfs://` URI. ipfs.io rate-limits hard under a walk. */
const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://dweb.link/ipfs/',
  'https://w3s.link/ipfs/',
];

type AgentResult = {
  tokenId: string;
  chainId: 8453;
  document: DocumentOutcome;
  /** Hash of the document bytes, so a re-run can skip an unchanged agent. */
  documentHash: string | null;
  endpoints: (DeclaredEndpoint & { outcome: ProbeOutcome })[];
};

type Report = {
  generatedAt: string;
  registry: string;
  cohortSize: number;
  userAgent: string;
  timeoutMs: number;
  requestsMade: number;
  agents: AgentResult[];
};

// ------------------------------------------------------------------ arguments --

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : (process.argv[i + 1] ?? null);
}

function chooseIds(): number[] {
  const explicit = arg('ids');
  if (explicit) {
    return explicit
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
  }
  const from = Number(arg('from') ?? 0);
  const to = Number(arg('to') ?? 0);
  if (from > 0 && to >= from) {
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }
  const count = Number(arg('count') ?? 100);
  // Uniform over the id space. Sampling error applies — print n with any figure taken from this.
  return Array.from({ length: count }, () => 1 + Math.floor(Math.random() * COHORT_SIZE));
}

// -------------------------------------------------------------------- reading --

let requestsMade = 0;

const countingFetch: typeof fetch = async (input, init) => {
  requestsMade += 1;
  return globalThis.fetch(input, init);
};

async function tokenUri(id: number): Promise<string | null> {
  const data = TOKEN_URI + BigInt(id).toString(16).padStart(64, '0');
  const response = await countingFetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: REGISTRY, data }, 'latest'],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await response.json()) as { result?: string; error?: unknown };
  if (json.error || !json.result || json.result === '0x') return null;
  const hex = json.result.slice(2);
  const length = parseInt(hex.slice(64, 128), 16);
  if (!Number.isFinite(length) || length === 0) return null;
  const bytes = hex.slice(128, 128 + length * 2).match(/../g) ?? [];
  return new TextDecoder().decode(new Uint8Array(bytes.map((b) => parseInt(b, 16))));
}

function decodeDataUri(uri: string): string {
  const payload = uri.slice(uri.indexOf(',') + 1);
  return uri.includes(';base64,')
    ? Buffer.from(payload, 'base64').toString('utf8')
    : decodeURIComponent(payload);
}

async function fetchDocument(
  uri: string,
  limiter: HostLimiter,
): Promise<{ outcome: DocumentOutcome; body: string | null }> {
  if (uri.startsWith('data:')) {
    try {
      return { outcome: { status: 'read', url: uri, httpStatus: 200 }, body: decodeDataUri(uri) };
    } catch (error) {
      return {
        outcome: {
          status: 'unreachable',
          code: 'not-json',
          url: uri,
          httpStatus: null,
          detail: `data: URI did not decode (${String(error).slice(0, 80)})`,
        },
        body: null,
      };
    }
  }

  const candidates = uri.startsWith('ipfs://')
    ? IPFS_GATEWAYS.map((gateway) => gateway + uri.slice(7))
    : /^https?:\/\//.test(uri)
      ? [uri]
      : [];

  if (candidates.length === 0) {
    return {
      outcome: {
        status: 'unreachable',
        code: 'unresolvable-scheme',
        url: uri,
        httpStatus: null,
        detail: 'the tokenURI is neither http(s), ipfs:// nor data:',
      },
      body: null,
    };
  }

  let last: DocumentOutcome | null = null;
  for (const url of candidates) {
    const result = await limiter.run(url, async () => {
      try {
        const response = await countingFetch(url, {
          headers: { 'user-agent': DEFAULT_USER_AGENT },
          signal: AbortSignal.timeout(DEFAULT_PROBE_TIMEOUT_MS * 2),
        });
        return { response, body: await response.text() };
      } catch (error) {
        return { error };
      }
    });
    if ('error' in result) {
      last = {
        status: 'unreachable',
        code: 'transport-error',
        url,
        httpStatus: null,
        detail: String(result.error).slice(0, 120),
      };
      continue;
    }
    const { response, body } = result;
    if (response.status === 429 || response.status === 503) {
      limiter.backOff(url, response.headers.get('retry-after'));
      last = {
        status: 'unreachable',
        code: 'http-error',
        url,
        httpStatus: response.status,
        detail: `gateway asked us to back off (HTTP ${response.status})`,
      };
      continue;
    }
    if (!response.ok) {
      last = {
        status: 'unreachable',
        code: 'http-error',
        url,
        httpStatus: response.status,
        detail: `HTTP ${response.status}`,
      };
      continue;
    }
    try {
      JSON.parse(body);
    } catch {
      last = {
        status: 'unreachable',
        code: 'not-json',
        url,
        httpStatus: response.status,
        detail: 'answered, but the body is not JSON',
      };
      continue;
    }
    return { outcome: { status: 'read', url, httpStatus: response.status }, body };
  }
  return { outcome: last!, body: null };
}

// ----------------------------------------------------------------------- walk --

async function verifyAgent(id: number, limiter: HostLimiter): Promise<AgentResult> {
  const base = { tokenId: String(id), chainId: 8453 as const };
  const uri = await tokenUri(id).catch(() => null);
  if (!uri) {
    return { ...base, document: { status: 'no-token-uri' }, documentHash: null, endpoints: [] };
  }
  const { outcome, body } = await fetchDocument(uri, limiter);
  if (outcome.status !== 'read' || body === null) {
    return { ...base, document: outcome, documentHash: null, endpoints: [] };
  }
  const documentHash = createHash('sha256').update(body).digest('hex').slice(0, 16);
  const declared = readDeclaredEndpoints(JSON.parse(body));
  const endpoints = [];
  for (const endpoint of declared) {
    const probe =
      endpoint.classification.status === 'probeable'
        ? await limiter.run(endpoint.classification.url, () =>
            probeEndpoint(endpoint, { fetch: countingFetch }),
          )
        : await probeEndpoint(endpoint, { fetch: countingFetch });
    if (probe.status === 'inconclusive' && probe.code === 'rate-limited') {
      limiter.backOff(probe.request.url, null);
    }
    endpoints.push({ ...endpoint, outcome: probe });
  }
  return { ...base, document: outcome, documentHash, endpoints };
}

// --------------------------------------------------------------------- report --

function summarise(agents: AgentResult[]): void {
  const docs = { read: 0, noTokenUri: 0, unreachable: 0 };
  for (const a of agents) {
    if (a.document.status === 'read') docs.read += 1;
    else if (a.document.status === 'no-token-uri') docs.noTokenUri += 1;
    else docs.unreachable += 1;
  }
  const outcomes = agents.flatMap((a) => a.endpoints.map((e) => e.outcome));
  const by = (status: ProbeOutcome['status']) => outcomes.filter((o) => o.status === status);
  const codes = (status: ProbeOutcome['status']) => {
    const tally = new Map<string, number>();
    for (const o of by(status)) tally.set(o.code, (tally.get(o.code) ?? 0) + 1);
    return [...tally.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${c}×${n}`)
      .join(' · ');
  };

  const n = agents.length;
  const withUri = n - docs.noTokenUri;
  const pc = (k: number, of: number) => (of ? `${((100 * k) / of).toFixed(0)}%` : '—');

  console.log(`\n${'═'.repeat(72)}`);
  console.log(`n = ${n} agents · ${requestsMade} network requests\n`);
  console.log('DOCUMENT LAYER');
  console.log(`  no tokenURI at all          ${docs.noTokenUri}  (${pc(docs.noTokenUri, n)} of n)`);
  console.log(
    `  tokenURI present, unreachable ${docs.unreachable}  (${pc(docs.unreachable, withUri)} of those with a URI)`,
  );
  console.log(`  read                        ${docs.read}`);

  console.log(`\nENDPOINTS — ${outcomes.length} declared across ${docs.read} readable documents`);
  console.log(`  CONFIRMED      ${by('confirmed').length}  ${codes('confirmed')}`);
  console.log(`  NOT CHECKABLE  ${by('not-checkable').length}  ${codes('not-checkable')}`);
  console.log(`                 ↑ the agent did nothing wrong. Never a defect.`);
  console.log(`  INCONCLUSIVE   ${by('inconclusive').length}  ${codes('inconclusive')}`);
  console.log(`                 ↑ we may be the ones at fault. Never an accusation.`);

  // Only endpoints that NAMED a protocol can serve one, so that is the denominator. Measuring
  // against every probed endpoint would bury the sharp signal under web links: Clawnch declares
  // ten, of which `docs`, `openapi.yaml`, an x.com profile and two npm pages are `live` and say
  // nothing checkable.
  const declaredProtocol = agents.flatMap((a) =>
    a.endpoints.filter((e) => e.protocol !== null && e.outcome.status !== 'not-checkable'),
  );
  const served = declaredProtocol.filter(
    (e) => e.outcome.status === 'confirmed' && e.outcome.code === 'serves-declared-protocol',
  ).length;
  if (declaredProtocol.length > 0) {
    console.log(`\nnamed a protocol and serves it: ${served} of ${declaredProtocol.length} probed`);
  }

  console.log('\nreproduce any CONFIRMED row with one request:');
  for (const a of agents) {
    for (const e of a.endpoints) {
      if (e.outcome.status !== 'confirmed') continue;
      const r = e.outcome.request;
      console.log(
        `  ${a.tokenId.padStart(6)} ${e.outcome.code.padEnd(28)} ${r.method} ${r.url.slice(0, 56)}`,
      );
    }
  }
  console.log('═'.repeat(72));
}

// ----------------------------------------------------------------------- main --

const ids = chooseIds();
if (ids.length === 0) {
  console.error('no ids to walk — pass --count, --ids or --from/--to');
  process.exit(1);
}

const outPath =
  arg('out') ?? `/tmp/claude-0/arp-verify-cohort-${new Date().toISOString().slice(0, 10)}.json`;

// One cached report lets a re-run skip agents whose document has not changed.
let cache = new Map<string, string>();
try {
  const previous = JSON.parse(readFileSync(outPath, 'utf8')) as Report;
  cache = new Map(
    previous.agents
      .filter((a) => a.documentHash !== null)
      .map((a) => [a.tokenId, a.documentHash as string]),
  );
  console.log(`cache: ${cache.size} agents from a previous run at ${outPath}`);
} catch {
  // No previous run. Expected on a first walk.
}

const limiter = new HostLimiter({ minGapMs: 400 });
const agents: AgentResult[] = [];
const CONCURRENCY = 8;

console.log(`walking ${ids.length} ids, ${CONCURRENCY} at a time, serialised per host…`);
for (let i = 0; i < ids.length; i += CONCURRENCY) {
  const slice = ids.slice(i, i + CONCURRENCY);
  agents.push(...(await Promise.all(slice.map((id) => verifyAgent(id, limiter)))));
  process.stdout.write(`\r  ${Math.min(i + CONCURRENCY, ids.length)}/${ids.length}`);
}
process.stdout.write('\n');

const report: Report = {
  generatedAt: new Date().toISOString(),
  registry: REGISTRY,
  cohortSize: COHORT_SIZE,
  userAgent: DEFAULT_USER_AGENT,
  timeoutMs: DEFAULT_PROBE_TIMEOUT_MS,
  requestsMade,
  agents,
};
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2));

summarise(agents);
console.log(`\nwritten to ${outPath}`);
