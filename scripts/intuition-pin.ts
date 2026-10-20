/** The canonical agent-atom recipe, and the pinning call it needs. Data and transport, no script.
 *
 *  Its own module so `verify-pin-key.ts` and `agent-identity-atom.ts` share one copy of the recipe:
 *  a single differing character yields a different CID and therefore a **duplicate, fragmented**
 *  agent atom, and Intuition has no deletion. `verify-pin-key.ts` proves the recipe reproduces an
 *  atom Intuition's own ingestion minted, so this file is the thing that proof is about.
 *
 *  **Why this is not in `@arp-protocol/core`**: pinning needs a partner credential, and the
 *  package's third-party promise is "a funded wallet and an ERC-8004 identity, **no API key**"
 *  (`packages/protocol/README.md`). The same split as planning versus signing: the pure part could
 *  live there, the credentialled call cannot.
 */
export const PIN_ENDPOINT = 'https://pin.intuition.systems/v1/graphql';

export type AgentThing = { name: string; description: string; image: string; url: string };

type PinResponse = { data?: { pinThing?: { uri?: string } }; errors?: unknown };

/**
 * Reproduce the canonical agent-atom recipe from `docs/07` Step A verbatim. The fallbacks are part
 * of the frozen recipe, not defaults to improve.
 */
export function canonicalAgentThing(
  chainId: number,
  tokenId: string,
  registration?: { name?: string; description?: string; image?: string; webEndpoint?: string },
): AgentThing {
  const normalize = (value?: string | null): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };
  const agentKey = `${chainId}:${tokenId}`;
  return {
    name: normalize(registration?.name) ?? `Agent ${agentKey}`,
    description: normalize(registration?.description) ?? `ERC-8004 agent ${agentKey}`,
    image: normalize(registration?.image) ?? '',
    url: normalize(registration?.webEndpoint) ?? `https://8004scan.io/agents/${chainId}/${tokenId}`,
  };
}

/** Pins a Thing and returns its `ipfs://…` URI. Content-addressed, so re-pinning is idempotent. */
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

/**
 * The CAIP-19 external-identifier Thing — the **object** of the `same as` edge.
 *
 * Read off mainnet rather than guessed (2026-10-20): agent 8453:6649's `same as` object carries
 * exactly these fields, and the description is a **fixed sentence**, not a template. The shape is
 * the one `RESOLVE_AGENT_QUERY` filters on — `object.value.thing.name == <caip19>` — so a differing
 * character makes the agent unresolvable rather than merely untidy.
 */
export function canonicalCaipThing(caip19: string): AgentThing {
  return {
    name: caip19,
    description:
      'CAIP-style external identifier atom for linking an Intuition atom to an ERC-8004 registry identity.',
    image: '',
    url: '',
  };
}
