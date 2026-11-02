/** Intuition's pinning API, for the two identity Things `POST /identity` creates atoms from.
 *
 *  The key is a partner credential (ADR `0016`), read from `INTUITION_PIN_API_KEY` by `main.ts`. It
 *  pins a document and moves no value. The scripts' copy is `scripts/helpers/intuition-pin.ts`,
 *  which `apps/` may not import.
 */
import type { AgentThing } from '@arp-protocol/core';

const PIN_ENDPOINT = 'https://pin.intuition.systems/v1/graphql';

type PinResponse = { data?: { pinThing?: { uri?: string } } };

export function intuitionPinner(auth: {
  apiKey: string;
  headerName: string;
}): (thing: AgentThing) => Promise<string> {
  return async (thing) => {
    const res = await fetch(PIN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [auth.headerName]: auth.apiKey },
      body: JSON.stringify({
        query: `mutation pinThing($name: String!, $description: String!, $image: String!, $url: String!) {
                pinThing(thing: { name: $name, description: $description, image: $image, url: $url }) { uri }
            }`,
        variables: thing,
      }),
      // `/identity` waits on this before it spends; a hung pin must fail rather than wait forever.
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`pinning failed: http ${res.status}`);
    const uri = ((await res.json()) as PinResponse).data?.pinThing?.uri; // The API's own shape.
    if (uri === undefined) throw new Error('pinning returned no uri');
    return uri;
  };
}
