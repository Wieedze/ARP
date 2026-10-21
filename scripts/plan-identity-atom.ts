/** Pin the identity documents, then plan the atoms a `uses` edge needs.
 *
 *  `agent-identity-atom.ts` is the CLI over it and `demo-adopt.ts` is the other caller.
 *
 *  **The planning moved into the package** on 2026-10-21 —
 *  `packages/protocol/src/declare/identity-plan.ts`. It had to: this file pins *before* it plans, so
 *  it needs the partner credential (ADR `0016`), and `PinAuth` is branded precisely so browser code
 *  cannot construct one. That made the whole path unreachable from the UI, and the UI is where an
 *  operator importing an existing agent actually is. The atom's id needs no credential — it is
 *  `ipfs://` + the CID of a document that is a pure function of the agent's identity — so the planner
 *  belongs where both callers can reach it (`rules/portability.md`: protocol logic in the package).
 *
 *  What is left here is the one thing that genuinely needs the key: **the pin, and the check that the
 *  API agrees with the recipe.** The returned URI is compared against `thingUri`'s local computation
 *  and the plan is refused on a mismatch — the id is knowable without the API, so a disagreement
 *  means one of the two has drifted and minting either would be permanent.
 *
 *  Signs nothing. Pinning is content-addressed, so it is idempotent and creates no on-chain state.
 */
import {
  prepareIdentityAtom,
  thingUri,
  type IdentityAtomPlan,
  type MultiVaultReads,
} from '../packages/protocol/src/index.js';
import type { Address } from 'viem';

import { pinThing } from './intuition-pin.js';

export type { IdentityAtomPlan };

/** Kept as the module's own name for the plan, so existing callers do not all have to change. */
export type IdentityPlan = IdentityAtomPlan;

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
  /** The deposit every term this plan creates is born with. Defaults to the chain's `minDeposit`. */
  birthDeposit?: bigint;
  /**
   * The pin call. Defaults to the real one; injected by tests so the planning can be checked
   * without a credential and without writing to a third party's service for our own sake.
   */
  pinner?: typeof pinThing;
}): Promise<IdentityAtomPlan> {
  const plan = await prepareIdentityAtom({
    agent: params.agent,
    reads: params.reads,
    ...(params.birthDeposit === undefined ? {} : { birthDeposit: params.birthDeposit }),
  });

  // Pinned after planning, not before: the plan is what says which documents matter, and a pin of
  // the wrong bytes is a silent no-op rather than an error.
  for (const key of ['identity', 'caip'] as const) {
    const expected = thingUri(plan.things[key]);
    const result = await (params.pinner ?? pinThing)(plan.things[key], params.pin);
    if (result.status !== 200 || result.uri === undefined) {
      throw new PinFailedError(key, result.status, result.body);
    }
    if (result.uri !== expected) throw new PinMismatchError(key, result.uri, expected);
  }

  return plan;
}
