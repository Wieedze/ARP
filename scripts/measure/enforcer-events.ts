import type { JsonRpcReply } from './shapes.js';
/** Has ARP's own caveat enforcer ever fired on mainnet?
 *
 *  Step 4 of `tasks/22` — the one evidence source in this project that is both tier 4 (proven) and
 *  already deployed. `TrustStakeCapEnforcer` emits `StakeCapChecked` on every pass of its
 *  `beforeHook`, and that hook is unreachable without an actual delegation redemption, so one log
 *  is a fact about a redemption that happened. No self-report, no counterparty.
 *
 *      bun run scripts/measure/enforcer-events.ts
 *
 *  Read-only: `eth_getLogs` over a block range, chunked. Signs nothing.
 *
 *  **The addresses are read from `deployments/<chainId>.json`**, not written here — that file is
 *  the record, and a second copy in a script is the fifth site of a number nobody greps
 *  (`rules/claims.md` §5).
 */
import { readFileSync } from 'node:fs';

const STAKE_CAP_CHECKED = '0x0ccea75bd08495eda9f6cfa676f71860054e889fb1c28333351ad8303fedc1f1';

/**
 * The two deployment files record the same two contracts in **different shapes**: 1155 nests them
 * under `arp.enforcers` with a `status`, 13579 puts them flat on `arp` as bare addresses. Reading
 * only the nested one silently found nothing on testnet, which looked like "no enforcer there"
 * rather than "wrong key". Both are read here; the divergence itself belongs on `tasks/28`.
 */
type Enforcer = { address: string; status?: string };
type Log = { topics: string[]; transactionHash: string; blockNumber: string };

type Deployment = {
  chain: { chainId: number; rpcUrl: string; name: string };
  arp?: Record<string, unknown> & { enforcers?: Record<string, Enforcer> };
};

function enforcersOf(file: Deployment): [string, Enforcer][] {
  const arp = file.arp ?? {};
  if (arp.enforcers !== undefined) return Object.entries(arp.enforcers);
  return Object.entries(arp).flatMap(([key, value]) =>
    key.toLowerCase().endsWith('enforcer') && typeof value === 'string'
      ? [[key, { address: value }] as [string, Enforcer]]
      : [],
  );
}

/** Chunked because a public node caps the range, and it caps it differently per provider. */
const CHUNK = 50_000n;

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const reply = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await reply.json()) as JsonRpcReply & { result?: unknown };
  if (json.error) throw new Error(`${method}: ${json.error.message ?? 'rpc error'}`);
  return json.result;
}

for (const chainId of [1155, 13579]) {
  const file = JSON.parse(readFileSync(`deployments/${chainId}.json`, 'utf8')) as Deployment;
  const url = file.chain.rpcUrl;
  const enforcers = enforcersOf(file);

  const headHex = (await rpc(url, 'eth_blockNumber', [])) as string;
  const head = BigInt(headHex);
  console.log(`\n${file.chain.name} ${chainId} — head block ${head}`);

  for (const [name, record] of enforcers) {
    const logs: Log[] = [];
    let scanned = 0n;
    let from = 0n;
    while (from <= head) {
      const to = from + CHUNK - 1n > head ? head : from + CHUNK - 1n;
      const page = (await rpc(url, 'eth_getLogs', [
        {
          address: record.address,
          topics: [STAKE_CAP_CHECKED],
          fromBlock: `0x${from.toString(16)}`,
          toBlock: `0x${to.toString(16)}`,
        },
      ])) as Log[];
      logs.push(...page);
      scanned += to - from + 1n;
      from = to + 1n;
    }
    console.log(
      `  ${name.padEnd(24)} ${record.address}  status=${(record.status ?? 'recorded').padEnd(8)}` +
        `  StakeCapChecked: ${logs.length} over ${scanned} blocks`,
    );
    if (logs.length === 0) continue;

    // **A log count is not a redemption count, and neither is an adoption count.** One transaction
    // can emit more than one, one delegation can be redeemed many times, and one sender can hold
    // every delegation there is. Measured 2026-10-27 on 13579: 122 logs, 108 transactions, 9
    // delegations, 3 senders — of which 93 transactions are ARP's own rig agent
    // (`0x906f3A52…`, ADR `0047`). Reporting the 122 alone would read as adoption.
    const delegations = new Set(logs.map((l) => l.topics[1]));
    const txs = [...new Set(logs.map((l) => l.transactionHash))];
    const senders = new Map<string, number>();
    for (const hash of txs) {
      const tx = (await rpc(url, 'eth_getTransactionByHash', [hash])) as { from?: string };
      const sender = (tx.from ?? 'unknown').toLowerCase();
      senders.set(sender, (senders.get(sender) ?? 0) + 1);
    }
    console.log(
      `      across ${txs.length} transactions · ${delegations.size} distinct delegations`,
    );
    for (const [sender, n] of [...senders].sort((a, b) => b[1] - a[1])) {
      console.log(`        ${String(n).padStart(4)} tx  ${sender}`);
    }
  }
}

console.log(
  '\nA log here is a redemption that happened — the hook is unreachable without one, so this is the\n' +
    'one tier-4 source already producing data. Read the sender column before calling any of it\n' +
    'adoption: a guard rail ARP crosses itself proves the machinery, not the market.',
);
