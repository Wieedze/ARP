import {deployments} from "../lib/deployments";

const GRAPHQL_URL = deployments.chain.graphqlUrl;

/**
 * Pin a `Thing` to Intuition's IPFS via the `pinThing` GraphQL mutation.
 * Returns an `ipfs://bafkrei...` URI suitable as atom data (encoded with
 * `stringToHex` at the call site).
 *
 * All four fields are required by the GraphQL contract (Hasura request
 * transformation references them all); pass empty strings for unused ones.
 * See `.claude/skills/intuition/reference/schemas.md`.
 */
export async function pinThing(args: {
    name: string;
    description: string;
    image: string;
    url: string;
}): Promise<string> {
    const mutation = `
        mutation pinThing($name: String!, $description: String!, $image: String!, $url: String!) {
            pinThing(thing: { name: $name, description: $description, image: $image, url: $url }) {
                uri
            }
        }
    `;
    const res = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({query: mutation, variables: args}),
    });
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
