/** How many agents the canonical ERC-8004 registry holds — read, never hardcoded.
 *
 *  Its own module because **five** scripts hardcoded `88_243` to bound a uniform sample — counted
 *  with `git grep -l`, not from memory — and the registry has since passed 309,000: every cohort
 *  measurement in this repo was drawn from the oldest third of the population, which is a sampling
 *  bias and not a stale figure. Agents minted before the ~44,000-a-day rate are not a random sample
 *  of today's cohort.
 *
 *  The registry is a proxy with **no counter**: `totalAgents()`, `totalSupply()`, `nextAgentId()`,
 *  `agentCount()`, `getAgentCount()` and `currentTokenId()` all revert (checked 2026-10-20), and
 *  `eth_getLogs` over its history is refused by every free RPC. So the population is found the way
 *  ADR `0027` found it: binary search on `ownerOf`.
 *
 *  Read-only. ~40 `eth_call`s, which is nothing beside the hundreds any caller already makes.
 */
import { createPublicClient, http, toFunctionSelector, type Address, type Hex } from 'viem';

export const CANONICAL_REGISTRY: Address = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

const OWNER_OF = toFunctionSelector('function ownerOf(uint256) view returns (address)');

/**
 * The highest minted token id.
 *
 * Ids are assumed **contiguous from 1**, which is how ADR `0027` read this registry. A burn or a gap
 * makes this an upper bound rather than a count — so it is named for what it measures, and a caller
 * quoting a population figure should say "highest minted id" and give the date.
 */
export async function highestTokenId(options?: {
  rpcUrl?: string;
  registry?: Address;
}): Promise<number> {
  const registry = options?.registry ?? CANONICAL_REGISTRY;
  const client = createPublicClient({
    transport: http(
      options?.rpcUrl ?? process.env.BASE_RPC_URL ?? 'https://base-rpc.publicnode.com',
    ),
  });

  const exists = async (tokenId: number): Promise<boolean> => {
    const data = (OWNER_OF + tokenId.toString(16).padStart(64, '0')) as Hex;
    try {
      const res = await client.call({ to: registry, data });
      return res.data !== undefined && res.data !== '0x';
    } catch {
      return false;
    }
  };

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
