import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createPublicClient, http, parseAbi, type Address, type Hex } from 'viem';
import type { GraphqlReply } from '../helpers/shapes.js';

/** What ARP can show on each chain today, read rather than remembered.
 *
 *      bun run scripts/measure/mainnet-readiness.ts
 *      bun run scripts/measure/mainnet-readiness.ts --json data/measurements/mainnet-readiness-<stamp>.json
 *
 *  The figures behind `docs/27_THE_PASSAGE_TO_MAINNET.md`. Read-only: GraphQL queries and `eth_call`s.
 *  The one simulated write, `createTriples` on 1155, is an `eth_call`, so nothing is signed or sent.
 *
 *  `previewTripleCreate` is asked about an invented term id on purpose: the question is whether a
 *  term that does not exist yet can be previewed, because that is what planning a declaration does.
 */
const USES: Hex = '0x5c0bde1cc696456c0268248c4656acdf9621fdb39e605bc99b0a83dc8ff6e800';
/** Agent 8453:1380 and the `github.com` atom, both on 1155. Their triple did not exist on 2026-11-04. */
const SIM_SUBJECT: Hex = '0x45078ae569def2264355f77e592028dd6f1f5d6373c204fe82bf3141ab1861fb';
const SIM_OBJECT: Hex = '0x74bdd56f336fe37b5d2f5e772a3ac6c6f09665a78943e7202ce91674ff40dfc2';

const abi = parseAbi([
  'function getAtomCost() view returns (uint256)',
  'function getTripleCost() view returns (uint256)',
  'function previewTripleCreate(bytes32 termId, uint256 assets) view returns (uint256, uint256, uint256)',
  'function createTriples(bytes32[] subjectIds, bytes32[] predicateIds, bytes32[] objectIds, uint256[] assets) payable returns (bytes32[])',
]);

type Deployment = {
  chain: { chainId: number; rpcUrl: string; graphqlUrl: string };
  intuition: { multiVault: Address };
  deployedBy?: string;
};
type Edge = { subject_id: string; object_id: string; creator_id: string };
type Term = { label?: string | null; data?: string | null };
type SameAs = { subject_id: string; object_id: string; subject?: Term | null; object?: Term | null };

function readJson<T>(path: string): T {
  // Our own committed files; the type names the fields this script reads.
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const mainnet = readJson<Deployment>('data/deployments/1155.json');
const testnet = readJson<Deployment>('data/deployments/13579.json');
const catalogue = readJson<{ skills?: { atom?: string }[] }>('data/catalogue/skills-13579.json');
const skillAtoms = (catalogue.skills ?? []).flatMap((row) => (row.atom ? [row.atom] : []));
// The address that deployed ARP's mainnet contracts is also the testnet treasury (STATE, task 40).
const arpAddress = (mainnet.deployedBy ?? '').toLowerCase();

async function graphql<T>(url: string, query: string, variables: Record<string, unknown>): Promise<T> {
  // The indexer's rate limit answers with no `data` at all, so that reply is waited out.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'arp-measure' },
      body: JSON.stringify({ query, variables }),
    });
    // Narrowed just below: a reply with no data is retried, then thrown.
    const reply = (await response.json().catch(() => ({}))) as GraphqlReply<T>;
    if (reply.data !== undefined) return reply.data;
    if (reply.errors !== undefined) throw new Error(JSON.stringify(reply.errors));
    await Bun.sleep(1000 * 2 ** attempt);
  }
  throw new Error(`no answer from ${url}`);
}

/** Stops on an empty page, not a short one: the testnet indexer returned 250 rows to a limit of 500. */
async function allUsesEdges(url: string): Promise<Edge[]> {
  const edges: Edge[] = [];
  for (let offset = 0; ; offset += 200) {
    const { triples } = await graphql<{ triples: Edge[] }>(
      url,
      `query($p: String!, $o: Int!) { triples(where: {predicate_id: {_eq: $p}}, limit: 200, offset: $o,
        order_by: {term_id: asc}) { subject_id object_id creator_id } }`,
      { p: USES, o: offset },
    );
    edges.push(...triples);
    if (triples.length === 0) return edges;
  }
}

async function measureChain(deployment: Deployment) {
  const url = deployment.chain.graphqlUrl;
  const edges = await allUsesEdges(url);
  const subjects = [...new Set(edges.map((edge) => edge.subject_id))];

  const { atoms: predicates } = await graphql<{ atoms: { term_id: string }[] }>(
    url,
    '{ atoms(where: {label: {_eq: "same as"}}) { term_id } }',
    {},
  );
  const sameAsIds = predicates.map((atom) => atom.term_id);
  const identified = new Set<string>();
  const onBase = new Set<string>();
  for (let index = 0; index < subjects.length; index += 25) {
    const chunk = subjects.slice(index, index + 25);
    for (let offset = 0; ; offset += 200) {
      const { triples } = await graphql<{ triples: SameAs[] }>(
        url,
        `query($s: [String!], $p: [String!], $o: Int!) { triples(where: {predicate_id: {_in: $p},
          _or: [{subject_id: {_in: $s}}, {object_id: {_in: $s}}]}, limit: 200, offset: $o,
          order_by: {term_id: asc}) { subject_id object_id subject { label data } object { label data } } }`,
        { s: chunk, p: sameAsIds, o: offset },
      );
      for (const triple of triples) {
        for (const id of [triple.subject_id, triple.object_id]) {
          if (!chunk.includes(id)) continue;
          identified.add(id);
          if (JSON.stringify(triple).includes('eip155:8453')) onBase.add(id);
        }
      }
      if (triples.length === 0) break;
    }
  }

  let skillAtomsOnChain = 0;
  for (let index = 0; index < skillAtoms.length; index += 200) {
    const { atoms } = await graphql<{ atoms: { term_id: string }[] }>(
      url,
      'query($i: [String!]) { atoms(where: {term_id: {_in: $i}}) { term_id } }',
      { i: skillAtoms.slice(index, index + 200) },
    );
    skillAtomsOnChain += atoms.length;
  }

  const client = createPublicClient({ transport: http(deployment.chain.rpcUrl) });
  const address = deployment.intuition.multiVault;
  const [atomCost, tripleCost] = await Promise.all([
    client.readContract({ address, abi, functionName: 'getAtomCost' }),
    client.readContract({ address, abi, functionName: 'getTripleCost' }),
  ]);
  const inventedTerm = `0x${randomBytes(32).toString('hex')}` as Hex; // 32 random bytes, hex encoded.
  const previewNewTerm = await client
    .readContract({ address, abi, functionName: 'previewTripleCreate', args: [inventedTerm, tripleCost * 2n] })
    .then(() => 'answers')
    .catch(() => 'reverts');

  return {
    chainId: deployment.chain.chainId,
    usesEdges: edges.length,
    creators: new Set(edges.map((edge) => edge.creator_id)).size,
    subjects: subjects.length,
    objects: new Set(edges.map((edge) => edge.object_id)).size,
    edgesByArpAddress: edges.filter((edge) => edge.creator_id.toLowerCase() === arpAddress).length,
    subjectsWithSameAs: identified.size,
    subjectsWithBaseIdentity: onBase.size,
    edgesFromBaseIdentities: edges.filter((edge) => onBase.has(edge.subject_id)).length,
    skillAtomsInCatalogue: skillAtoms.length,
    skillAtomsOnChain,
    atomCostWei: atomCost.toString(),
    tripleCostWei: tripleCost.toString(),
    previewNewTerm,
  };
}

async function simulateCreateOnMainnet(): Promise<string> {
  const client = createPublicClient({ transport: http(mainnet.chain.rpcUrl) });
  const cost = await client.readContract({
    address: mainnet.intuition.multiVault,
    abi,
    functionName: 'getTripleCost',
  });
  const assets = cost + 10n ** 16n;
  return client
    .simulateContract({
      address: mainnet.intuition.multiVault,
      abi,
      functionName: 'createTriples',
      args: [[SIM_SUBJECT], [USES], [SIM_OBJECT], [assets]],
      value: assets,
      account: mainnet.deployedBy as Address, // A committed checksummed address; the call is never sent.
    })
    .then(() => 'succeeds')
    .catch((error: unknown) => `reverts: ${String(error).slice(0, 160)}`);
}

const result = {
  measuredAt: new Date().toISOString(),
  question: 'What can ARP show on each chain, and can it plan a new declaration there?',
  chains: [await measureChain(mainnet), await measureChain(testnet)],
  createTriplesSimulatedOn1155: await simulateCreateOnMainnet(),
};

console.log(JSON.stringify(result, null, 1));
const jsonFlag = process.argv.indexOf('--json');
const jsonPath = jsonFlag === -1 ? undefined : process.argv[jsonFlag + 1];
if (jsonPath !== undefined) writeFileSync(jsonPath, `${JSON.stringify(result, null, 1)}\n`);
