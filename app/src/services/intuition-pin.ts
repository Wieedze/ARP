/**
 * Intuition's pinning API — the only write endpoint ARP talks to that is not
 * the chain.
 *
 * Pinning is **gated and separate from the indexer**. As of 2026-09 the indexer
 * GraphQL endpoints (`testnet.intuition.sh`, `mainnet.intuition.sh`, i.e.
 * `deployments.chain.graphqlUrl`) answer `no mutations exist`; `pinThing` lives
 * behind `pin.intuition.systems` and returns 401 without a partner API key. The
 * endpoint is network-agnostic — one key serves testnet 13579 and mainnet 1155 —
 * so it is a module constant here rather than a per-chain deployment field.
 *
 * The credential is an **explicit parameter**. Nothing under `app/src/services/`
 * reads the ambient environment; that is a grepped invariant, not a habit. It
 * keeps this module pure and testable without an environment, and it makes a
 * browser caller a compile-time error instead of a leaked partner key: only Node
 * entry points can produce a `PinAuth` (see `scripts/pin-env.ts`).
 *
 * See ADR 0016 and `docs/07_INTUITION_ERC8004_PARTNER_GUIDE.md`.
 */

/** The gated pinning endpoint. Not `deployments.chain.graphqlUrl` — that is the read endpoint. */
export const PIN_ENDPOINT = "https://pin.intuition.systems/v1/graphql";

/** Intuition's documented header for the partner key. */
const DEFAULT_HEADER_NAME = "apikey";

/**
 * Partner credential for the pinning API.
 *
 * `headerName` exists only so a scheme change upstream (e.g. a move to
 * `Authorization: Bearer`) does not require a code change; it defaults to
 * `"apikey"`.
 */
export type PinAuth = {
    apiKey: string;
    headerName?: string;
};

/**
 * The pinning endpoint rejected the credential.
 *
 * Carries the remediation inline because the bare `HTTP 401` this replaces cost
 * real debugging time: the endpoint moved, and nothing in the old message said so.
 */
export class PinAuthError extends Error {
    readonly status: number;

    constructor(status: number, body: string) {
        super(
            `pinThing: ${PIN_ENDPOINT} rejected the partner credential (HTTP ${status}). ` +
                `Set INTUITION_PIN_API_KEY in .env at the repo root — never with a VITE_ ` +
                `prefix, which would ship it to every visitor — then confirm it with ` +
                `\`bun run verify:pin\`. Response: ${body}`,
        );
        this.name = "PinAuthError";
        this.status = status;
    }
}

/**
 * Pin a `Thing` to Intuition's IPFS via the `pinThing` GraphQL mutation.
 * Returns an `ipfs://bafkrei...` URI suitable as atom data (encoded with
 * `stringToHex` at the call site).
 *
 * Content-addressed and therefore deterministic: identical fields return an
 * identical URI, which is what makes every `ensure*` caller idempotent.
 *
 * All four fields are required by the GraphQL contract (Hasura request
 * transformation references them all); pass empty strings for unused ones.
 * See `.claude/skills/intuition/reference/schemas.md`.
 *
 * @param args  The Thing's four metadata fields.
 * @param auth  Partner credential. Required — see the module header.
 * @throws {PinAuthError} when the endpoint answers 401.
 */
export async function pinThing(
    args: {
        name: string;
        description: string;
        image: string;
        url: string;
    },
    auth: PinAuth,
): Promise<string> {
    const mutation = `
        mutation pinThing($name: String!, $description: String!, $image: String!, $url: String!) {
            pinThing(thing: { name: $name, description: $description, image: $image, url: $url }) {
                uri
            }
        }
    `;
    const res = await fetch(PIN_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            [auth.headerName ?? DEFAULT_HEADER_NAME]: auth.apiKey,
        },
        body: JSON.stringify({query: mutation, variables: args}),
    });
    if (res.status === 401) throw new PinAuthError(res.status, await res.text());
    if (!res.ok) throw new Error(`pinThing HTTP ${res.status}: ${await res.text()}`);
    // GraphQL response shape is fixed by the schema; runtime validation
    // would be theatre — the read below throws on missing fields anyway.
    const json = (await res.json()) as {
        data?: {pinThing: {uri: string}};
        errors?: unknown;
    };
    if (json.errors) throw new Error(`pinThing GraphQL: ${JSON.stringify(json.errors)}`);
    const uri = json.data?.pinThing.uri;
    if (!uri) throw new Error(`pinThing returned no uri: ${JSON.stringify(json)}`);
    return uri;
}
