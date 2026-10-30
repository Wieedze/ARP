/** Classify declared endpoints in the Base ERC-8004 cohort by what a verifier can check.
 *
 *  The empirical basis for Phase 1 of `docs/13_THE_THREE_FLOWS.md`. Run it before changing
 *  the verifier's classification: the shape of the cohort is the reason the classes are what
 *  they are, and it moves.
 *
 *      bun run scripts/measure/cohort-endpoints.ts 140
 *
 *  Read-only throughout: one `eth_call` of `tokenURI` per sampled id, one GET of the resolved
 *  registration file, one GET per probeable endpoint, one `initialize` POST per declared MCP
 *  endpoint. 8 s timeouts, a courtesy user-agent, no retries. Signs nothing, writes nothing.
 *
 *  Sampling is uniform over token ids 1..TOTAL, so results carry sampling error; print n with
 *  any number taken from it. Not every class it counts is a defect — see the three groups in
 *  the task spec. `templated` and non-HTTP identifiers are *unprobeable*, not broken. */
import { highestTokenId } from './erc8004-population.js';
import type { JsonRpcReply } from '../helpers/shapes.js';
const RPC = 'https://base-rpc.publicnode.com';
const REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const UA = 'ARP-verifier/0.0 (+https://github.com/Wieedze/ARP) measurement';

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
  N = Number(process.argv[2] ?? 120);
const ids = Array.from({ length: N }, () => 1 + Math.floor(Math.random() * TOTAL));

const c = {
  docs: 0,
  noUri: 0,
  docFail: 0,
  noEndpoint: 0,
  eps: 0,
  templated: 0,
  notUrl: 0,
  live: 0,
  dead: 0,
  mcpDeclared: 0,
  mcpServes: 0,
  mcpWrongShape: 0,
};
const evidence: string[] = [];

await Promise.all(
  ids.map(async (id) => {
    const uri = await tokenURI(id).catch(() => null);
    if (!uri) {
      c.noUri++;
      return;
    }
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
        if (!r.ok) {
          c.docFail++;
          return;
        }
        doc = await r.json();
      }
    } catch {
      c.docFail++;
      return;
    }
    c.docs++;
    const eps = [...(doc.endpoints ?? []), ...(doc.services ?? [])].filter(
      (e) => e && typeof e === 'object',
    );
    if (!eps.length) {
      c.noEndpoint++;
      return;
    }
    for (const e of eps) {
      c.eps++;
      const ep = String(e.endpoint ?? '');
      const name = String(e.name ?? '').toLowerCase();
      if (/\{[a-zA-Z_]+\}/.test(ep)) {
        c.templated++;
        continue;
      }
      if (!/^https?:\/\//.test(ep)) {
        c.notUrl++;
        if (evidence.length < 14)
          evidence.push(`not-a-url      #${id} ${name || '?'} → ${ep.slice(0, 60)}`);
        continue;
      }
      let ok = false;
      try {
        const r = await fetch(ep, {
          method: 'GET',
          headers: { 'user-agent': UA },
          signal: AbortSignal.timeout(8000),
        });
        ok = r.status < 500;
      } catch {
        ok = false;
      }
      if (ok) c.live++;
      else {
        c.dead++;
        if (evidence.length < 14)
          evidence.push(`dead           #${id} ${name || '?'} → ${ep.slice(0, 60)}`);
      }
      if (name === 'mcp') {
        c.mcpDeclared++;
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
                clientInfo: { name: 'arp-verifier', version: '0.0' },
              },
            }),
            signal: AbortSignal.timeout(8000),
          });
          const txt = (await r.text()).slice(0, 200);
          if (r.ok && /"result"/.test(txt)) {
            c.mcpServes++;
            if (evidence.length < 14) evidence.push(`mcp ok         #${id} → ${ep.slice(0, 50)}`);
          } else {
            c.mcpWrongShape++;
            if (evidence.length < 14)
              evidence.push(
                `mcp NOT mcp    #${id} → ${ep.slice(0, 45)} :: ${txt.replace(/\s+/g, ' ').slice(0, 60)}`,
              );
          }
        } catch {
          c.mcpWrongShape++;
        }
      }
    }
  }),
);

console.log(`sampled ${N} random ids of ${TOTAL}\n`, c);
const d = c.eps || 1;
console.log(`\nof ${c.eps} declared endpoints:`);
console.log(
  `  templated (unsubstituted {placeholder})  ${c.templated}  ${((100 * c.templated) / d).toFixed(0)}%`,
);
console.log(
  `  not a URL at all                         ${c.notUrl}  ${((100 * c.notUrl) / d).toFixed(0)}%`,
);
console.log(`  resolvable & answered                    ${c.live}`);
console.log(`  resolvable & dead/5xx/timeout            ${c.dead}`);
console.log(
  `\ndeclared name "mcp": ${c.mcpDeclared} → speaks MCP ${c.mcpServes}, does not ${c.mcpWrongShape}`,
);
console.log('\nevidence:');
evidence.forEach((e) => console.log('  ' + e));
