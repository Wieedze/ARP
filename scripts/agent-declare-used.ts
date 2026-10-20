/** Declare what an agent used, and plan the stake — the whole loop, from outside this repo.
 *
 *      bun run scripts/agent-declare-used.ts --agent 8453/1380 --tool ipfs://bafkrei… [--tool …]
 *      bun run scripts/agent-declare-used.ts --agent 8453/1380 --tool … --stake 0.01 --receiver 0x…
 *      ARP_TARGET=testnet bun run scripts/agent-declare-used.ts --agent 13579/3 --tool …
 *
 *  What a third party needs: a funded wallet and an ERC-8004 identity. **No API key.** A tool's
 *  atom derives from its URI (ADR `0008`) and the agent's identity atom already exists for the
 *  mirrored cohort, so nothing is pinned.
 *
 *  **This script signs nothing and sends nothing, in any mode.** It prints the calls for the
 *  agent's own runtime to sign (ADR `0038`). With `--simulate` it `eth_call`s each one from the
 *  agent's address so a revert surfaces before any TRUST is spent — which is how staking code is
 *  verified here, per `rules/security.md`.
 *
 *  The two signing modes, and where each one's TRUST comes from:
 *
 *    direct     the agent's wallet signs the calls as printed; its own TRUST is spent
 *    delegated  pass the calls through `toDelegatedCalls` with the operator's signed delegation;
 *               the delegator's TRUST is spent, bounded by the caveats the operator signed
 *
 *  Direct is the on-ramp and delegated is the guard rail. The guard rail is not the price of entry.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { createPublicClient, formatEther, http, parseEther } from 'viem';
import type { Address, Hex } from 'viem';

import {
  AmbiguousToolAtomError,
  BelowMinDepositError,
  intuitionToolAtomLookup,
  multiVaultReads,
  prepareDeclareUsed,
  prepareStakeOnUsed,
  resolveDeclarationSubject,
  type PreparedCall,
} from '../packages/protocol/src/declare/index.js';

const TARGETS = { mainnet: 1155, testnet: 13579 } as const;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}
function args(name: string): string[] {
  const found: string[] = [];
  process.argv.forEach((value, index) => {
    if (value === `--${name}`) {
      const next = process.argv[index + 1];
      if (next !== undefined) found.push(next);
    }
  });
  return found;
}

const targetName = (process.env.ARP_TARGET ?? 'mainnet') as keyof typeof TARGETS;
const chainId = TARGETS[targetName];
if (chainId === undefined) {
  console.error(`ARP_TARGET must be one of ${Object.keys(TARGETS).join(', ')}`);
  process.exit(1);
}

const agentRef = arg('agent');
const tools = args('tool');
if (!agentRef || !/^\d+\/\d+$/.test(agentRef) || tools.length === 0) {
  console.error(
    'usage: --agent <chainId>/<tokenId> --tool <uri> [--tool <uri>] ' +
      '[--registry <0x…>] [--stake <TRUST> --receiver <0x…>] [--simulate] [--json <file>]',
  );
  process.exit(1);
}
const [agentChainId, agentTokenId] = agentRef.split('/') as [string, string];

const record = JSON.parse(
  readFileSync(new URL(`../deployments/${chainId}.json`, import.meta.url), 'utf8'),
) as {
  chain?: { rpcUrl?: string; graphqlUrl?: string; name?: string };
  intuition?: { multiVault?: string };
};

const rpcUrl = process.env.INTUITION_RPC_URL ?? record.chain?.rpcUrl;
const graphqlUrl = process.env.INTUITION_GRAPHQL_URL ?? record.chain?.graphqlUrl;
const multiVault = (process.env.ARP_MULTI_VAULT ?? record.intuition?.multiVault) as
  | Address
  | undefined;
if (!rpcUrl || !graphqlUrl || !multiVault) {
  console.error(`deployments/${chainId}.json is missing a rpcUrl, graphqlUrl or multiVault`);
  process.exit(1);
}

const reads = multiVaultReads({ address: multiVault, chainId, rpcUrl });

console.log(`chain      ${chainId} (${record.chain?.name ?? 'unknown'})`);
console.log(`multivault ${multiVault}`);
console.log(`agent      eip155:${agentChainId} token ${agentTokenId}\n`);

/**
 * The expected refusals, printed as advice rather than as a stack trace.
 *
 * All three are the connector declining to guess at something whose cost is a permanent write:
 * no identity atom, several atoms claiming one URL, an amount under the protocol floor. A third
 * party following this script should read what to do next, not a `plan.ts` line number.
 */
function die(error: unknown): never {
  if (
    error instanceof AmbiguousToolAtomError ||
    error instanceof BelowMinDepositError ||
    (error instanceof Error && error.name === 'NoAgentIdentityError')
  ) {
    console.error(`\n${error.name}\n\n  ${error.message}\n`);
    process.exit(2);
  }
  throw error;
}

/**
 * The registry the agent's identity lives in.
 *
 * Defaults to the canonical one (`caip.ts`'s `DEFAULT_IDENTITY_REGISTRY`), which is right on Base
 * 8453, BSC 56 and Ethereum 1. It is **wrong on Intuition testnet 13579**, where that address has
 * no code at all (`eth_getCode` → `0x`, checked 2026-10-20) and ARP's own agents live in the
 * registry ARP deployed, `deployments/13579.json` → `arp.identityRegistry`. Passing it explicitly
 * is how a chain whose agents are not in the canonical registry is addressed, and
 * `rules/portability.md` rule 4 is the reason this is a flag and not a second constant.
 */
const registry = arg('registry') as Address | undefined;

const subject = await resolveDeclarationSubject({
  agent: { chainId: Number(agentChainId), tokenId: agentTokenId, registry },
  graphqlUrl,
}).catch(die);
console.log(`subject atom  ${subject}   (resolved through \`same as\`, ADR 0032)\n`);

const plan = await prepareDeclareUsed({
  subject,
  tools,
  reads,
  // So an `https://` tool reuses the atom it already has rather than minting a metadata-less one
  // beside it. A graph read; no credential.
  lookup: intuitionToolAtomLookup({ graphqlUrl }),
}).catch(die);

for (const tool of plan.tools) {
  console.log(`  ${tool.uri}`);
  console.log(
    `     atom   ${tool.atomId}  ${tool.atomExists ? 'exists' : 'TO CREATE'}  (${tool.atomSource})\n` +
      `     edge   ${tool.tripleId}  ${tool.tripleExists ? 'exists' : 'TO CREATE'}`,
  );
  if (tool.bareUrlWarning !== undefined) console.log(`     WARN   ${tool.bareUrlWarning}`);
}

const show = (label: string, calls: PreparedCall[], total: bigint) => {
  console.log(`\n${label}: ${calls.length} call(s), ${formatEther(total)} TRUST`);
  for (const call of calls) {
    console.log(
      `  ${call.kind.padEnd(14)} ${formatEther(call.value).padStart(14)} TRUST  ${call.why}`,
    );
  }
};

show('declare', plan.calls, plan.totalValue);

const stakeAmount = arg('stake');
const receiver = arg('receiver') as Address | undefined;
/** The stake calls, if any were planned — hoisted so `--simulate` can cover them too. */
let stakeCalls: PreparedCall[] = [];
if (stakeAmount !== undefined) {
  if (receiver === undefined) {
    console.error('\n--stake needs --receiver: who holds the position is not guessable.');
    process.exit(1);
  }
  // Only the edges that already exist can be staked on. A caller who just planned their creation
  // has to send those first — which is why declaring and staking are separate calls.
  const onChain = plan.tools.filter((tool) => tool.tripleExists);
  if (onChain.length === 0) {
    console.log(
      `\nstake: nothing to stake on yet — none of these edges is on chain. Send the declare ` +
        `calls first, then re-run with --stake.`,
    );
  } else {
    const stakePlan = await prepareStakeOnUsed({
      targets: onChain.map((tool) => ({
        tripleId: tool.tripleId,
        amount: parseEther(stakeAmount),
      })),
      receiver,
      reads,
    });
    stakeCalls = stakePlan.calls;
    show('stake', stakePlan.calls, stakePlan.totalValue);
    console.log(
      `  curve ${stakePlan.curveId}, min deposit ${formatEther(stakePlan.minDeposit)} TRUST ` +
        `(both read from the chain)`,
    );
  }
}

if (process.argv.includes('--simulate')) {
  const from = (arg('from') ?? receiver) as Address | undefined;
  if (from === undefined) {
    console.error('\n--simulate needs --from (or --receiver) to call from, and it must be funded.');
    process.exit(1);
  }
  const client = createPublicClient({ transport: http(rpcUrl) });

  /**
   * Only the calls whose prerequisites already hold.
   *
   * `eth_call`s are independent against current state, so simulating a `create-triple` whose atom
   * this plan has not created yet always reverts with `MultiVault_TermDoesNotExist` — a false
   * failure on a correct plan, which is worse than no simulation at all. An earlier version of this
   * script printed exactly that.
   *
   * The rule is **conservative on purpose**: a `create-triple` is simulated only when *every* atom
   * in the plan is already on chain, not just its own. Associating a call back to its tool would
   * mean matching on the `why` string, which couples this script to the module's wording for the
   * sake of simulating one more call.
   *
   * `--from` must be funded: `eth_call` carrying value from an empty account fails on
   * `insufficient funds for gas * price + value` before any contract logic runs, so an unfunded
   * address makes every row REVERT for a reason that has nothing to do with the plan.
   */
  const everyAtomExists = plan.tools.every((tool) => tool.atomExists);
  const simulatable = [...plan.calls, ...stakeCalls].filter(
    (call) => call.kind !== 'create-triple' || everyAtomExists,
  );
  const skipped = plan.calls.length + stakeCalls.length - simulatable.length;

  console.log(`\nsimulating ${simulatable.length} call(s) from ${from} — eth_call, nothing sent:`);
  for (const call of simulatable) {
    try {
      await client.call({ account: from, to: call.to, value: call.value, data: call.data as Hex });
      console.log(`  ok      ${call.kind}  ${call.why}`);
    } catch (error) {
      // A revert here is the point: it is found before the fee is paid, not after.
      console.log(`  REVERT  ${call.kind}  ${String(error).split('\n')[0]?.slice(0, 160)}`);
    }
  }
  if (skipped > 0) {
    console.log(
      `  ${skipped} create-triple call(s) NOT simulated: their atom does not exist yet, so an\n` +
        `  independent eth_call would revert on MultiVault_TermDoesNotExist and tell you nothing.`,
    );
  }
}

/**
 * `--json` writes the calls for `scripts/agent-send-plan.ts`, which is the only script here that
 * signs. The split is deliberate and matches ADR `0038` one level up: planning and signing are
 * different programs, so a plan can be read, diffed and approved before a key is anywhere near it.
 *
 * `value` is serialised as a **decimal string** because JSON has no bigint. The sender parses it
 * back with `BigInt`, and `chainId` travels on every call so the sender can refuse a plan built
 * for another chain.
 */
const jsonPath = arg('json');
if (jsonPath !== undefined) {
  const all = [...plan.calls, ...stakeCalls];
  writeFileSync(
    jsonPath,
    `${JSON.stringify(
      all.map((call) => ({ ...call, value: call.value.toString() })),
      null,
      2,
    )}\n`,
  );
  console.log(`\nwrote ${all.length} call(s) to ${jsonPath}`);
  console.log(
    `  next: bun run scripts/agent-send-plan.ts --chain ${chainId} --plan ${jsonPath}` +
      `   (add --execute to send)`,
  );
}

console.log(
  `\nNothing was signed and nothing was sent. These calls are yours to sign, in the order ` +
    `printed.\nCreating a term costs a fee that is NOT recoverable — check the totals above first.`,
);
