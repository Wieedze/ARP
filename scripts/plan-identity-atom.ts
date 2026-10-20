/** Plan the identity atom a `uses` edge needs, for an agent Intuition has not mirrored.
 *
 *  Data and planning; `agent-identity-atom.ts` is the CLI over it and `demo-adopt.ts` is the other
 *  caller. Extracted when the second caller appeared, so the two cannot grow two copies of a recipe
 *  whose whole property is being byte-identical.
 *
 *  Why it is needed at all: the atom is written by Intuition's **mirror**, which covers Base. On
 *  mainnet 1155 the mirrored agents have one, so a third party does nothing. Elsewhere — and for any
 *  agent minted after the last mirror run — it does not exist, and nothing else in the protocol works
 *  until it does (ADR `0047`).
 *
 *      (identity atom) --same as--> (caip19 atom)
 *
 *  That direction is the one `RESOLVE_AGENT_QUERY` reads: it filters on the **object**'s Thing name
 *  and returns the **subject**. Reversed, the agent stays unresolvable and the fee is spent.
 *
 *  Signs nothing. It pins — which needs `INTUITION_PIN_API_KEY` and creates no on-chain state — and
 *  returns calls for `send-plan.ts`. The pinned URI is checked against `thingUri`'s local
 *  computation and the plan is refused on a mismatch: the id is knowable without the API, so a
 *  disagreement means one of the two has drifted and minting either would be permanent.
 */
import {
  INTUITION_SAME_AS_TERM_ID,
  atomDataForUri,
  encodeCreateAtom,
  encodeCreateTriple,
  toCaip19,
} from '../packages/protocol/src/index.js';
import type { MultiVaultReads, PreparedCall } from '../packages/protocol/src/declare/index.js';
import type { Address, Hex } from 'viem';

import {
  canonicalAgentThing,
  canonicalCaipThing,
  pinThing,
  thingDocument,
  thingUri,
} from './intuition-pin.js';

export type IdentityPlan = {
  caip19: string;
  identityAtom: Hex;
  caipAtom: Hex;
  tripleId: Hex;
  /** What already exists, so "nothing to do" reads differently from "failed to plan". */
  existing: { identityAtom: boolean; caipAtom: boolean; triple: boolean };
  /** The pinned documents, for a caller that wants to show what was written. */
  documents: { identity: string; caip: string };
  uris: { identity: string; caip: string };
  calls: PreparedCall[];
  totalValue: bigint;
};

export class PinMismatchError extends Error {
  override readonly name = 'PinMismatchError';
  constructor(which: string, returned: string, expected: string) {
    super(
      `the pinning API returned ${returned} for the ${which} Thing, but the recipe computes ${expected}. One of the two has drifted; minting either would be permanent.`,
    );
  }
}

export class PinFailedError extends Error {
  override readonly name = 'PinFailedError';
  constructor(which: string, status: number, body: string) {
    super(`pinning the ${which} Thing failed: http=${status} ${body.slice(0, 200)}`);
  }
}

export async function planIdentityAtom(params: {
  agent: { chainId: number; tokenId: string; registry?: Address };
  reads: MultiVaultReads;
  pin: { apiKey: string; headerName: string };
}): Promise<IdentityPlan> {
  const caip19 = toCaip19(params.agent);
  const things = {
    identity: canonicalAgentThing(params.agent.chainId, params.agent.tokenId),
    caip: canonicalCaipThing(caip19),
  } as const;

  const uris: Record<'identity' | 'caip', string> = { identity: '', caip: '' };
  for (const key of ['identity', 'caip'] as const) {
    const expected = thingUri(things[key]);
    const result = await pinThing(things[key], params.pin);
    if (result.status !== 200 || result.uri === undefined) {
      throw new PinFailedError(key, result.status, result.body);
    }
    if (result.uri !== expected) throw new PinMismatchError(key, result.uri, expected);
    uris[key] = result.uri;
  }

  const identityAtom = await params.reads.atomId(atomDataForUri(uris.identity));
  const caipAtom = await params.reads.atomId(atomDataForUri(uris.caip));
  const tripleId = await params.reads.tripleId(
    identityAtom,
    INTUITION_SAME_AS_TERM_ID as Hex,
    caipAtom,
  );

  const [identityExists, caipExists, tripleExists] = await Promise.all([
    params.reads.termExists(identityAtom),
    params.reads.termExists(caipAtom),
    params.reads.termExists(tripleId),
  ]);

  const [atomCost, tripleCost] = await Promise.all([
    params.reads.atomCost(),
    params.reads.tripleCost(),
  ]);

  const calls: PreparedCall[] = [];
  if (!identityExists) {
    calls.push({
      kind: 'create-atom',
      chainId: params.reads.chainId,
      to: params.reads.address,
      value: atomCost,
      data: encodeCreateAtom(atomDataForUri(uris.identity), atomCost),
      why: `the agent's identity atom, from the canonical recipe (${things.identity.name})`,
    });
  }
  if (!caipExists) {
    calls.push({
      kind: 'create-atom',
      chainId: params.reads.chainId,
      to: params.reads.address,
      value: atomCost,
      data: encodeCreateAtom(atomDataForUri(uris.caip), atomCost),
      why: `the CAIP-19 identifier atom (${caip19})`,
    });
  }
  if (!tripleExists) {
    calls.push({
      kind: 'create-triple',
      chainId: params.reads.chainId,
      to: params.reads.address,
      value: tripleCost,
      data: encodeCreateTriple(
        identityAtom,
        INTUITION_SAME_AS_TERM_ID as Hex,
        caipAtom,
        tripleCost,
      ),
      why: 'identity atom --same as--> caip19 atom, the edge resolution reads',
    });
  }

  return {
    caip19,
    identityAtom,
    caipAtom,
    tripleId,
    existing: { identityAtom: identityExists, caipAtom: caipExists, triple: tripleExists },
    documents: { identity: thingDocument(things.identity), caip: thingDocument(things.caip) },
    uris,
    calls,
    totalValue: calls.reduce((sum, call) => sum + call.value, 0n),
  };
}
