/** Do the directory's two GraphQL queries validate against the live testnet schema?
 *
 *      bun run scripts/verify/verify-directory-queries.ts
 *
 *  Read-only. Signs nothing. A mocked transport proves the variables were passed, not that the
 *  query is valid (`claims.md` check 4), so this runs `getAgentEndpoints` against testnet 13579 for
 *  every subject of the `has endpoint` predicate recorded in `data/deployments/13579.json`. Those
 *  claims were written by others and carry no ARP binding, so each is expected to read `unproven`;
 *  what is being checked is that the queries return at all.
 */
import deployments from '../../data/deployments/13579.json' with { type: 'json' };
import { getAgentEndpoints, type HandshakeChain } from '../../packages/protocol/src/index.js';

const GRAPHQL = deployments.chain.graphqlUrl;
const { hasEndpoint, inContextOf } = deployments.arp.endpointBinding;

const subjects = await fetch(GRAPHQL, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    query: `query($p: String!) { triples(where: {predicate_id: {_eq: $p}}, limit: 20) { subject_id } }`,
    variables: { p: hasEndpoint },
  }),
  signal: AbortSignal.timeout(60000),
}).then(
  async (response) => (await response.json()) as { data?: { triples: { subject_id: string }[] } },
);

/** No proof is expected, so the chain is never asked; a read here would be a finding. */
const chain: HandshakeChain = {
  ownerOf: async () => {
    throw new Error('unexpected ownerOf: a proof was found');
  },
  verifyMessage: async () => {
    throw new Error('unexpected verifyMessage: a proof was found');
  },
};

const unique = [...new Set((subjects.data?.triples ?? []).map((row) => row.subject_id))];
console.log(
  `testnet 13579, ${new Date().toISOString()}: ${unique.length} subjects of has endpoint`,
);
// The subjects are not ARP agents, so no agent id is known for them. Any well-formed one serves: a
// proof would be checked against it, and none is expected.
const placeholder = {
  agentRegistry: `eip155:13579:${deployments.arp.identityRegistry}`,
  agentId: '0',
};
for (const subject of unique) {
  const listed = await getAgentEndpoints(
    { agentAtom: subject, ...placeholder },
    {
      graphqlUrl: GRAPHQL,
      predicates: { hasEndpoint, inContextOf },
      chain,
    },
  );
  for (const entry of listed) {
    console.log(
      `  ${subject.slice(0, 10)}…  ${entry.status.padEnd(10)} ${entry.endpoint.slice(0, 70)}`,
    );
  }
}
