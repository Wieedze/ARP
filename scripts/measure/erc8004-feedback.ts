/** How much ERC-8004 feedback exists, per chain — and what it is worth.
 *
 *  Asked because "price the existing free opinion" is only a surface if the opinion exists. The
 *  answer turned out to matter for a different reason: the free layer is **flooded**, which is the
 *  argument for pricing rather than aggregating (ADR `0046`).
 *
 *      bun run scripts/measure/erc8004-feedback.ts
 *
 *  Source: 8004scan.io's public API — a **third party**, cited as such per `rules/claims.md` check 3.
 *  It is the same source `docs/07:18` quotes, so the guide's figures and these are comparable in kind.
 *  ARP does not operate this index and cannot verify it; the ERC-8004 ReputationRegistry itself is at
 *  `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` on every supported chain (CREATE2), and a direct
 *  `eth_getLogs` count was attempted first and refused by every free RPC — 10,000-block ranges
 *  against millions of blocks. That is why this reads an index instead of the chain.
 *
 *  **Never sum the per-chain rows** (`rules/claims.md` check 2). The totals line is the API's own
 *  global figure, printed beside the rows so the two are not confused.
 *
 *  Read-only. Signs nothing, needs no key.
 */
const API = 'https://api.8004scan.io/api/v1';

type Global = {
  total_agents: number;
  total_users: number;
  total_feedbacks: number;
  daily_new_agents: number;
  daily_feedbacks: number;
  average_feedback_score: number | null;
};

type Growth = {
  period: string;
  chains: {
    chain_id: number;
    name: string;
    is_testnet: boolean;
    data: { date: string; agents: number; feedbacks: number }[];
  }[];
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { accept: 'application/json', 'user-agent': 'arp-measure/1.0' },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

const g = await get<Global>('/stats/global');
const growth = await get<Growth>('/stats/growth/chains');

console.log(`8004scan.io — read ${new Date().toISOString().slice(0, 10)}`);
console.log("\n=== the index's own global figures (every chain it covers, summed by them) ===");
console.log(`  agents            ${g.total_agents.toLocaleString('en-US')}`);
console.log(`  feedbacks         ${g.total_feedbacks.toLocaleString('en-US')}`);
console.log(`  distinct users    ${g.total_users.toLocaleString('en-US')}`);
console.log(`  new agents/day    ${g.daily_new_agents.toLocaleString('en-US')}`);
console.log(`  feedbacks/day     ${g.daily_feedbacks.toLocaleString('en-US')}`);
console.log(`  mean score        ${g.average_feedback_score ?? 'n/a'}`);

console.log(`\n=== per chain, latest point of the ${growth.period} series — DO NOT SUM ===`);
const rows = growth.chains
  .map((c) => {
    const last = c.data.at(-1);
    return {
      chain: `${c.name} (${c.chain_id})${c.is_testnet ? ' [testnet]' : ''}`,
      agents: last?.agents ?? 0,
      feedbacks: last?.feedbacks ?? 0,
      date: last?.date ?? '—',
    };
  })
  .sort((a, b) => b.feedbacks - a.feedbacks);

for (const r of rows) {
  const per = r.agents > 0 ? (r.feedbacks / r.agents).toFixed(2) : '—';
  console.log(
    `  ${r.chain.padEnd(34)} ${String(r.feedbacks).padStart(9)} feedbacks  ${String(r.agents).padStart(8)} agents  ${per.padStart(6)}/agent  @${r.date}`,
  );
}

const base = rows.find((r) => r.chain.includes('(8453)'));
console.log(
  base
    ? `\nBase 8453 is ARP's cohort chain: ${base.feedbacks.toLocaleString('en-US')} feedbacks over ${base.agents.toLocaleString('en-US')} agents.`
    : '\nBase 8453 is absent from this index.',
);

// A module, not a global script. Without this TypeScript treats every top-level
// `const` here as sharing one scope with every other import-free file in `scripts/`,
// which produced 21 phantom redeclarations and 20 "await outside a module" errors the
// first time this directory was typechecked (`tasks/21`). Bun already runs it as a module.
export {};
