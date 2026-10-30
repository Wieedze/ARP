/** ARP's sponsoring service, testnet 13579 only.
 *
 *      SPONSOR_KEY_FILE=~/.arp/sponsor.key \
 *      SPONSOR_DEPOSIT_WEI=… SPONSOR_APPROVAL_GAS_WEI=… \
 *      SPONSOR_USES_PREDICATE=0x… SPONSOR_REGISTRIES=eip155:13579:0x… \
 *      bun run apps/sponsor/src/main.ts
 *
 *  **It holds ARP's treasury key and signs with ARP's own funds, automatically.** That is the row
 *  ADR `0092` added to `security.md`'s signing table — testnet 13579 only, within its limits — and
 *  ADR `0094` §3 extends it from publications to deposits. So this process refuses to start on any
 *  other chain, reads the key from a 0600 file and never from the environment, and never prints it.
 *
 *  **Two values the user has not set have no default** and the service refuses to start without
 *  them: the amount of one sponsored deposit, and the gas sent for the agent's `approve`. The
 *  withdrawal threshold is optional and unset by default (`docs/tasks/40` 40d).
 *
 *  **Publication is off.** Its pinning service is undecided (`docs/tasks/37` §4.3) and its two
 *  predicates have not been read from the graph yet (ADR `0092` item 7), so `POST /publish` answers
 *  503 until both are wired here. The route itself is built and tested (`service.ts`).
 */
import { join } from 'node:path';

import {
  ADR_0092_LIMITS,
  intuitionTestnet,
  multiVaultReads,
  type PreparedCall,
  type SponsorLimits,
} from '@arp-protocol/core';
import { serveFetch } from '@arp-protocol/core/node';
import {
  createPublicClient,
  createWalletClient,
  http,
  isHex,
  parseAbi,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import deployments from '../../../data/deployments/13579.json';
import { assertSponsorChain, readKeyFile } from './key-file.ts';
import { SponsorLedger } from './ledger.ts';
import { addressList, createSponsor, type SponsorWallet } from './service.ts';

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
const LEDGER = process.env.SPONSOR_LEDGER ?? join(process.cwd(), '.arp', 'sponsor-ledger.jsonl');
const RPC = process.env.INTUITION_TESTNET_RPC_URL ?? deployments.chain.rpcUrl;

const threshold = process.env.SPONSOR_WITHDRAWAL_THRESHOLD_BPS;
const limits: SponsorLimits = {
  depositAmount: wei('SPONSOR_DEPOSIT_WEI'),
  approvalGas: wei('SPONSOR_APPROVAL_GAS_WEI'),
  dailyBudget: wei('SPONSOR_DAILY_BUDGET_WEI', ADR_0092_LIMITS.dailyBudget),
  depositsPerAgentPerDay: count(
    'SPONSOR_DEPOSITS_PER_AGENT_PER_DAY',
    ADR_0092_LIMITS.depositsPerAgentPerDay,
  ),
  publicationsPerDelegatorPerDay: count(
    'SPONSOR_PUBLICATIONS_PER_DELEGATOR_PER_DAY',
    ADR_0092_LIMITS.publicationsPerDelegatorPerDay,
  ),
  withdrawalThresholdBps:
    threshold === undefined
      ? null
      : Math.min(10_000, count('SPONSOR_WITHDRAWAL_THRESHOLD_BPS', 10_000)),
};

const usesPredicate = required('SPONSOR_USES_PREDICATE');
if (!isHex(usesPredicate) || usesPredicate.length !== 66)
  fail('SPONSOR_USES_PREDICATE must be a bytes32 term id');
const registries = required('SPONSOR_REGISTRIES')
  .split(',')
  .map((entry) => entry.trim());
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

async function mined(hash: Hex) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, status: receipt.status };
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
        reason: String(error instanceof Error ? error.message : error).slice(0, 300),
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

const ownerOfAbi = parseAbi(['function ownerOf(uint256 tokenId) view returns (address)']);

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
  owners: {
    async ownerOf(registry, agentId) {
      // `ownerOf` reverts for a token that does not exist, which is the "not registered" answer.
      return publicClient
        .readContract({
          address: registry,
          abi: ownerOfAbi,
          functionName: 'ownerOf',
          args: [agentId],
        })
        .catch(() => null);
    },
  },
  registries,
  usesPredicate,
  limits,
  ledger: new SponsorLedger(LEDGER),
  acceptedContentSigners,
  publish: null,
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
  process.stderr.write(`  ledger     ${LEDGER}\n`);
  process.stderr.write(`  publish    disabled (no pinning service, predicates not read)\n`);
}

if (import.meta.main) await main();
