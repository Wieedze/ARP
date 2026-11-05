/** The third agent of `agent-pulse-walk.ts`: it holds no key and knows a domain and an agent id. Testnet 13579.
 *
 *      bun run scripts/demo/agent-pulse-read.ts [--agent 2] [--domain document]
 *
 *  It reads each proof from public sources and says what each one establishes, and it asks the plugin's own tools
 *  the same question, so a gap between what the chain holds and what an agent is handed shows. Appends to
 *  `data/measurements/agent-pulse-read-<date>.jsonl`.
 */
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

import {
  createPublicClient,
  getAddress,
  http,
  parseAbi,
  stringToHex,
  verifyMessage,
  type Address,
  type Hex,
} from 'viem';

import deployment from '../../data/deployments/13579.json';
import { canonicalAgentThing, thingUri } from '../../packages/protocol/src/declare/agent-atom.ts';
import { atomDataForUri, multiVaultReads } from '../../packages/protocol/src/declare/multivault.ts';
import { BECAUSE_LABEL, HAS_OUTCOME_LABEL } from '../../packages/protocol/src/declare/usage-context.ts';
import { getAgentEndpoints } from '../../packages/protocol/src/directory.ts';
import { readLineReceipts, receiptHolds, walletControlsSubject } from '../../packages/protocol/src/agent-pulse.ts';
import { getPulseUsage } from '../../packages/protocol/src/pulse-usage.ts';

const arg = (name: string, fallback: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
};
const AGENT = arg('agent', '2');
const DOMAIN = arg('domain', 'document');
const CHAIN_ID = 13579;
const MCP_PORT = 3173;

const registry = deployment.arp.identityRegistry as Address; // an address in this repo's record
const agentRegistry = `eip155:${CHAIN_ID}:${registry}`;
const graphqlUrl = deployment.chain.graphqlUrl;
const inContextOf = deployment.arp.endpointBinding.inContextOf as Hex; // an id in this repo's record
const client = createPublicClient({ transport: http(deployment.chain.rpcUrl) });
const reads = multiVaultReads({
  address: deployment.intuition.multiVault as Address, // an address in this repo's record
  chainId: CHAIN_ID,
  rpcUrl: deployment.chain.rpcUrl,
});
const REGISTRY_ABI = parseAbi([
  'function ownerOf(uint256) view returns (address)',
  'function getAgentWallet(uint256) view returns (address)',
]);

const rows: Record<string, unknown>[] = [];
const printable = (_key: string, value: unknown) =>
  typeof value === 'bigint' ? value.toString() : value;
const note = (step: string, facts: Record<string, unknown>) => {
  const row = { at: new Date().toISOString(), step, ...facts };
  rows.push(row);
  console.log(JSON.stringify(row, printable));
};

async function gql(query: string, variables: Record<string, unknown>) {
  const response = await fetch(graphqlUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as { data?: Record<string, unknown>; errors?: unknown }; // checked next
  if (body.data === undefined) throw new Error(JSON.stringify(body.errors).slice(0, 300));
  return body.data;
}

const mcp = spawn('bun', ['--no-env-file', 'run', 'apps/mcp/src/server.ts'], {
  env: {
    PATH: process.env['PATH'],
    HOME: process.env['HOME'],
    ARP_TARGET: 'testnet',
    ARP_NO_RECEIPTS: '1',
    PORT: String(MCP_PORT),
  },
  stdio: 'ignore',
});
process.on('exit', () => mcp.kill());
async function tool(name: string, args: Record<string, unknown>): Promise<unknown> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${MCP_PORT}/`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name, arguments: args },
        }),
      });
      const body = (await response.json()) as {
        result?: { content?: { text?: string }[] };
        error?: unknown;
      }; // read next
      const text = body.result?.content?.[0]?.text;
      if (text === undefined) return { noAnswer: body.error ?? body.result };
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return { text: text.slice(0, 300) };
      }
    } catch {
      await new Promise((resume) => setTimeout(resume, 500));
    }
  }
  throw new Error('the MCP server did not come up');
}

const hiredUri = thingUri(canonicalAgentThing(CHAIN_ID, AGENT));
const hiredAtom = await reads.atomId(atomDataForUri(hiredUri));
const domainAtom = await reads.atomId(stringToHex(DOMAIN));

// What the plugin hands an agent today.
note('plugin: arp_find_agents', {
  answer: await tool('arp_find_agents', { domain: DOMAIN }),
});
note('plugin: arp_agent_endpoints', {
  answer: await tool('arp_agent_endpoints', {
    agent_chain_id: CHAIN_ID,
    agent_token_id: AGENT,
    registry,
  }),
});

// Walk back from the domain's word: which agents have a line in it?
const inDomain = ((
  await gql(
    `query($p: String!, $o: String!) { triples(where: {predicate_id: {_eq: $p}, object_id: {_eq: $o}}, limit: 250) { subject_id } }`,
    { p: inContextOf, o: domainAtom },
  )
)['triples'] ?? []) as { subject_id: string }[]; // the query's shape
const edges = ((
  await gql(
    `query($t: [String!]!) { triples(where: {term_id: {_in: $t}}, limit: 250) { term_id object_id subject { label } predicate { label } } }`,
    { t: inDomain.map((entry) => entry.subject_id) },
  )
)['triples'] ?? []) as { term_id: string; object_id: string }[]; // the query's shape
note('graph: walked from the domain', {
  domain: DOMAIN,
  linesInDomain: inDomain.length,
  reachesThisAgent: edges.some((edge) => edge.object_id.toLowerCase() === hiredAtom.toLowerCase()),
});

// Proof 1: the address.
const endpoints = await getAgentEndpoints(
  { agentRegistry, agentId: AGENT, agentAtom: hiredAtom },
  {
    graphqlUrl,
    predicates: {
      hasEndpoint: deployment.arp.endpointBinding.hasEndpoint,
      inContextOf,
    },
    chain: {
      ownerOf: ({ registry: at, agentId }) =>
        client.readContract({
          address: at,
          abi: REGISTRY_ABI,
          functionName: 'ownerOf',
          args: [agentId],
        }),
      verifyMessage: ({ address, message, signature }) =>
        verifyMessage({ address, message, signature }),
    },
  },
);
const bound = endpoints.find((entry) => entry.status === 'bound');
const boundProof = bound?.proofs.find(
  (proof): proof is Extract<typeof proof, { binding: unknown }> => 'binding' in proof,
);
const nodeAddress = boundProof === undefined ? null : getAddress(boundProof.binding.nodeAddress);
note('proof 1: the address', {
  claims: endpoints.map((entry) => [entry.endpoint, entry.status]),
  bound: bound?.endpoint ?? null,
  nodeAddress,
});
if (bound !== undefined) {
  const answers = await fetch(`${bound.endpoint}/healthz`, {
    signal: AbortSignal.timeout(10_000),
  }).then(
    (response) => response.ok,
    () => false,
  );
  note('the address answers now', { endpoint: bound.endpoint, answers });
}

// Proof 3, read first because it leads to proof 2: the lines about this agent.
const hasOutcome = await reads.atomId(stringToHex(HAS_OUTCOME_LABEL));
const usage = (
  await getPulseUsage([hiredAtom], {
    graphqlUrl,
    inContextOf,
    hasOutcome,
    because: await reads.atomId(stringToHex(BECAUSE_LABEL)),
    payers: [deployment.arp.deployer],
  })
).get(hiredAtom.toLowerCase());
note('proof 3: the lines', {
  wallets: usage?.wallets ?? 0,
  declarations: usage?.declarations ?? [],
  byOthers: usage?.byOthers ?? [],
});

// Proof 2: the receipts on each line, read by the code the plugin runs.
const boundNodes = nodeAddress === null ? [] : [nodeAddress];
for (const line of usage?.declarations ?? []) {
  const read = await readLineReceipts(line, {
    graphqlUrl,
    inContextOf,
    agentRegistry,
    agentId: AGENT,
    boundNodes,
    chainId: CHAIN_ID,
    getPayment: async (hash) => {
      try {
        const [transaction, mined] = await Promise.all([
          client.getTransaction({ hash }),
          client.getTransactionReceipt({ hash }),
        ]);
        return { status: mined.status, from: transaction.from, to: transaction.to, value: transaction.value };
      } catch (error) {
        if (error instanceof Error && /^Transaction(Receipt)?NotFoundError$/.test(error.name)) return null;
        throw error;
      }
    },
    subjectControl: (wallet) =>
      walletControlsSubject(line.agent.atomId, wallet, {
        graphqlUrl,
        chainId: CHAIN_ID,
        knownRegistries: [registry],
        controllersOf: async (ref) => {
          const args = [BigInt(ref.tokenId)] as const;
          return Promise.all([
            client.readContract({ address: ref.registry, abi: REGISTRY_ABI, functionName: 'ownerOf', args }),
            client.readContract({ address: ref.registry, abi: REGISTRY_ABI, functionName: 'getAgentWallet', args }),
          ]);
        },
      }),
  });
  note('proof 2: the receipts', {
    line: line.tripleId,
    receipts: read.receipts.map((receipt) => ({ ...receipt, holds: receiptHolds(receipt) })),
    unreadable: read.unreadable,
    othersNotRead: read.othersNotRead,
  });
}

appendFileSync(
  `data/measurements/agent-pulse-read-${new Date().toISOString().slice(0, 10)}.jsonl`,
  `${rows.map((entry) => JSON.stringify(entry, printable)).join('\n')}\n`,
);
process.exit(0);
