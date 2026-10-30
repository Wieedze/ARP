/**
 * Is the canonical ERC-8004 `IdentityRegistry` really where this repo says it is, and can an
 * ordinary wallet mint in it?
 *
 * The question gates a real-money write. `/agent` mints into **ARP's own copy** on testnet 13579,
 * which is a rehearsal prop (`rules/portability.md` rule 4: "never rely on controlling the
 * registry"). Pointing it at the real registry means a transaction on Base with the operator's own
 * ETH, so the address, the code and the permissionlessness are measured before anything is built.
 *
 *   bun run scripts/measure/canonical-registry.ts
 */
import { createPublicClient, encodeFunctionData, http, parseAbi, type Hex } from 'viem';

import { DEFAULT_IDENTITY_REGISTRY } from '../../packages/protocol/src/caip';

const CHAINS = [
  { id: 8453, label: 'Base 8453', rpc: 'https://mainnet.base.org' },
  { id: 56, label: 'BSC 56', rpc: 'https://bsc-dataseed.binance.org' },
  { id: 1, label: 'Ethereum 1', rpc: 'https://eth.llamarpc.com' },
] as const;

const abi = parseAbi([
  'function register() returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function ownerOf(uint256 tokenId) view returns (address)',
]);

/** A throwaway address with no balance — enough to learn whether the call is permissioned. */
const PROBE = '0x000000000000000000000000000000000000dEaD' as const;

for (const chain of CHAINS) {
  const client = createPublicClient({ transport: http(chain.rpc) });
  console.log(`\n--- ${chain.label}  ${DEFAULT_IDENTITY_REGISTRY}`);

  try {
    const code = await client.getCode({ address: DEFAULT_IDENTITY_REGISTRY });
    if (code === undefined || code === '0x') {
      console.log('    NO CODE at this address');
      continue;
    }
    console.log(`    code: ${code.length / 2 - 1} bytes`);
  } catch (error) {
    console.log(`    getCode failed: ${(error as Error).message.split('\n')[0]}`);
    continue;
  }

  for (const fn of ['name', 'symbol', 'totalSupply'] as const) {
    try {
      const value = await client.readContract({
        address: DEFAULT_IDENTITY_REGISTRY,
        abi,
        functionName: fn,
      });
      console.log(`    ${fn}(): ${String(value)}`);
    } catch (error) {
      console.log(`    ${fn}(): reverts — ${(error as Error).message.split('\n')[0]}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  // `eth_call` the mint from an address holding nothing. A revert that is NOT about funds or
  // permissions means the function exists and is open; a permission revert would name it.
  try {
    const data = encodeFunctionData({ abi, functionName: 'register' });
    const result = await client.call({ account: PROBE, to: DEFAULT_IDENTITY_REGISTRY, data });
    console.log(`    register() simulates OK, returns ${result.data as Hex}`);
  } catch (error) {
    console.log(`    register() simulate: ${(error as Error).message.split('\n')[0]}`);
  }
  await new Promise((r) => setTimeout(r, 400));
}

/**
 * Appended 2026-10-27, after the user asked whether signing straight into the registry is the
 * intended use. It is — but `register()` with no argument mints an identity with **no URI**, and
 * this part measures what that costs you: it is the same state the app already flags as the
 * indexer's stand-in (`FALLBACK_NAME_PATTERN`, "half the mainnet cohort looks like this").
 */
{
  const client = createPublicClient({ transport: http('https://mainnet.base.org') });
  const wide = parseAbi([
    'function register(string agentURI) returns (uint256)',
    'function setAgentURI(uint256 agentId, string agentURI)',
    'function tokenURI(uint256 tokenId) view returns (string)',
    'function ownerOf(uint256 tokenId) view returns (address)',
  ]);

  console.log('\n--- Base 8453: does the URI-bearing form exist, and what do real agents carry?');

  for (const fn of ['register', 'setAgentURI'] as const) {
    try {
      const data =
        fn === 'register'
          ? encodeFunctionData({ abi: wide, functionName: fn, args: ['ipfs://probe'] })
          : encodeFunctionData({ abi: wide, functionName: fn, args: [1n, 'ipfs://probe'] });
      const result = await client.call({ account: PROBE, to: DEFAULT_IDENTITY_REGISTRY, data });
      console.log(`    ${fn}(…) simulates OK -> ${result.data ?? 'no return'}`);
    } catch (error) {
      console.log(`    ${fn}(…): ${(error as Error).message.split('\n')[0]}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  for (const id of [1n, 2340n, 6649n, 500000n, 1100000n]) {
    try {
      const owner = await client.readContract({
        address: DEFAULT_IDENTITY_REGISTRY,
        abi: wide,
        functionName: 'ownerOf',
        args: [id],
      });
      await new Promise((r) => setTimeout(r, 400));
      const uri = await client.readContract({
        address: DEFAULT_IDENTITY_REGISTRY,
        abi: wide,
        functionName: 'tokenURI',
        args: [id],
      });
      console.log(`    #${id}  ${owner}  ${uri === '' ? '(no uri)' : uri}`);
    } catch (error) {
      console.log(`    #${id}: ${(error as Error).message.split('\n')[0]}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}
