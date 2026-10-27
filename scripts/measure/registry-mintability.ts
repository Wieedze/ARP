/** Can anyone mint into the canonical ERC-8004 registry, and how far ahead of the mirror is it?
 *
 *      bun run scripts/measure/registry-mintability.ts
 *
 *  Two questions that decide whether ARP can mint where the ecosystem reads, rather than into a
 *  registry it deployed itself.
 *
 *  **Is `register()` permissionless?** It has to be, or ADR `0055`'s production path does not exist.
 *  `eth_call` of `register()` from an arbitrary address is the test: it reverts if the function is
 *  gated, and returns the id it would mint if it is not. Measured 2026-10-21: it **simulates
 *  successfully** and returns the next id. The registry has an `owner()` —
 *  `0x547289319c3e6aedb179c0b8e8af0b5acd062603` — but minting is not behind it, and `paused()`
 *  reverts, so there is no pause gate either.
 *
 *  **How far ahead of Intuition's mirror is it?** The mirror is what every Intuition-side read
 *  depends on, and the gap is the reason `/agent/import` writes the identity atom rather than
 *  waiting (ADR `0047`). `docs/12` recorded 309,925 minted against 28,648 mirrored on 2026-10-20;
 *  re-run this rather than quoting those, because the registry moves and the mirror has not since
 *  2026-09-16.
 *
 *  Read-only on both chains: one `eth_call` and one aggregate. Signs nothing, needs no key.
 */
import { createPublicClient, http, parseAbi } from 'viem';

const CANONICAL_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;
const BASE_RPC = 'https://base-rpc.publicnode.com';
const INTUITION_GRAPHQL = 'https://mainnet.intuition.sh/v1/graphql';
/** Nobody's key. `eth_call` needs a `from`, and a mint simulated from here changes no state. */
const NOBODY = '0x1111111111111111111111111111111111111111' as const;

const abi = parseAbi([
  'function register() returns (uint256 agentId)',
  'function owner() view returns (address)',
]);

const client = createPublicClient({ transport: http(BASE_RPC) });

console.log(`ERC-8004 canonical registry on Base 8453 — ${new Date().toISOString().slice(0, 10)}`);
console.log(`  address   ${CANONICAL_REGISTRY}`);
console.log(
  `  owner()   ${await client.readContract({ address: CANONICAL_REGISTRY, abi, functionName: 'owner' })}`,
);

let nextId: bigint | null = null;
try {
  const simulated = await client.simulateContract({
    address: CANONICAL_REGISTRY,
    abi,
    functionName: 'register',
    account: NOBODY,
  });
  nextId = simulated.result;
  console.log(`  register() from an arbitrary address  SIMULATES OK -> next id ${nextId}`);
  console.log('    so minting is permissionless: ARP can mint where the ecosystem reads');
} catch (error) {
  console.log(
    `  register() from an arbitrary address  REVERTS: ${(error as Error).message.split('\n')[0]}`,
  );
  console.log('    so minting is gated and ADR 0055 production path does not exist as written');
}

const res = await fetch(INTUITION_GRAPHQL, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'user-agent': 'arp-measure/1.0' },
  body: JSON.stringify({
    query: `query { triples_aggregate(where: {predicate_id: {_eq: "${'0xbeebfb7d177cbd96ffc239d2196c72ec346efe81f39dc595773f13d83506f5f0'}"}, object: {label: {_like: "eip155:8453/erc721:%"}}}) { aggregate { count } } }`,
  }),
  signal: AbortSignal.timeout(45_000),
});
const json = (await res.json()) as {
  data?: { triples_aggregate: { aggregate: { count: number } } };
};
const mirrored = json.data?.triples_aggregate.aggregate.count ?? null;

console.log('');
console.log(`Intuition mainnet 1155 mirror`);
console.log(`  Base agents reachable through a \`same as\` edge   ${mirrored ?? 'read failed'}`);
if (nextId !== null && mirrored !== null && mirrored > 0) {
  const ratio = Number(nextId) / mirrored;
  console.log(`  so roughly 1 agent in ${ratio.toFixed(0)} has an Intuition identity atom`);
  console.log('    the rest have to have one written — ADR 0047, and why /agent/import writes it');
}
