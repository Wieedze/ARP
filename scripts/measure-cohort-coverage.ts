/** What fraction of ERC-8004 agents can ARP actually read — and is the mirror still moving?
 *
 *      bun run scripts/measure-cohort-coverage.ts
 *
 *  Committed because `88,243` sat in **16 files** with no script behind it, which `rules/claims.md`
 *  forbids outright — and because it turned out to be stale in a way that changes a conclusion
 *  rather than a figure. **Five** of those files bound a **uniform sample**
 *  (`measure-cohort-{endpoints,callable,onchain-activity,skills}.ts`, `verify-cohort.ts`), so every
 *  cohort measurement here was drawn from the oldest third of the population. Both counts are from
 *  `git grep -l`, which is the only reason they are written down.
 *
 *  Both figures are **first-party and reproducible**:
 *
 *    - the registry's population, by **binary search on `ownerOf`** — the method ADR `0027` used.
 *      The canonical registry is a proxy exposing no counter: `totalAgents()`, `totalSupply()`,
 *      `nextAgentId()`, `agentCount()`, `getAgentCount()` and `currentTokenId()` all revert
 *      (checked 2026-10-20), and `eth_getLogs` over its history is refused by every free RPC.
 *    - the mirror, from the Intuition mainnet graph. `implement → ERC-8004` is the cohort filter —
 *      the definition of "an agent the mirror knows about" (`terms.ts`).
 *
 *  Both move, the registry fast. Quote the ratio and the date, never a bare count.
 *
 *  Read-only. Signs nothing, needs no key.
 */
const INTUITION_MAINNET = 'https://mainnet.intuition.sh/v1/graphql';
const BASE_RPC = process.env.BASE_RPC_URL ?? 'https://base-rpc.publicnode.com';
const REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;

import { ERC8004, IMPLEMENT, SAME_AS } from '../packages/protocol/src/sources/intuition/terms';
import { createPublicClient, http, toFunctionSelector, type Hex } from 'viem';

const OWNER_OF = toFunctionSelector('function ownerOf(uint256) view returns (address)');
const client = createPublicClient({ transport: http(BASE_RPC) });

/** True when the token is minted. `ownerOf` reverts on a missing id, so a revert is the answer. */
async function exists(tokenId: number): Promise<boolean> {
  const data = (OWNER_OF + tokenId.toString(16).padStart(64, '0')) as Hex;
  try {
    const res = await client.call({ to: REGISTRY, data });
    return res.data !== undefined && res.data !== '0x';
  } catch {
    return false;
  }
}

/**
 * The highest minted token id, by exponential probe then bisection — about 40 calls for a
 * half-million range, which is why this is a script and not something called per request.
 *
 * It assumes ids are **contiguous from 1**, which is how ADR `0027` read this registry. A burn or a
 * gap would make it an upper bound rather than a count, so it is printed as "highest minted id" and
 * the ratio below is the figure to quote.
 */
async function highestTokenId(): Promise<number> {
  if (!(await exists(1))) return 0;
  let low = 1;
  let high = 2;
  while (await exists(high)) {
    low = high;
    high *= 2;
    if (high > 1 << 26) break;
  }
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (await exists(mid)) low = mid;
    else high = mid;
  }
  return low;
}

const QUERY = `query CohortCoverage($implement: String!, $erc8004: String!, $sameAs: String!) {
  mirrored: triples_aggregate(
    where: { predicate_id: { _eq: $implement }, object_id: { _eq: $erc8004 } }
  ) { aggregate { count } }
  sameAs: triples_aggregate(where: { predicate_id: { _eq: $sameAs } }) { aggregate { count } }
}`;

type Agg = { aggregate: { count: number } };

const res = await fetch(INTUITION_MAINNET, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'user-agent': 'arp-measure/1.0' },
  body: JSON.stringify({
    query: QUERY,
    variables: { implement: IMPLEMENT, erc8004: ERC8004, sameAs: SAME_AS },
  }),
});
const graph = (await res.json()) as { data: { mirrored: Agg; sameAs: Agg } };
const mirrored = graph.data.mirrored.aggregate.count;
const sameAs = graph.data.sameAs.aggregate.count;

const population = await highestTokenId();

console.log(`${new Date().toISOString().slice(0, 10)}\n`);
console.log(`Base 8453, registry ${REGISTRY} — binary search on ownerOf:`);
console.log(`  highest minted id      ${population.toLocaleString('en-US')}`);
console.log('\nIntuition mainnet 1155 — the graph:');
console.log(
  `  implement → ERC-8004   ${mirrored.toLocaleString('en-US')}   (the cohort ARP can read)`,
);
console.log(`  same as, all edges     ${sameAs.toLocaleString('en-US')}`);

const pct = ((mirrored / population) * 100).toFixed(1);
console.log(
  `\ncoverage: ARP can read ${mirrored.toLocaleString('en-US')} of ${population.toLocaleString('en-US')} — ${pct}%.`,
);
console.log(
  `\nThe mirror is the on-ramp for the covered share only. For the rest, the identity atom does\n` +
    `not exist and must be written — scripts/agent-identity-atom.ts (ADR 0047).`,
);
