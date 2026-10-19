/** What tool or skill surface does the cohort already declare on-chain? Read-only.
 *
 *  Committed because its figure was being quoted in five places from an uncommitted script — which
 *  `rules/claims.md` forbids outright: commit the script, not the number. The figure in question is
 *  "0 of N parsed documents declared an endpoint capability", which is why the rig declares one at
 *  all: it is the rare case and the one the code is least exercised against.
 *
 *      bun run scripts/measure-cohort-skills.ts 200
 *
 *  Read-only: one `eth_call` of `tokenURI` per sampled id and one GET of the registration file.
 *  Signs nothing. Uniform sampling over token ids, so quote n with any figure taken from it —
 *  consecutive runs at n=200 have returned 112 and 113 parsed documents. */
const RPC = 'https://base-rpc.publicnode.com';
const REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const UA = 'ARP-verifier/0.0 measurement';

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
  const j = await r.json();
  if (j.error || !j.result || j.result === '0x') return null;
  const hex = j.result.slice(2);
  const len = parseInt(hex.slice(64, 128), 16);
  if (!len) return null;
  const b = hex.slice(128, 128 + len * 2).match(/../g) ?? [];
  return new TextDecoder().decode(new Uint8Array(b.map((x) => parseInt(x, 16))));
}

const TOTAL = 88243,
  N = Number(process.argv[2] ?? 200);
const ids = Array.from({ length: N }, () => 1 + Math.floor(Math.random() * TOTAL));

const t = {
  docs: 0,
  withAnyToolSurface: 0,
  oasfSkills: 0,
  capabilities: 0,
  tags: 0,
  x402: 0,
  supportedTrust: 0,
  totalNamedTools: 0,
  totalSkills: 0,
};
const skillVocab = new Map<string, number>();
const toolVocab = new Map<string, number>();
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

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
    t.docs++;
    let any = false;

    const skills = doc.oasf_skills ?? doc.skills;
    if (Array.isArray(skills) && skills.length) {
      t.oasfSkills++;
      any = true;
      t.totalSkills += skills.length;
      for (const s of skills)
        bump(skillVocab, typeof s === 'string' ? s : JSON.stringify(s?.name ?? s).slice(0, 40));
    }
    const eps = [...(doc.endpoints ?? []), ...(doc.services ?? [])].filter(
      (e) => e && typeof e === 'object',
    );
    for (const e of eps) {
      const caps = Array.isArray(e.capabilities) ? e.capabilities : [];
      if (caps.length) {
        t.capabilities++;
        any = true;
        t.totalNamedTools += caps.length;
        for (const c of caps) bump(toolVocab, String(c).slice(0, 40));
      }
    }
    if (Array.isArray(doc.tags) && doc.tags.length) {
      t.tags++;
      any = true;
    }
    if (doc.x402Support === true) t.x402++;
    if (Array.isArray(doc.supportedTrust) && doc.supportedTrust.length) t.supportedTrust++;
    if (any) t.withAnyToolSurface++;
  }),
);

console.log(`sampled ${N} random ids of ${TOTAL}; ${t.docs} documents parsed\n`);
const pc = (n: number) => `${n} (${t.docs ? ((100 * n) / t.docs).toFixed(0) : 0}% of parsed)`;
console.log('declares oasf_skills/skills ', pc(t.oasfSkills), `· ${t.totalSkills} skill entries`);
console.log(
  'declares endpoint caps      ',
  pc(t.capabilities),
  `· ${t.totalNamedTools} named tools`,
);
console.log('declares tags               ', pc(t.tags));
console.log('declares supportedTrust     ', pc(t.supportedTrust));
console.log('x402Support true            ', pc(t.x402));
console.log('ANY machine-readable surface', pc(t.withAnyToolSurface));
console.log('\ndistinct skill labels:', skillVocab.size);
[...skillVocab.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12)
  .forEach(([k, v]) => console.log(`   ${v}x ${k}`));
console.log('\ndistinct tool names:', toolVocab.size);
[...toolVocab.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12)
  .forEach(([k, v]) => console.log(`   ${v}x ${k}`));
