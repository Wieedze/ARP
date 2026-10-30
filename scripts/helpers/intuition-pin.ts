/** The pinning call. The **recipes moved into the package** — see why below.
 *
 *  `canonicalAgentThing`, `canonicalCaipThing`, `thingDocument` and `thingUri` now live in
 *  `packages/protocol/src/declare/agent-atom.ts` and are re-exported here so existing callers keep
 *  working. They belong in the package because, measured 2026-10-20, they need **no credential and
 *  no network**: the atom's id is a pure function of the agent's identity, and both on-chain CIDs
 *  for agent 8453:6649 are reproduced locally from the recipe alone.
 *
 *  What stays here is the one thing that does need a credential: the pin itself. And its role is
 *  narrower than it looked — pinning makes the document **readable** (Intuition's indexer resolves
 *  the Thing's `name`, which `RESOLVE_AGENT_QUERY` filters on). It is not needed to know the atom's
 *  id, to plan, or to create it. Pinning the same bytes anywhere yields the same CID, and
 *  Intuition's own pins are retrievable from third-party IPFS gateways, so the gated partner API
 *  (ADR `0016`) is one pinning service rather than a gate on the path.
 */
import type { AgentThing } from '../../packages/protocol/src/declare/agent-atom.js';

export {
  canonicalAgentThing,
  canonicalCaipThing,
  thingDocument,
  thingUri,
  type AgentThing,
} from '../../packages/protocol/src/declare/agent-atom.js';

export const PIN_ENDPOINT = 'https://pin.intuition.systems/v1/graphql';

type PinResponse = { data?: { pinThing?: { uri?: string } }; errors?: unknown };

/**
 * Pins a Thing and returns its `ipfs://…` URI.
 *
 * Content-addressed, so re-pinning is idempotent and creates no on-chain state. A caller should
 * compare the returned URI against `thingUri(thing)` — they must be equal, and a mismatch means the
 * API's serialisation has drifted from the recipe, which would mint a duplicate atom.
 */
export async function pinThing(
  thing: AgentThing,
  auth: { apiKey: string; headerName: string },
): Promise<{ status: number; uri?: string; body: string }> {
  const res = await fetch(PIN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [auth.headerName]: auth.apiKey },
    body: JSON.stringify({
      query: `mutation pinThing($name: String!, $description: String!, $image: String!, $url: String!) {
                pinThing(thing: { name: $name, description: $description, image: $image, url: $url }) { uri }
            }`,
      variables: thing,
    }),
  });
  const body = await res.text();
  if (!res.ok) return { status: res.status, body };
  const json = JSON.parse(body) as PinResponse;
  return { status: res.status, uri: json.data?.pinThing?.uri, body };
}
