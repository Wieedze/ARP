/** Do cohort agents actually transact on-chain? Read-only, keyless.
 *
 *  The precondition for `tasks/22` — the chain as witness. If these accounts never transact there is
 *  no calldata to derive usage from.
 *
 *      bun run scripts/measure-cohort-onchain-activity.ts 120
 *
 *  Measured 2026-10-16 over 120 random ids: 120/120 resolved an owner; 19% nonce 0, 26% 1-9 tx,
 *  55% 10+, 68% hold a balance.
 *
 *  READ THE CAVEAT BEFORE QUOTING THOSE NUMBERS. `ownerOf` returns the TOKEN HOLDER, not the agent:
 *  one address in that sample has 37,928 transactions and holds three agents, which is a minting
 *  platform rather than an agent doing work. And a nonce counts every transaction, including the one
 *  that minted the agent. So this establishes that the accounts are active, and nothing about whether
 *  what they call is a tool. The operating account is reached through `same as` (ADR 0026), which is
 *  what tasks/22 step 1 must use instead.
 *
 *  `ownerOf(tokenId)` gives the account that holds the agent's ERC-8004 token; its nonce is the
 *  number of transactions it has ever sent. A nonce of 0 means that account has never transacted,
 *  so there is no calldata to derive usage from. Balance is read too: an account with neither a
 *  nonce nor a balance cannot act on-chain at all.
 */
const RPC = 'https://base-rpc.publicnode.com';
const REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const OWNER_OF = '0x6352211e'; // ownerOf(uint256)

async function rpc(method: string, params: unknown[]): Promise<string | null> {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json();
  if (j.error || !j.result || j.result === '0x') return null;
  return j.result as string;
}

async function ownerOf(id: number): Promise<string | null> {
  const data = OWNER_OF + BigInt(id).toString(16).padStart(64, '0');
  const res = await rpc('eth_call', [{ to: REGISTRY, data }, 'latest']);
  if (!res || res.length < 66) return null;
  return '0x' + res.slice(-40);
}

const TOTAL = 88243;
const N = Number(process.argv[2] ?? 120);
const ids = Array.from({ length: N }, () => 1 + Math.floor(Math.random() * TOTAL));

const t = { resolved: 0, noOwner: 0, nonceZero: 0, nonceSome: 0, nonceMany: 0, withBalance: 0 };
let totalNonce = 0;
const owners = new Map<string, number>();
const samples: string[] = [];

await Promise.all(
  ids.map(async (id) => {
    const owner = await ownerOf(id).catch(() => null);
    if (!owner) {
      t.noOwner++;
      return;
    }
    t.resolved++;
    owners.set(owner, (owners.get(owner) ?? 0) + 1);
    const [nonceHex, balHex] = await Promise.all([
      rpc('eth_getTransactionCount', [owner, 'latest']),
      rpc('eth_getBalance', [owner, 'latest']),
    ]);
    const nonce = nonceHex ? parseInt(nonceHex, 16) : 0;
    const bal = balHex ? BigInt(balHex) : 0n;
    totalNonce += nonce;
    if (bal > 0n) t.withBalance++;
    if (nonce === 0) t.nonceZero++;
    else if (nonce < 10) t.nonceSome++;
    else t.nonceMany++;
    if (nonce > 50 && samples.length < 8) samples.push(`#${id} ${owner} nonce=${nonce}`);
  }),
);

const r = t.resolved || 1;
const pc = (n: number) => `${n} (${((100 * n) / r).toFixed(0)}%)`;
console.log(`sampled ${N} ids; ${t.resolved} resolved an owner, ${t.noOwner} did not\n`);
console.log(`owner has NEVER transacted (nonce 0) ${pc(t.nonceZero)}`);
console.log(`owner has 1-9 transactions          ${pc(t.nonceSome)}`);
console.log(`owner has 10+ transactions          ${pc(t.nonceMany)}`);
console.log(`owner holds a non-zero balance      ${pc(t.withBalance)}`);
console.log(`\ntotal transactions across resolved owners: ${totalNonce}`);
console.log(`distinct owners: ${owners.size} for ${t.resolved} agents`);
const top = [...owners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log('most-repeated owners:', top.map(([o, n]) => `${o.slice(0, 10)}…×${n}`).join(' · '));
console.log('\nactive samples:');
samples.forEach((s) => console.log('  ' + s));
