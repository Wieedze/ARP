/**
 * Verify the Intuition partner pinning API key, and confirm that the canonical
 * agent-atom recipe is reproducible.
 *
 * Context: `pinThing` was removed from the indexer GraphQL endpoints
 * (`testnet.intuition.sh`, `mainnet.intuition.sh` — both answer
 * "no mutations exist") and now lives behind the gated pinning API. This script
 * is the one-shot check that the key in `.env` actually works before any write
 * path is rewired. See docs/08 §8 and ADR 0016.
 *
 * What it does, in order:
 *   1. Confirms the key is present (prints length + fingerprint, never the key).
 *   2. Probes the pinning endpoint unauthenticated — expects 401.
 *   3. Probes it with the key — expects 200.
 *   4. Determinism check: re-pins the exact canonical Thing for an ERC-8004
 *      agent that already exists on Intuition mainnet, and compares the URI it
 *      gets back to the atom's on-chain `data` field.
 *
 * Step 4 creates nothing new. Pinning is content-addressed: identical fields
 * produce an identical CID, so re-pinning existing content is a read in
 * practice. A MATCH proves ARP can derive canonical agent atoms byte-for-byte —
 * the preflight guarantee docs/07 requires before minting anything.
 *
 * Run from repo root (Bun auto-loads .env):
 *   bun run scripts/verify-pin-key.ts
 *
 * Required env (in .env at repo root):
 *   INTUITION_PIN_API_KEY          the partner pinning key
 *   INTUITION_PIN_API_KEY_HEADER   optional; defaults to "apikey"
 */

const PIN_ENDPOINT = 'https://pin.intuition.systems/v1/graphql';
const INDEXER_MAINNET = 'https://mainnet.intuition.sh/v1/graphql';

/**
 * A known-good fixture: the canonical Intuition atom for ERC-8004 agent
 * 8453:6649, minted by Intuition's own ingestion. Its `data` field is the
 * ground truth the recipe must reproduce.
 */
const FIXTURE = {
  chainId: 8453,
  tokenId: '6649',
  atomTermId: '0x0ea137804fd2180aca6c35474e7db6e3c2fb0f7990dd798452ed5b412610765e',
} as const;

type PinResponse = { data?: { pinThing?: { uri?: string } }; errors?: unknown };
type AtomResponse = { data?: { atom?: { term_id: string; label: string; data: string } | null } };

function fingerprint(key: string): string {
  return `len=${key.length} fp=${key.slice(0, 3)}…${key.slice(-2)}`;
}

/**
 * Reproduce the canonical agent-atom recipe from docs/07 Step A verbatim. The
 * fallbacks are part of the frozen recipe — a single differing character yields
 * a different CID and therefore a duplicate, fragmented agent atom.
 */
function canonicalAgentThing(
  chainId: number,
  tokenId: string,
  registration?: { name?: string; description?: string; image?: string; webEndpoint?: string },
) {
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

async function pinThing(
  thing: { name: string; description: string; image: string; url: string },
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

async function readAtomData(termId: string): Promise<{ label: string; data: string } | null> {
  const res = await fetch(INDEXER_MAINNET, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query Atom($id: String!) { atom(term_id: $id) { term_id label data } }`,
      variables: { id: termId },
    }),
  });
  const json = (await res.json()) as AtomResponse;
  const atom = json.data?.atom;
  return atom ? { label: atom.label, data: atom.data } : null;
}

async function main(): Promise<void> {
  const apiKey = process.env.INTUITION_PIN_API_KEY;
  const headerName = process.env.INTUITION_PIN_API_KEY_HEADER ?? 'apikey';

  if (!apiKey) {
    console.error('INTUITION_PIN_API_KEY is not set.');
    console.error(
      'Add it to .env at the repo root (never with a VITE_ prefix — that ships it to every visitor).',
    );
    process.exit(1);
  }

  console.log('[1/4] Key present:', fingerprint(apiKey), `header=${headerName}`);

  console.log('\n[2/4] Probing pinning endpoint WITHOUT the key (expect 401)…');
  const anon = await fetch(PIN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ __typename }' }),
  });
  console.log(
    `  http=${anon.status} ${anon.status === 401 ? 'OK — endpoint is gated as expected' : 'UNEXPECTED'}`,
  );

  console.log('\n[3/4] Probing WITH the key (expect 200)…');
  const authed = await fetch(PIN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [headerName]: apiKey },
    body: JSON.stringify({ query: '{ __typename }' }),
  });
  if (authed.status !== 200) {
    console.error(
      `  http=${authed.status} — key rejected. Body: ${(await authed.text()).slice(0, 300)}`,
    );
    process.exit(1);
  }
  console.log('  http=200 OK — key accepted');

  console.log(`\n[4/4] Determinism check against agent ${FIXTURE.chainId}:${FIXTURE.tokenId}…`);
  const thing = canonicalAgentThing(FIXTURE.chainId, FIXTURE.tokenId);
  console.log('  planned thing:', JSON.stringify(thing));

  const pinned = await pinThing(thing, { apiKey, headerName });
  if (!pinned.uri) {
    console.error(`  pin failed (http=${pinned.status}): ${pinned.body.slice(0, 300)}`);
    process.exit(1);
  }

  const onChain = await readAtomData(FIXTURE.atomTermId);
  if (!onChain) {
    console.error('  could not read the fixture atom from the mainnet indexer');
    process.exit(1);
  }

  console.log(`  returned: ${pinned.uri}`);
  console.log(`  on chain: ${onChain.data}   (label: ${onChain.label})`);

  if (pinned.uri === onChain.data) {
    console.log('\nMATCH — the canonical agent-atom recipe is reproducible.');
    console.log("ARP can derive any agent's canonical atom locally and preflight before minting.");
  } else {
    console.log("\nMISMATCH — the recipe diverges from Intuition's ingestion.");
    console.log(
      "Do NOT mint agent atoms until this is resolved; a divergent CID fragments the agent's staking surface.",
    );
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
