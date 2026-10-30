/** Can one `createTriples` call create a triple **and** a second triple whose object is the first?
 *
 *      bun run scripts/measure/nested-triple-batch.ts
 *
 *  Read-only: `eth_call` simulations against testnet 13579's MultiVault, from an address with no
 *  key, given a balance by a state override. Nothing is signed and nothing is sent. Task 39c,
 *  ADR `0095` §7: the endpoint binding writes `(agent, has endpoint, E)` and then
 *  `(document, in context of, that triple)`, and the window between them is where a third party
 *  crowds out the proof. One call carrying both closes it — if the contract creates them in order.
 *
 *  Three simulations, so the answer cannot be an accident of the input:
 *    1. the nested pair in one call, inner first      — the shape the planner would emit
 *    2. the same pair, outer first                    — must revert if ordering is what matters
 *    3. the outer triple alone, inner not yet created — must revert, or (1) proves nothing
 *
 *  The atoms are the two predicates themselves, used as subject and object, so the triples are
 *  ones nobody has written (checked with `isTermCreated` before simulating).
 */
import { createPublicClient, http, type Address, type Hex } from 'viem';

import { encodeCreateTriples, multiVaultReads } from '../../packages/protocol/src/index.js';

const RPC = 'https://testnet.rpc.intuition.systems/http';
const MULTIVAULT: Address = '0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91';
const HAS_ENDPOINT: Hex = '0xa4488686eb3702e4e972a971ea008d6832a7f935b942366f1091566d1993a5f1';
const IN_CONTEXT_OF: Hex = '0x61a88b9c372c0d164d2caf66947b67ed0fcb4c457178a271b6b3dc39fb1f8862';
// No key exists for this address; the balance is a state override that lives for one eth_call.
const FROM: Address = '0x000000000000000000000000000000000000a39b';

const client = createPublicClient({ transport: http(RPC) });
const reads = multiVaultReads({ address: MULTIVAULT, chainId: 13579, client });

const inner = await reads.tripleId(HAS_ENDPOINT, HAS_ENDPOINT, IN_CONTEXT_OF);
const outer = await reads.tripleId(IN_CONTEXT_OF, IN_CONTEXT_OF, inner);
const [innerExists, outerExists, tripleCost, minDeposit] = await Promise.all([
  reads.termExists(inner),
  reads.termExists(outer),
  reads.tripleCost(),
  reads.minDeposit(),
]);
if (innerExists || outerExists) {
  throw new Error(`a probe triple already exists (inner ${innerExists}, outer ${outerExists})`);
}
const assets = tripleCost + minDeposit;
const innerItem = {
  subjectId: HAS_ENDPOINT,
  predicateId: HAS_ENDPOINT,
  objectId: IN_CONTEXT_OF,
  assets,
};
const outerItem = { subjectId: IN_CONTEXT_OF, predicateId: IN_CONTEXT_OF, objectId: inner, assets };

async function simulate(label: string, items: (typeof innerItem)[]): Promise<void> {
  const value = items.reduce((sum, item) => sum + item.assets, 0n);
  try {
    await client.call({
      account: FROM,
      to: MULTIVAULT,
      data: encodeCreateTriples(items),
      value,
      stateOverride: [{ address: FROM, balance: value * 10n }],
    });
    console.log(`  ${label.padEnd(42)} succeeds`);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    const line = text.split('\n').find((l) => /revert|Error|error/.test(l)) ?? text.split('\n')[0];
    console.log(`  ${label.padEnd(42)} reverts: ${line?.trim()}`);
  }
}

console.log(`testnet 13579, MultiVault ${MULTIVAULT}, ${new Date().toISOString()}`);
console.log(`  inner ${inner}\n  outer ${outer}\n  assets per triple ${assets} wei`);
await simulate('1. one call, inner then outer', [innerItem, outerItem]);
await simulate('2. one call, outer then inner', [outerItem, innerItem]);
await simulate('3. outer alone, inner not created', [outerItem]);
