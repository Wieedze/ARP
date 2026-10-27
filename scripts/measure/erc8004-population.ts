import { createPublicClient, http, toFunctionSelector, type Hex } from 'viem';

/**
 * How many ERC-8004 identities exist, read rather than hardcoded.
 *
 * ## Why this file had to be written rather than found
 *
 * Five measurement scripts imported `./erc8004-population.js`. **The file was never committed** —
 * no git history, no deleted blob — so all five threw on import and had been dead for as long as
 * they existed. Nothing caught it, because `scripts/` was outside every gate (`tasks/21`); the
 * first run of `tsconfig.scripts.json` surfaced it as four `TS2307`s.
 *
 * The implementation below is lifted from `cohort-coverage.ts`, which kept a private copy and so
 * kept working. One copy now, imported by all six.
 *
 * ## What the number is, and what it is not
 *
 * It assumes ids are **contiguous from 1**, which is how ADR `0027` reads this registry. A burn or
 * a gap makes it an upper bound rather than a count — so it is "the highest minted id", and that
 * is the phrasing any report quoting it has to keep (`rules/claims.md`).
 *
 * Exponential probe then bisection: about 40 calls for a half-million range, which is why this is a
 * script and not something called per request.
 */

/** The canonical ERC-8004 `IdentityRegistry`, same address on every EVM chain. */
export const ERC8004_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;

/** Base, where Intuition's mirror reads from. The default, and overridable per call. */
export const BASE_RPC = 'https://base-rpc.publicnode.com';

const OWNER_OF = toFunctionSelector('function ownerOf(uint256) view returns (address)');

/** `ownerOf` reverts on a missing id, so a revert is the answer rather than a failure. */
async function exists(
  client: ReturnType<typeof createPublicClient>,
  tokenId: number,
): Promise<boolean> {
  const data = (OWNER_OF + tokenId.toString(16).padStart(64, '0')) as Hex;
  try {
    const result = await client.call({ to: ERC8004_REGISTRY, data });
    return result.data !== undefined && result.data !== '0x';
  } catch {
    return false;
  }
}

export async function highestTokenId(rpcUrl: string = BASE_RPC): Promise<number> {
  const client = createPublicClient({ transport: http(rpcUrl) });
  if (!(await exists(client, 1))) return 0;

  let low = 1;
  let high = 2;
  while (await exists(client, high)) {
    low = high;
    high *= 2;
    // A registry that has minted more than 67 million ids is a different measurement problem;
    // stop rather than probe forever.
    if (high > 1 << 26) break;
  }
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (await exists(client, mid)) low = mid;
    else high = mid;
  }
  return low;
}
