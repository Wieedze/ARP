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
 *  one request per *probeable* endpoint — except an A2A endpoint declared as a directory, which
 *  costs up to three while the two well-known card paths are tried. (It cost three for **every**
 *  A2A endpoint until 2026-10-27; see `a2aCandidates` in `verify/probe.ts`.) Signs nothing, writes
 *  nothing on chain.
 *
 *  Courtesy is not optional here (`tasks/17`):
 *    - every request identifies the client and the timeout is 8 s
 *    - requests are serialised PER HOST, not globally, because one operator accounted for 38 of 108
 *      declared endpoints in the 2026-10-16 sample — a global limit still points its whole budget at
 *      one server
 *    - a 429 or 503 closes that host for its Retry-After and is never recorded as a verdict
 *    - a document hash is recorded per agent, so a future version can skip an unchanged one.
 *      **It does not skip today** — nothing reads it back (`tasks/21`).
 *
 *  The output separates three groups and never merges them. `not-checkable` is NOT a defect, and
 *  rendering it beside a confirmed failure would mass-slander the cohort. Its share moves a lot
 *  with who minted recently — 82% of declared endpoints in the 2026-10-16 sample, 4% on
 *  2026-10-27 — so the reason is the rule here, not the proportion.
 */
import { highestTokenId } from './erc8004-population.js';

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
} from '../packages/protocol/src/index.js';

const TOKEN_URI = '0xc87b56dd';

/**
 * The registries this walker knows, selected with `--target`.
 *
 * No chain constant at module scope (`rules/portability.md`): the target is config, defaulted, and
 * printed in the report so a result can never be read against the wrong chain.
 *
 * `cohortSize` only bounds `--count`'s uniform sample. On the testnet rig it is read from the
 * registry instead, because `totalAgents()` is small and moves — sampling 1..88243 there would miss
 * every agent.
 *
 * On Base it is **read too**, via `erc8004-population.ts`. It used to be the constant `88_243`,
 * which sampled the oldest third once the registry passed 300,000 — a sampling bias, not a stale
 * figure, since agents minted before the ~44,000-a-day rate are not a random sample of today's
 * cohort. ADR `0047`.
 */
const TARGETS = {
  base: {
    label: 'Base 8453 — the ERC-8004 cohort',
    chainId: 8453,
    rpc: process.env.BASE_RPC_URL ?? 'https://base-rpc.publicnode.com',
    registry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
    cohortSize: await highestTokenId(),
  },
  'intuition-testnet': {
    label: "Intuition testnet 13579 — ARP's own registry (the rig)",
    chainId: 13579,
    rpc: process.env.INTUITION_TESTNET_RPC_URL ?? 'https://testnet.rpc.intuition.systems/http',
    registry: '0xC165A2AD2E540A4069E02834009161E2b4490d5A',
    cohortSize: null,
  },
} as const;

type TargetName = keyof typeof TARGETS;

function pickTarget(): (typeof TARGETS)[TargetName] & { name: TargetName } {
  const requested = (arg('target') ?? 'base') as string;
  if (!(requested in TARGETS)) {
    console.error(`unknown --target ${requested}. Known: ${Object.keys(TARGETS).join(', ')}`);
    process.exit(1);
  }
  const name = requested as TargetName;
  return { ...TARGETS[name], name };
}

/** Gateways tried in order for an `ipfs://` URI. ipfs.io rate-limits hard under a walk. */
const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://dweb.link/ipfs/',
  'https://w3s.link/ipfs/',
];

type AgentResult = {
  tokenId: string;
  chainId: number;
  document: DocumentOutcome;
  /** Hash of the document bytes, so a re-run can skip an unchanged agent. */
  documentHash: string | null;
  endpoints: (DeclaredEndpoint & { outcome: ProbeOutcome })[];
};

type Report = {
  generatedAt: string;
  registry: string;
  cohortSize: number | null;
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

/** Chosen once, printed in the report, and never re-derived. */
const TARGET = pickTarget();

/**
 * `--tools` asks a confirmed MCP server what it serves.
 *
 * Opt-in because it is a second request per endpoint and one request is the courtesy baseline
 * (`tasks/17`). Worth passing: 0 of ~110 parsed documents across repeated n=200 samples (scripts/measure/cohort-skills.ts; the zero is stable, the denominator varies) declared a capability, while
 * every confirmed MCP server listed its tools — the runtime is where that data lives.
 */
const WANTS_TOOLS = process.argv.includes('--tools');

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
  if (TARGET.cohortSize === null) {
    console.error(
      `--count needs a known cohort size; ${TARGET.name} does not have one.\n` +
        `Read totalAgents() off ${TARGET.registry} and pass --from 1 --to N, or --ids.`,
    );
    process.exit(1);
  }
  return Array.from({ length: count }, () => 1 + Math.floor(Math.random() * TARGET.cohortSize));
}

// -------------------------------------------------------------------- reading --

let requestsMade = 0;

// Not `typeof fetch`: Bun's lib types that as an object carrying `preconnect`, which a
// counting wrapper has no business implementing. The call signature is what callers use.
const countingFetch = async (
  input: Parameters<typeof globalThis.fetch>[0],
  init?: Parameters<typeof globalThis.fetch>[1],
): Promise<Response> => {
  requestsMade += 1;
  return globalThis.fetch(input, init);
};

async function tokenUri(id: number): Promise<string | null> {
  const data = TOKEN_URI + BigInt(id).toString(16).padStart(64, '0');
  const response = await countingFetch(TARGET.rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: TARGET.registry, data }, 'latest'],
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
    // Decode AND parse. The `catch` used to cover only the decode, so a `data:` URI holding
    // non-JSON returned `status: 'read'` with an unparseable body — and `JSON.parse` downstream
    // then threw inside a `Promise.all`, killing a 100-agent walk on one malformed document. The
    // HTTP branch below has always validated the parse; this one did not, and that asymmetry is
    // what the gate found.
    try {
      const body = decodeDataUri(uri);
      JSON.parse(body);
      return { outcome: { status: 'read', url: uri, httpStatus: 200 }, body };
    } catch (error) {
      return {
        outcome: {
          status: 'unreachable',
          code: 'not-json',
          url: uri,
          httpStatus: null,
          detail: `data: URI did not decode to JSON (${String(error).slice(0, 80)})`,
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
  const base = { tokenId: String(id), chainId: TARGET.chainId };
  const uri = await tokenUri(id).catch(() => null);
  if (!uri) {
    return { ...base, document: { status: 'no-token-uri' }, documentHash: null, endpoints: [] };
  }
  const { outcome, body } = await fetchDocument(uri, limiter);
  if (outcome.status !== 'read' || body === null) {
    return { ...base, document: outcome, documentHash: null, endpoints: [] };
  }
  const documentHash = createHash('sha256').update(body).digest('hex').slice(0, 16);
  // Belt and braces, and the belt is what matters at 100 agents: `verifyAgent` runs inside a
  // `Promise.all`, so an exception here does not degrade one agent — it rejects the batch and
  // takes every result with it. Any future path that returns `read` without validating lands
  // softly instead of destroying the walk.
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    return {
      ...base,
      document: {
        status: 'unreachable',
        code: 'not-json',
        url: outcome.url,
        httpStatus: outcome.httpStatus,
        detail: `read, but did not parse (${String(error).slice(0, 80)})`,
      },
      documentHash,
      endpoints: [],
    };
  }
  const declared = readDeclaredEndpoints(parsed);
  const endpoints = [];
  for (const endpoint of declared) {
    const probe =
      endpoint.classification.status === 'probeable'
        ? await limiter.run(endpoint.classification.url, () =>
            probeEndpoint(endpoint, { fetch: countingFetch, listTools: WANTS_TOOLS }),
          )
        : await probeEndpoint(endpoint, { fetch: countingFetch, listTools: WANTS_TOOLS });
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
  // The chain, first line. The previous version printed neither, and its output was pasted into
  // tasks/24 and deployments/13579.json where it reads identically to a Base run.
  console.log(`${TARGET.label}`);
  console.log(`  registry ${TARGET.registry}  ·  chain ${TARGET.chainId}`);
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

  const recovered = agents.flatMap((a) =>
    a.endpoints.flatMap((e) =>
      e.outcome.status === 'confirmed' && e.outcome.servedTools
        ? [{ tokenId: a.tokenId, tools: e.outcome.servedTools.map((t) => t.name) }]
        : [],
    ),
  );
  if (WANTS_TOOLS) {
    console.log(`\ncapability lists recovered from the runtime: ${recovered.length}`);
    for (const r of recovered) {
      console.log(`  ${r.tokenId.padStart(6)}  ${r.tools.join(', ')}`);
    }
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

// The target is in the name. Without it a Base walk and a testnet walk on the same day collide on
// token id — observed: a Base run printed "cache: 3 agents from a previous run" loaded from the
// testnet walk. That is `portability.md` rule 2 inside the commit that introduced the rule.
const outPath =
  arg('out') ??
  `/tmp/claude-0/arp-verify-cohort-${TARGET.name}-${new Date().toISOString().slice(0, 10)}.json`;

// NOT A CACHE YET. A previous run is read only to report how many agents it held — nothing consumes
// it, and `verifyAgent` always re-fetches and re-probes. Kept because the file is the natural place
// for one and the count is useful to an operator, but the header no longer claims caching that does
// not exist, and `tasks/21` carries it as a defect. Wiring it up needs the document hash compared
// before the fetch, which is a change to `verifyAgent`, not to this block.
let previousCount = 0;
try {
  const previous = JSON.parse(readFileSync(outPath, 'utf8')) as Report;
  previousCount = previous.agents.filter((a) => a.documentHash !== null).length;
  console.log(
    `a previous run at ${outPath} held ${previousCount} agents — NOT reused, see tasks/21`,
  );
} catch {
  // No previous run. Expected on a first walk.
}

const limiter = new HostLimiter({ minGapMs: 400 });
const agents: AgentResult[] = [];
const CONCURRENCY = 8;

/**
 * One walk at a time, enforced by a lock file.
 *
 * Added because I started two walks by accident and for about five minutes both probed the same
 * third-party hosts — doubling a load nobody asked for, which `tasks/17` calls a hard requirement,
 * and interleaving two progress counters into one log so the output was unreadable. The courtesy
 * rules are all per-host and per-request; none of them can see a second process.
 *
 * The lock holds the pid and the start time, so a stale one from a crashed run says so rather than
 * blocking forever. `--force` overrides it for the case where that judgement is wrong.
 */
const lockPath = `${outPath}.lock`;
if (existsSync(lockPath) && !process.argv.includes('--force')) {
  const held = readFileSync(lockPath, 'utf8').trim();
  console.error(
    `another walk holds ${lockPath}: ${held}\n` +
      `Two walks probe the same hosts twice over, which tasks/17 forbids. Wait for it, or pass\n` +
      `--force if that process is gone.`,
  );
  process.exit(1);
}

writeFileSync(lockPath, `pid ${process.pid}, started ${new Date().toISOString()}`);
const releaseLock = () => {
  try {
    rmSync(lockPath, { force: true });
  } catch {
    /* the report is written; a leftover lock is a nuisance, not a failure */
  }
};
process.on('exit', releaseLock);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    releaseLock();
    process.exit(130);
  });
}

console.log(`walking ${ids.length} ids, ${CONCURRENCY} at a time, serialised per host…`);
for (let i = 0; i < ids.length; i += CONCURRENCY) {
  const slice = ids.slice(i, i + CONCURRENCY);
  agents.push(...(await Promise.all(slice.map((id) => verifyAgent(id, limiter)))));
  process.stdout.write(`\r  ${Math.min(i + CONCURRENCY, ids.length)}/${ids.length}`);
}
process.stdout.write('\n');

const report: Report = {
  generatedAt: new Date().toISOString(),
  registry: TARGET.registry,
  cohortSize: TARGET.cohortSize,
  userAgent: DEFAULT_USER_AGENT,
  timeoutMs: DEFAULT_PROBE_TIMEOUT_MS,
  requestsMade,
  agents,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2));

summarise(agents);
console.log(`\nwritten to ${outPath}`);
