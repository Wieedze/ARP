/** Every host literal and every `fetch` call site in the node's own modules.
 *
 *      bun run scripts/measure/node-outbound.ts
 *      bun run scripts/measure/node-outbound.ts --json measurements/node-outbound-<date>.json
 *
 *  Reads files. No network, no chain, nothing to sign.
 *
 *  ## Why this is a script and not a sentence
 *
 *  `docs/22` exists so somebody deciding whether to install the node can see what it reaches. Its
 *  outbound section has been wrong **twice**, in two review rounds, for the same reason both times:
 *
 *  ```
 *  round 2   "four fixed hosts … the only literals in the code"   there were five, and a
 *                                                                  second caller-steerable fetch
 *  round 3   "six URL literals", with a grep returning 116        the grep's scope was `scripts/`,
 *                                                                  the claim's scope was 3 files
 *  ```
 *
 *  Different sentences, identical failure: a security claim about what the node fetches, offered
 *  with a check whose scope does not match the claim. Four rounds of careful prose did not close
 *  it, and `claims.md` already names the lever — **commit the script, not the number.** Every
 *  figure in this task that came from a committed measurement was exact on the first try in both
 *  review rounds; every figure maintained by hand was wrong in both.
 *
 *  So the claim becomes a number somebody re-runs. `docs/22` cites this file and quotes its output.
 *
 *  ## The scope is a list, deliberately, and not a glob
 *
 *  `MODULES` below names the files the running node actually reaches. A glob over `scripts/` is
 *  what produced the 116 — it swept measurement scripts, demos and seeders that no node ever
 *  loads. If the node grows a module, add it here; the list being hand-maintained is the one thing
 *  this cannot check for itself, and it says so rather than implying otherwise.
 *
 *  ## What it cannot tell you
 *
 *  It reads text. A **literal** host is a host the source names; a **built** URL is one assembled
 *  from a value at runtime, and this can say where that happens and never what the value will be.
 *  That distinction is the point: the built ones are the ones that need a guard, and naming them is
 *  what `docs/22` has to do honestly.
 *
 *  **And it is not "every outbound connection", which its own first line used to claim.** A viem
 *  `http()` transport opens one and is neither a host literal nor a `fetch` call — the Intuition
 *  RPC reaches the network through `createPublicClient` in `declare/multivault.ts` and
 *  `sources/erc8004-registry/`, and appears here only because `notLiterals` says so in prose. The
 *  title is narrowed to what is actually enumerated rather than widening the patterns, because the
 *  RPC is already disclosed twice in `docs/22` and a title that overclaims is the failure this
 *  script exists to stop.
 */
import { readFileSync, writeFileSync } from 'node:fs';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

/**
 * The files a running node loads. Hand-maintained, which is this measurement's own weak point.
 *
 * `server.ts` is the entry point; `content.ts` is the content route; `tools.ts` is the tool
 * schemas. The three package modules are the ones those reach that fetch anything —
 * `content-path.ts` builds the raw URL, `probe.ts` holds both guards and the probe itself, and
 * `http.ts` is the shared transport, in `packages/graphql` since ADR `0082`.
 */
const MODULES = [
  'apps/mcp/src/server.ts',
  'apps/mcp/src/content.ts',
  'apps/mcp/src/tools.ts',
  'packages/protocol/src/content-path.ts',
  'packages/protocol/src/verify/probe.ts',
  'packages/graphql/src/http.ts',
] as const;

/**
 * `outbound` is a call that leaves the machine. The other two are listed on purpose — an
 * enumeration carrying a security claim should err toward listing — and labelled, because an
 * unlabelled over-inclusive count cannot be compared against anything.
 */
type SiteKind = 'outbound' | 'definition' | 'inbound';
type Site = { file: string; line: number; kind: SiteKind; text: string };

const hosts = new Map<string, Site[]>();
const fetches: Site[] = [];
const unread: string[] = [];

/** True for a line that is only a comment. A host named in prose is not a host the code reaches. */
function isComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*');
}

for (const file of MODULES) {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    unread.push(file);
    continue;
  }
  text.split('\n').forEach((line, index) => {
    if (isComment(line)) return;
    const site = (kind: SiteKind): Site => ({
      file,
      line: index + 1,
      kind,
      text: line.trim().slice(0, 140),
    });

    // A call site, not a DEFINITION. `async fetch(request: Request)` is the node's own HTTP
    // handler — inbound, and the first run of this listed it as an outbound connection.
    //
    // And **any identifier ending in `fetch`**, because `probe.ts` calls `doFetch(...)` after
    // `const doFetch = options.fetch ?? globalThis.fetch`. A regex anchored on the bare word
    // missed the probe's own fetch entirely — the exact incompleteness that makes a security
    // claim wrong, in the script written to stop a security claim being wrong.
    // `async fetch(request)` is the handler's definition and `handler.fetch(` is the stdio loop
    // dispatching to it — both inbound. The second was labelled `outbound` by the first version of
    // this classifier, which is the same over-count the labels exist to make visible.
    const isInbound =
      /\b(async\s+)?fetch\s*\(\s*(request|req)\b/.test(line) || /\bhandler\.fetch\s*\(/.test(line);
    const isDefinition = /\b(function|const|let)\s+\w*[Ff]etch\b/.test(line);
    const isCall = /(?<![A-Za-z_$.])fetch\s*\(/.test(line) || /\b\w*[Ff]etch\s*\(/.test(line);
    if (isCall) {
      fetches.push(site(isInbound ? 'inbound' : isDefinition ? 'definition' : 'outbound'));
    }

    for (const [, host] of line.matchAll(/https?:\/\/([A-Za-z0-9.\-[\]:]+)/g)) {
      if (host === undefined) continue;
      const found = hosts.get(host) ?? [];
      found.push(site('outbound'));
      hosts.set(host, found);
    }
  });
}

/** Hosts that are ARP's own. If any of these appear, the node phones home and `docs/22` lies. */
const OURS = ['arp', 'wieedze'];
const phoneHome = [...hosts.keys()].filter((host) =>
  OURS.some((ours) => host.toLowerCase().includes(ours)),
);

const out = {
  measuredAt: new Date().toISOString(),
  question:
    'Every host the node names in source, and every fetch call site. `docs/22` quotes this ' +
    'rather than a hand-maintained count, because that count was wrong twice.',
  limits:
    'Text, not execution. A LITERAL host is one the source names; a BUILT url is assembled from ' +
    'a value at runtime and this cannot say what the value will be — which is why the built ones ' +
    'are the ones that carry a guard. `modules` is hand-maintained and is what this cannot check. ' +
    'A literal is not necessarily a fetch target either — a host in a log line or a user-agent ' +
    'string is a literal and is fetched by nobody, so read `literalHosts` against ' +
    '`fetchCallSites` rather than as a list of destinations. And `fetchCallSites` is deliberately ' +
    "OVER-inclusive: a definition, or the stdio loop calling the node's own handler, appears " +
    'here too. An enumeration written to carry a security claim should err that way — a site it ' +
    "lists and should not is a reader's minute, and a site it misses is the claim being false.",
  notLiterals:
    'The Intuition graph and RPC are absent from `literalHosts` BECAUSE they are config — read ' +
    'from deployments/<chainId>.json or INTUITION_GRAPHQL_URL / INTUITION_RPC_URL at startup. ' +
    'Their absence here is correct and is not their absence from the node. Two more hosts are ' +
    'reachable and are not literals either, by design: the url a caller passes to ' +
    'arp_probe_endpoint, and the registrationFile out of an ERC-8004 tokenURI read through a ' +
    'registry whose address the caller supplies. Both go through `fetchableDocumentUrl` or ' +
    '`privateProbeTarget` first.',
  modules: MODULES,
  unread,
  counts: {
    modules: MODULES.length,
    distinctLiteralHosts: hosts.size,
    literalSites: [...hosts.values()].reduce((sum, sites) => sum + sites.length, 0),
    fetchCallSites: fetches.length,
    outboundFetchCallSites: fetches.filter((site) => site.kind === 'outbound').length,
    oursAmongThem: phoneHome.length,
  },
  literalHosts: [...hosts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([host, sites]) => ({ host, sites })),
  fetchCallSites: fetches,
  oursAmongThem: phoneHome,
};

console.log(`${out.counts.modules} modules the running node reaches`);
console.log(`${out.counts.distinctLiteralHosts} distinct host literals`);
console.log(
  `${out.counts.fetchCallSites} fetch call sites, ${out.counts.outboundFetchCallSites} of them outbound`,
);
console.log(`${out.counts.oursAmongThem} of the hosts are ours`);
console.log('');
for (const row of out.literalHosts) {
  console.log(`  ${row.host}`);
  for (const site of row.sites) console.log(`      ${site.file}:${site.line}`);
}
console.log('\nfetch call sites:');
for (const site of fetches) {
  console.log(`  ${site.kind.padEnd(10)} ${site.file}:${site.line}  ${site.text.slice(0, 80)}`);
}

if (phoneHome.length > 0) {
  console.error(`\n${phoneHome.length} host(s) are ours: ${phoneHome.join(', ')}`);
  console.error('`docs/22` claims nothing is sent to us. Correct one or the other.');
  process.exit(1);
}

const path = arg('json');
if (path !== undefined) {
  writeFileSync(path, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`\nwritten to ${path}`);
}

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
