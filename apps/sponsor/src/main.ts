/** ARP's sponsoring service, testnet 13579 only.
 *
 *      SPONSOR_KEY_FILE=~/.arp/sponsor.key \
 *      SPONSOR_DEPOSIT_WEI=… SPONSOR_APPROVAL_GAS_WEI=… \
 *      SPONSOR_REGISTRIES=eip155:13579:0x… \
 *      bun run apps/sponsor/src/main.ts
 *
 *  Optional, for a Desktop agent that starts with nothing (ADR `0110`): `SPONSOR_MINT_GAS_WEI` and
 *  `SPONSOR_NEW_AGENTS_PER_DAY` (default 20) turn on `POST /mint-gas`; `INTUITION_PIN_API_KEY`
 *  turns on `POST /identity`; `SPONSOR_CONTENT_SIGNERS` lists the content servers whose receipts
 *  unlock a deposit (ADR `0109`).
 *
 *  **It holds ARP's treasury key and signs with ARP's own funds, automatically.** That is the row
 *  ADR `0092` added to `security.md`'s signing table — testnet 13579 only, within its limits — and
 *  ADR `0094` §3 extends it from publications to deposits. So this process refuses to start on any
 *  other chain, reads the key from a 0600 file and never from the environment, and never prints it.
 *
 *  **Two values the user has not set have no default** and the service refuses to start without
 *  them: the amount of one sponsored deposit, and the gas sent for the agent's `approve`.
 *
 *  **On testnet everything proven is sponsored** (ADR `0094`, amended 2026-10-30). The withdrawal
 *  threshold and the cost-of-proof rule are mainnet rules: the threshold is unset unless
 *  `SPONSOR_WITHDRAWAL_THRESHOLD_BPS` is given, which a testnet run leaves unset, and the cost rule
 *  is off with no setting to turn it on here. ADR `0092`'s count and budget stay.
 *
 *  **Publication is off.** Its pinning service is undecided (`docs/tasks/37` §4.3) and its two
 *  predicates have not been read from the graph yet (ADR `0092` item 7), so `POST /publish` answers
 *  503 until both are wired here. The route itself is built and tested (`service.ts`).
 */
import {
  ADR_0092_LIMITS,
  INTUITION_USES_TERM_ID,
  intuitionTestnet,
  multiVaultReads,
  resolveIdentityAtomStrict,
  type PreparedCall,
  type SponsorLimits,
} from '@arp-protocol/core';
import {
  ERC8004_REGISTRY_REF,
  loopbackHosts,
  redactUrls,
  serveFetch,
  stateFile,
} from '@arp-protocol/core/node';
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbi,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import deployments from '../../../data/deployments/13579.json';
import { assertSponsorChain, readKeyFile } from './key-file.ts';
import { nullOnRevert } from './routes/context.ts';
import { SponsorLedger } from './ledger.ts';
import { resolveOnGitHubCached } from './github.ts';
import { repoSpellingsOnGraph } from './indexer.ts';
import { intuitionPinner } from './pin.ts';
import {
  addressList,
  createSponsor,
  registryList,
  type SendOutcome,
  type SponsorWallet,
} from './service.ts';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') fail(`${name} is required`);
  return value.trim();
}

function wei(name: string, fallback?: bigint): bigint {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    if (fallback === undefined) fail(`${name} is required (wei, decimal)`);
    return fallback;
  }
  if (!/^[1-9][0-9]*$/.test(raw.trim())) fail(`${name} must be a positive decimal wei amount`);
  return BigInt(raw.trim());
}

function count(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) fail(`${name} must be a positive integer`);
  return value;
}

const PORT = count('SPONSOR_PORT', 3200);
// Optional: unset, `POST /identity` answers 503. Never printed.
const PIN_KEY = (process.env.INTUITION_PIN_API_KEY ?? '').trim();
// `~/.arp/` (or `ARP_HOME`), never the working directory: started anywhere else, a ledger resolved
// against it is empty, and an empty ledger sponsors every proof a second time (ADR `0116`).
// Opened here, before the key is read: a second service on the same ledger is refused (ADR `0116`).
let LEDGER: string;
let ledger: SponsorLedger;
try {
  LEDGER = stateFile(process.env.SPONSOR_LEDGER, 'sponsor-ledger.jsonl');
  ledger = new SponsorLedger(LEDGER);
} catch (error) {
  fail(String(error instanceof Error ? error.message : error));
}
const RPC = process.env.INTUITION_TESTNET_RPC_URL ?? deployments.chain.rpcUrl;

/** Vite's dev and preview servers, where the web app runs locally (the activity feed's list, ADR `0091`). */
const DEFAULT_LIST_TOOL_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

function originList(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === '') return [];
  return raw.split(',').map((entry) => {
    const value = entry.trim();
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      fail(`SPONSOR_ALLOWED_ORIGINS: ${value} is not an origin`);
    }
    if (parsed.origin !== value) fail(`SPONSOR_ALLOWED_ORIGINS: ${value} is not an origin`);
    return value;
  });
}

const threshold = process.env.SPONSOR_WITHDRAWAL_THRESHOLD_BPS;
const limits: SponsorLimits = {
  depositAmount: wei('SPONSOR_DEPOSIT_WEI'),
  approvalGas: wei('SPONSOR_APPROVAL_GAS_WEI'),
  // Optional: unset, `POST /mint-gas` answers 503 (ADR `0110`).
  mintGas:
    (process.env.SPONSOR_MINT_GAS_WEI ?? '').trim() === '' ? null : wei('SPONSOR_MINT_GAS_WEI'),
  newAgentsPerDay: count('SPONSOR_NEW_AGENTS_PER_DAY', 20),
  // ADR `0120`: a signing address's own limit, and the shared cap for unsigned listings.
  listingsPerAddressPerDay: count('SPONSOR_LISTINGS_PER_ADDRESS_PER_DAY', 5),
  anonymousListingsPerDay: count('SPONSOR_ANONYMOUS_LISTINGS_PER_DAY', 20),
  listingsPerDay: count('SPONSOR_LISTINGS_PER_DAY', 50),
  dailyBudget: wei('SPONSOR_DAILY_BUDGET_WEI', ADR_0092_LIMITS.dailyBudget),
  depositsPerAgentPerDay: count(
    'SPONSOR_DEPOSITS_PER_AGENT_PER_DAY',
    ADR_0092_LIMITS.depositsPerAgentPerDay,
  ),
  publicationsPerDelegatorPerDay: count(
    'SPONSOR_PUBLICATIONS_PER_DELEGATOR_PER_DAY',
    ADR_0092_LIMITS.publicationsPerDelegatorPerDay,
  ),
  // A mainnet rule (ADR `0094` as amended): leave it unset on testnet.
  withdrawalThresholdBps:
    threshold === undefined
      ? null
      : Math.min(10_000, count('SPONSOR_WITHDRAWAL_THRESHOLD_BPS', 10_000)),
  // A mainnet rule (ADR `0094` §2 as amended): on testnet a hire is sponsored whatever it paid.
  belowProofCost: false,
};

// The predicate the declare path writes (`declare/plan.ts`) and every reader filters on. Not
// configurable: a sponsored deposit on any other `uses` atom would be invisible to all of them.
const usesPredicate: Hex = INTUITION_USES_TERM_ID;
let registries: string[];
try {
  registries = registryList(required('SPONSOR_REGISTRIES'), intuitionTestnet.id);
} catch (error) {
  fail(`SPONSOR_REGISTRIES: ${error instanceof Error ? error.message : String(error)}`);
}
let acceptedContentSigners: Address[];
try {
  acceptedContentSigners = addressList(process.env.SPONSOR_CONTENT_SIGNERS);
} catch (error) {
  fail(`SPONSOR_CONTENT_SIGNERS: ${String(error)}`);
}

const publicClient = createPublicClient({ chain: intuitionTestnet, transport: http(RPC) });
try {
  assertSponsorChain(await publicClient.getChainId());
} catch (error) {
  fail(String(error instanceof Error ? error.message : error));
}

// Read here, after every other check, so a misconfigured start never loads the key at all.
const account = privateKeyToAccount(readKeyFile(required('SPONSOR_KEY_FILE')));
const walletClient = createWalletClient({ account, chain: intuitionTestnet, transport: http(RPC) });

/**
 * Waits for a sent transaction, bounded. Every send runs inside the service's one queue, so an
 * unbounded wait on a transaction that never lands stopped every route (ADR `0116`). Past the
 * bound, or when the RPC fails while it waits, the outcome is `unconfirmed`: the hash is kept, the
 * spend stays pending in the ledger, and the queue moves on.
 */
const RECEIPT_TIMEOUT_MS = 120_000;
async function mined(hash: Hex): Promise<SendOutcome> {
  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: RECEIPT_TIMEOUT_MS,
    });
    return { hash, status: receipt.status };
  } catch {
    return { hash, status: 'unconfirmed' };
  }
}

const wallet: SponsorWallet = {
  address: account.address,
  async simulate(call: PreparedCall) {
    try {
      await publicClient.call({
        account: account.address,
        to: call.to,
        data: call.data,
        value: call.value,
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        // Redacted: the RPC URL in a viem message can carry its key, and this reason is answered.
        reason: redactUrls(String(error instanceof Error ? error.message : error)).slice(0, 300),
      };
    }
  },
  async send(call: PreparedCall) {
    return mined(
      await walletClient.sendTransaction({ to: call.to, data: call.data, value: call.value }),
    );
  },
  async sendGas(to: Address, value: bigint) {
    return mined(await walletClient.sendTransaction({ to, value }));
  },
};

const registryAbi = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getAgentWallet(uint256 agentId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
]);
const ZERO: Address = '0x0000000000000000000000000000000000000000';

const service = createSponsor({
  chainId: intuitionTestnet.id,
  wallet,
  reads: multiVaultReads({
    // The deployment record's string, which is checksummed there.
    address: deployments.intuition.multiVault as Address,
    chainId: intuitionTestnet.id,
    client: publicClient,
  }),
  payments: publicClient,
  holdings: {
    async agentsHeldBy(address) {
      const held = await Promise.all(
        registries.map((ref) =>
          publicClient.readContract({
            address: getAddress(ERC8004_REGISTRY_REF.exec(ref)?.[2] ?? ''),
            abi: registryAbi,
            functionName: 'balanceOf',
            args: [address],
          }),
        ),
      );
      return held.reduce((sum, n) => sum + n, 0n);
    },
  },
  owners: {
    async ownerOf(registry, agentId) {
      // `ownerOf` reverts for a token that does not exist, which is the "not registered" answer.
      // Anything else is the chain unreachable, and is thrown: `null` means "does not exist".
      return publicClient
        .readContract({
          address: registry,
          abi: registryAbi,
          functionName: 'ownerOf',
          args: [agentId],
        })
        .catch(nullOnRevert);
    },
    async agentWalletOf(registry, agentId) {
      // Unset reads as the zero address; a registry without the getter reverts. Both mean none.
      // An unreachable chain is neither, and is thrown.
      const wallet = await publicClient
        .readContract({
          address: registry,
          abi: registryAbi,
          functionName: 'getAgentWallet',
          args: [agentId],
        })
        .catch(nullOnRevert);
      return wallet === null || wallet === ZERO ? null : wallet;
    },
  },
  identities: {
    async identityAtom({ agentRegistry, agentId }) {
      const match = ERC8004_REGISTRY_REF.exec(agentRegistry);
      if (match === null) return { status: 'none' };
      // A graph failure throws, and is a 500: only an answer about the agent is a refusal.
      return resolveIdentityAtomStrict({
        agent: {
          chainId: Number(match[1]),
          tokenId: agentId,
          // Lower case, so a receipt's mis-checksummed registry is not a `resolveRef` TypeError.
          registry: (match[2] ?? '').toLowerCase() as Address, // 40 hex digits, matched above.
        },
        graphqlUrl: deployments.chain.graphqlUrl,
      });
    },
  },
  registries,
  hosts: loopbackHosts(PORT),
  // The web app's own origins, for `/list-tool` only (ADR `0120`), plus any the operator lists.
  listToolOrigins: [
    ...DEFAULT_LIST_TOOL_ORIGINS,
    ...originList(process.env.SPONSOR_ALLOWED_ORIGINS),
  ],
  resolveTool: (url) => resolveOnGitHubCached(url),
  repoSpellings: (repo) => repoSpellingsOnGraph(deployments.chain.graphqlUrl, repo),
  usesPredicate,
  limits,
  ledger,
  acceptedContentSigners,
  publish: null,
  pinThing:
    PIN_KEY === ''
      ? null
      : intuitionPinner({
          apiKey: PIN_KEY,
          headerName: process.env.INTUITION_PIN_API_KEY_HEADER ?? 'apikey',
        }),
});

/** Start the service. Bound to localhost: it runs locally first (`docs/tasks/37` §4.2). */
export async function main(): Promise<void> {
  await serveFetch({ port: PORT, hostname: '127.0.0.1', maxBodyBytes: 64 * 1024 }, (request) =>
    service.fetch(request),
  );
  process.stderr.write(`sponsoring service on http://127.0.0.1:${PORT}\n`);
  process.stderr.write(`  sponsor    ${account.address}\n`);
  process.stderr.write(`  chain      ${intuitionTestnet.id}\n`);
  process.stderr.write(
    `  deposit    ${limits.depositAmount} wei, ${limits.depositsPerAgentPerDay}/agent/day\n`,
  );
  process.stderr.write(`  budget     ${limits.dailyBudget} wei/day\n`);
  process.stderr.write(`  withdrawal ${limits.withdrawalThresholdBps ?? 'unset'}\n`);
  process.stderr.write(
    `  mint gas   ${limits.mintGas === null ? 'off' : `${limits.mintGas} wei`}, ${limits.newAgentsPerDay} new agents/day\n`,
  );
  process.stderr.write(
    `  identity   ${PIN_KEY === '' ? 'off (no INTUITION_PIN_API_KEY)' : 'on'}\n`,
  );
  process.stderr.write(
    `  content    ${acceptedContentSigners.length === 0 ? 'no signer accepted' : acceptedContentSigners.join(', ')}\n`,
  );
  process.stderr.write(
    `  listing    ${PIN_KEY === '' ? 'off (no INTUITION_PIN_API_KEY)' : `${limits.listingsPerAddressPerDay}/address/day, ${limits.anonymousListingsPerDay} unsigned/day, ${limits.listingsPerDay}/day in all`}\n`,
  );
  process.stderr.write(`  ledger     ${LEDGER}\n`);
  process.stderr.write(`  publish    disabled (no pinning service, predicates not read)\n`);
}

if (import.meta.main) await main();
