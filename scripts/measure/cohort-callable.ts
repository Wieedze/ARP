/** How many cohort agents are callable — i.e. can act as a TOOL for another agent?
 *
 *  The basis for `docs/14_THE_WITNESS_PROBLEM.md`: the witness set is the callable set, and it is
 *  two orders of magnitude smaller than the cohort.
 *
 *      bun run scripts/measure/cohort-callable.ts 250
 *
 *  Read-only: one `eth_call` of `tokenURI` per id, one GET of the registration file, one protocol
 *  probe per probeable protocol endpoint. 8 s timeouts, courtesy user-agent, no retries.
 *
 *  Measured 2026-10-16 over 250 ids / 122 parsed documents: 63 declare a protocol endpoint (51.6%,
 *  95% CI 42.9-60.3%) and 3 answer one (2.5%, CI 0.8-7.0%). Quote the interval, not the point
 *  estimate — at n=3 the extrapolation spans 741 to 6,160 agents. A declared endpoint that cannot be
 *  probed (templated `{placeholder}`, CAIP or ENS identifier) is skipped, never counted as dead:
 *  see the three groups in `tasks/17-the-external-verifier.md`. */
import { highestTokenId } from './erc8004-population.js';
import type { JsonRpcReply } from './shapes.js';
const RPC = 'https://base-rpc.publicnode.com';
const REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const UA = 'ARP-verifier/0.0 (measurement)';
const PROTOCOL_NAMES = new Set(['mcp', 'a2a', 'openai', 'rest', 'api', 'jsonrpc', 'grpc']);

async function tokenURI(id: number): Promise<string | null> {
  const data = '0xc87b56dd' + BigInt(id).toString(16).padStart(64, '0');
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: REGISTRY, data }, 'latest'],
    }),
    signal: AbortSignal.timeout(20000),
  });
  const j = (await r.json()) as JsonRpcReply;
  if (j.error || !j.result || j.result === '0x') return null;
  const hex = j.result.slice(2);
  const len = parseInt(hex.slice(64, 128), 16);
  if (!len) return null;
  const b = hex.slice(128, 128 + len * 2).match(/../g) ?? [];
  return new TextDecoder().decode(new Uint8Array(b.map((x) => parseInt(x, 16))));
}

// Read, never hardcoded — see `erc8004-population.ts`. A fixed 88243 sampled the oldest third.
const TOTAL = await highestTokenId(),
  N = Number(process.argv[2] ?? 250);
const ids = Array.from({ length: N }, () => 1 + Math.floor(Math.random() * TOTAL));

const c = {
  docs: 0,
  declaresProtocol: 0,
  probeable: 0,
  mcpOk: 0,
  mcpNo: 0,
  a2aOk: 0,
  a2aNo: 0,
  otherOk: 0,
};
const live: string[] = [];

await Promise.all(
  ids.map(async (id) => {
    const uri = await tokenURI(id).catch(() => null);
    if (!uri) return;
    const url = uri.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${uri.slice(7)}` : uri;
    let doc: any;
    try {
      if (url.startsWith('data:')) {
        const p = url.slice(url.indexOf(',') + 1);
        doc = JSON.parse(
          url.includes(';base64,')
            ? Buffer.from(p, 'base64').toString('utf8')
            : decodeURIComponent(p),
        );
      } else {
        const r = await fetch(url, {
          headers: { 'user-agent': UA },
          signal: AbortSignal.timeout(15000),
        });
        if (!r.ok) return;
        doc = await r.json();
      }
    } catch {
      return;
    }
    c.docs++;
    const eps = [...(doc.endpoints ?? []), ...(doc.services ?? [])].filter(
      (e) => e && typeof e === 'object',
    );
    const proto = eps.filter((e) =>
      PROTOCOL_NAMES.has(
        String(e.name ?? '')
          .toLowerCase()
          .trim(),
      ),
    );
    if (proto.length) c.declaresProtocol++;
    for (const e of proto) {
      const ep = String(e.endpoint ?? '');
      if (/\{[a-zA-Z_]+\}/.test(ep) || !/^https?:\/\//.test(ep)) continue;
      c.probeable++;
      const name = String(e.name).toLowerCase().trim();
      if (name === 'mcp') {
        try {
          const r = await fetch(ep, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json, text/event-stream',
              'user-agent': UA,
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'initialize',
              params: {
                protocolVersion: '2025-06-18',
                capabilities: {},
                clientInfo: { name: 'arp', version: '0' },
              },
            }),
            signal: AbortSignal.timeout(8000),
          });
          const txt = (await r.text()).slice(0, 300);
          if (r.ok && /"result"/.test(txt)) {
            c.mcpOk++;
            live.push(`MCP  #${id} ${ep}`);
          } else {
            c.mcpNo++;
          }
        } catch {
          c.mcpNo++;
        }
      } else if (name === 'a2a') {
        // A2A advertises an agent card; try the well-known path and the endpoint itself
        let ok = false;
        for (const u of [ep.replace(/\/$/, '') + '/.well-known/agent.json', ep]) {
          try {
            const r = await fetch(u, {
              headers: { 'user-agent': UA },
              signal: AbortSignal.timeout(8000),
            });
            if (r.ok) {
              const t = await r.text();
              if (/"name"|"skills"|"capabilities"/.test(t)) {
                ok = true;
                break;
              }
            }
          } catch {
            /* next */
          }
        }
        if (ok) {
          c.a2aOk++;
          live.push(`A2A  #${id} ${ep}`);
        } else c.a2aNo++;
      } else {
        try {
          const r = await fetch(ep, {
            headers: { 'user-agent': UA },
            signal: AbortSignal.timeout(8000),
          });
          if (r.status < 500) {
            c.otherOk++;
            live.push(`${name.toUpperCase()} #${id} ${ep}`);
          }
        } catch {
          /* dead */
        }
      }
    }
  }),
);

console.log(`sampled ${N} of ${TOTAL}; ${c.docs} documents parsed\n`, c);
const callable = c.mcpOk + c.a2aOk + c.otherOk;
console.log(
  `\nCALLABLE (could serve another agent): ${callable} of ${c.docs} parsed docs = ${((100 * callable) / Math.max(c.docs, 1)).toFixed(1)}%`,
);
console.log(
  `extrapolated over ${TOTAL}: ~${Math.round((TOTAL * callable) / Math.max(c.docs, 1)).toLocaleString('en-US')} (wide error bars at this n)`,
);
console.log(
  `MCP: ${c.mcpOk} speak it / ${c.mcpOk + c.mcpNo} declared   A2A: ${c.a2aOk} / ${c.a2aOk + c.a2aNo}`,
);
console.log('\nlive:');
live.slice(0, 14).forEach((l) => console.log('  ' + l));
