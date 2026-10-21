/** The whole adoption walk, in one command, for an agent that already exists.
 *
 *      ARP_TARGET=testnet bun run scripts/demo-adopt.ts \
 *        --agent 13579/4 --registry 0xC165A2AD… --tool ipfs://bafkrei… --stake 0.002
 *      # …then again with --execute
 *
 *  **Why this exists.** Every piece of this path was built and tested, and nobody had ever walked it
 *  end to end the way a stranger would. The pieces passing individually is not the same claim as the
 *  path working, and the difference is where the gaps were: the identity atom prerequisite (ADR
 *  `0047`) was invisible until someone tried to go from one end to the other.
 *
 *  Five stages, and each one prints **what a third party can see that they could not before** —
 *  because that is the product. Not a score, a record somebody else can read.
 *
 *    1. before      can this agent declare at all? (the question `arp_identity` answers)
 *    2. identity    the atom a `uses` edge carries as its subject, if the mirror has not written it
 *    3. declare     the tool's atom and the `(agent, uses, tool)` edge
 *    4. stake       TRUST behind the declaration, which is what makes it weigh anything
 *    5. after       the agent read back as a stranger, and the tool's market
 *
 *  It composes the real modules — `plan-identity-atom.ts`, the connector's planners, `send-plan.ts`
 *  — and reimplements none of them. A demo that reimplements the thing it demonstrates proves only
 *  that the demo works.
 *
 *  Dry by default. `--execute` signs with `AGENT_PRIVATE_KEY`, which is read from the environment
 *  and never printed (ADR `0037`); the signer's address is printed so it can be checked first.
 */
import { readFileSync } from 'node:fs';

import { formatEther, parseEther } from 'viem';
import type { Address } from 'viem';

import { createErc8004Client } from '../packages/protocol/src/client.js';
import {
  intuitionToolAtomLookup,
  multiVaultReads,
  prepareDeclareUsed,
  prepareStakeOnUsed,
  resolveDeclarationSubject,
  type PreparedCall,
} from '../packages/protocol/src/declare/index.js';
import { getAgentProfile } from '../packages/protocol/src/profile.js';
import { intuitionSource } from '../packages/protocol/src/sources/intuition/index.js';
import { getToolUsage } from '../packages/protocol/src/tool-usage.js';
import { asAgentIdentityAtom } from '../packages/protocol/src/verify/subject.js';
import { planIdentityAtom } from './plan-identity-atom.js';
import { sendPlan, type SerialisedCall } from './send-plan.js';

const TARGETS = { mainnet: 1155, testnet: 13579 } as const;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}
const execute = process.argv.includes('--execute');

const targetName = (process.env.ARP_TARGET ?? 'testnet') as keyof typeof TARGETS;
const chainId = TARGETS[targetName];
const agentRef = arg('agent');
const toolUri = arg('tool');
if (chainId === undefined || !agentRef || !/^\d+\/\d+$/.test(agentRef) || !toolUri) {
  console.error(
    'usage: --agent <chainId>/<tokenId> --tool <uri> [--registry <0x…>] [--stake <TRUST>] [--execute]\n' +
      '  ARP_TARGET is testnet or mainnet (default testnet).',
  );
  process.exit(1);
}
const [agentChainId, agentTokenId] = agentRef.split('/') as [string, string];
const registry = arg('registry') as Address | undefined;
const agent = {
  chainId: Number(agentChainId),
  tokenId: agentTokenId,
  ...(registry === undefined ? {} : { registry }),
};

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
const client = createErc8004Client({ sources: [intuitionSource({ graphqlUrl })] });
const serialise = (calls: readonly PreparedCall[]): SerialisedCall[] =>
  calls.map((call) => ({ ...call, value: call.value.toString() }));

function stage(n: number, title: string) {
  console.log(`\n${'─'.repeat(72)}\n${n}. ${title}\n`);
}

/** Sends a stage's calls, or reports why it did not, and stops the walk on a refusal. */
async function run(label: string, calls: readonly PreparedCall[]): Promise<boolean> {
  if (calls.length === 0) {
    console.log(`  nothing to do — already on chain.`);
    return true;
  }
  for (const call of calls) {
    console.log(
      `  ${call.kind.padEnd(14)} ${formatEther(call.value).padStart(14)}` +
        `${call.preview === undefined ? '' : `  ${call.preview.shares} shares`}  ${call.why}`,
    );
  }
  const outcome = await sendPlan({
    calls: serialise(calls),
    chainId,
    rpcUrl,
    execute,
    onCall: (index, _call, hash, status, gas) =>
      console.log(`    ${String(index + 1).padStart(2)}. ${status.padEnd(8)} ${hash}  gas ${gas}`),
  });
  if (outcome.status === 'refused') {
    console.error(`\n  REFUSED — ${outcome.reason}.`);
    return false;
  }
  if (outcome.status === 'dry-run') {
    console.log(`  signer ${outcome.signer}, balance ${formatEther(outcome.balance)}`);
    console.log(`  would spend ${formatEther(outcome.total)} on ${label}. Dry run.`);
    return true;
  }
  if (outcome.status === 'reverted') {
    console.error(`\n  STOPPED — call ${(outcome.revertedAt ?? 0) + 1} reverted.`);
    return false;
  }
  console.log(`  spent ${formatEther(outcome.total)} on ${label}.`);
  return true;
}

console.log(`chain      ${chainId} (${record.chain?.name ?? 'unknown'})`);
console.log(
  `agent      ${agent.chainId}/${agent.tokenId}${registry === undefined ? '' : ` in ${registry}`}`,
);
console.log(`tool       ${toolUri}`);
console.log(`mode       ${execute ? 'EXECUTE — this spends' : 'dry run'}`);

// ── 1 ────────────────────────────────────────────────────────────────────────
stage(1, 'Before: can this agent declare anything?');
let subject = await resolveDeclarationSubject({ agent, graphqlUrl }).catch(() => null);
if (subject === null) {
  console.log('  no — it has no identity atom on the graph, so a `uses` edge has no subject to');
  console.log("  carry. The atom is written by Intuition's mirror, which covers Base; measured");
  console.log('  2026-10-20 the mirror holds 28,648 of a registry past 309,000, so this is the');
  console.log('  common case and not a fault of the operator (ADR 0047).');
} else {
  console.log(`  yes — identity atom ${subject}`);
}

// ── 2 ────────────────────────────────────────────────────────────────────────
stage(2, 'Identity: write what the mirror would have written');
if (subject !== null) {
  console.log('  nothing to do — the atom already resolves.');
} else {
  const apiKey = process.env.INTUITION_PIN_API_KEY;
  if (!apiKey) {
    console.error('  INTUITION_PIN_API_KEY is not set — the pinning API is gated (ADR 0016).');
    process.exit(1);
  }
  const plan = await planIdentityAtom({
    agent,
    reads,
    pin: { apiKey, headerName: process.env.INTUITION_PIN_API_KEY_HEADER ?? 'apikey' },
  });
  console.log(`  ${plan.documents.identity}`);
  console.log(`  → ${plan.uris.identity}  (CID recomputed locally; the API's answer matched)\n`);
  if (!(await run('the identity', plan.calls))) process.exit(3);

  // The walk continues against the **computed** atom, in both modes. The id is a pure function of
  // the agent's identity (ADR `0051`), so nothing has to be asked of anyone to know it — which is
  // what lets a dry run preview the rest, and what keeps an execute run moving.
  //
  // It matters more in execute mode than it looks: **the indexer lags the chain.** The first real
  // run of this walk wrote three transactions, all successful, and then stopped at stage 3 because
  // the graph had not caught up. That read as a failure and was a timing property.
  subject = asAgentIdentityAtom(plan.identityAtom, plan.caip19);
  const indexed = await resolveDeclarationSubject({ agent, graphqlUrl }).catch(() => null);
  console.log(`  the atom's id is known without asking anyone: ${plan.identityAtom}`);
  console.log(
    indexed === null
      ? '  the graph has not indexed it yet, which the rest of the walk does not need.'
      : '  and the graph already resolves it.',
  );
}

// ── 3 ────────────────────────────────────────────────────────────────────────
stage(3, 'Declare: the tool, and the edge saying this agent used it');
if (subject === null) {
  console.log('  skipped — the subject does not resolve yet. Re-run with --execute, then again.');
  process.exit(0);
}
const declarePlan = await prepareDeclareUsed({
  subject,
  tools: [toolUri],
  reads,
  lookup: intuitionToolAtomLookup({ graphqlUrl }),
});
for (const tool of declarePlan.tools) {
  console.log(
    `  tool atom ${tool.atomId}  ${tool.atomExists ? 'exists' : 'TO CREATE'}  (${tool.atomSource})`,
  );
  console.log(`  uses edge ${tool.tripleId}  ${tool.tripleExists ? 'exists' : 'TO CREATE'}`);
  if (tool.atomUri !== tool.uri) console.log(`  atom data ${tool.atomUri}`);
  if (tool.bareUrlWarning !== undefined) console.log(`  WARN ${tool.bareUrlWarning}`);
}
console.log('');
if (!(await run('the declaration', declarePlan.calls))) process.exit(3);

// ── 4 ────────────────────────────────────────────────────────────────────────
stage(4, 'Stake: what makes the declaration weigh anything');
const stakeAmount = arg('stake');
const edge = declarePlan.tools[0];
if (stakeAmount === undefined) {
  console.log('  skipped — pass --stake <TRUST> to put money behind the claim.');
} else if (edge === undefined || (!edge.tripleExists && !execute)) {
  console.log('  skipped — the edge is not on chain yet, so there is nothing to deposit into.');
  console.log('  Declaring and staking are two transactions on purpose.');
} else {
  const stakePlan = await prepareStakeOnUsed({
    targets: [{ tripleId: edge.tripleId, amount: parseEther(stakeAmount) }],
    receiver: (arg('receiver') ?? process.env.AGENT_ADDRESS) as Address,
    reads,
  });
  console.log(
    `  curve ${stakePlan.curveId}, min deposit ${formatEther(stakePlan.minDeposit)} (both read from the chain)\n`,
  );
  if (!(await run('the stake', stakePlan.calls))) process.exit(3);
}

// ── 5 ────────────────────────────────────────────────────────────────────────
stage(5, 'After: the agent read back as a stranger would');
/**
 * The one stage that genuinely needs the index, so it waits — briefly, and says it is waiting
 * rather than reporting an empty profile as the result. Measured on the first execute run: three
 * transactions landed and the graph still answered nothing.
 */
let profile = await getAgentProfile(client, agent);
for (let attempt = 1; execute && attempt <= 6; attempt += 1) {
  if ((profile.capabilities ?? []).some((group) => (group.tools ?? []).length > 0)) break;
  console.log(`  waiting for the indexer… (${attempt}/6)`);
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  profile = await getAgentProfile(client, agent);
}
const tools = (profile.capabilities ?? []).flatMap((group) => group.tools ?? []);
console.log(`  caip19      ${profile.caip19}`);
console.log(`  declares    ${tools.length} tool(s)`);
for (const tool of tools) console.log(`    ${tool.relation}  ${tool.label ?? tool.name ?? '?'}`);
if (edge !== undefined) {
  const usage = await getToolUsage(edge.atomId, { graphqlUrl, curveId: 1 });
  console.log(`\n  and the tool's own market — ${usage.label ?? edge.atomId}`);
  console.log(
    `    ${usage.edges.length} incoming edge(s), ${usage.totals.supportPositions} position(s)`,
  );
  console.log(
    `    ${formatEther(usage.totals.supportAssets)} TRUST behind, ${formatEther(usage.totals.opposeAssets)} against`,
  );
}
console.log(
  execute
    ? '\nThe walk completed. Every figure above is readable by anyone with the graph URL.'
    : '\nDry run — nothing was signed. Re-run with --execute to walk it for real.',
);
