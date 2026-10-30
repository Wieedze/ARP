import {
    partitionByCheckability,
    readDeclaredEndpoints,
    type DeclaredEndpoint,
} from "@arp-protocol/core";

/**
 * What an agent published as its own way in — read, never probed.
 *
 * **The distinction is the whole discipline of the package this calls into.** `readDeclaredEndpoints`
 * is a function of the document and nothing else: no network, no clock, no configuration. What an
 * agent *declared* and whether that endpoint *answers* are two different facts, and
 * `verify/probe.ts` is deliberately a separate module for it. Nothing here makes a request to an
 * agent's endpoint, so nothing here may say whether one works.
 *
 * ## Where the document is, and why a browser can usually read it
 *
 * The registry's `tokenURI` is the document's address, and measured on Base 8453 on 2026-10-28 it
 * takes three shapes:
 *
 * | shape | example | readable in a browser |
 * | --- | --- | --- |
 * | `data:application/json;base64,…` | agent 8453:2340, fourteen endpoints inline | **yes, with no request at all** |
 * | an IPFS gateway | agent 8453:1380, `ipfs.io/ipfs/bafkrei…` | yes — gateways answer `access-control-allow-origin: *`, confirmed |
 * | an arbitrary host | — | **maybe**: no CORS header, no read |
 *
 * So this is feasible client-side for most of the cohort, and the third row is why it reports a
 * **reason** rather than an empty list: "this agent published nothing" and "we could not fetch what
 * it published" are different answers and a reader must be able to tell them apart.
 */
export type EndpointRead =
    | {status: "none"; reason: "no-registration-file" | "no-endpoints-declared"}
    | {status: "unreadable"; url: string; detail: string}
    | {
          status: "read";
          url: string;
          probeable: DeclaredEndpoint[];
          notCheckable: DeclaredEndpoint[];
      };

/** An `ipfs://` URI through a public gateway. The registry stores both spellings. */
function gatewayUrl(uri: string): string {
    return uri.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${uri.slice("ipfs://".length)}` : uri;
}

/**
 * Fetch and parse one agent's registration document.
 *
 * @param registrationFile the `tokenURI`, or `null` when the agent registered without one.
 */
export async function readAgentEndpoints(
    registrationFile: string | null,
    fetchImpl: typeof fetch = fetch,
): Promise<EndpointRead> {
    if (registrationFile === null || registrationFile.trim() === "") {
        return {status: "none", reason: "no-registration-file"};
    }

    const url = registrationFile.trim();
    let document: unknown;

    if (url.startsWith("data:")) {
        // Inline, and the common shape for an agent that wanted no hosting dependency. No request
        // is made, so this branch cannot fail on CORS or on the network.
        try {
            const comma = url.indexOf(",");
            const payload = url.slice(comma + 1);
            const text = url.slice(0, comma).includes(";base64")
                ? atob(payload)
                : decodeURIComponent(payload);
            document = JSON.parse(text);
        } catch (caught) {
            return {
                status: "unreadable",
                url,
                detail: `the inline document did not parse: ${caught instanceof Error ? caught.message : String(caught)}`,
            };
        }
    } else {
        try {
            const response = await fetchImpl(gatewayUrl(url), {
                headers: {accept: "application/json"},
            });
            if (!response.ok) {
                return {status: "unreadable", url, detail: `the host answered ${response.status}`};
            }
            document = await response.json();
        } catch (caught) {
            // Almost always CORS, which a browser reports as an opaque network failure rather than
            // as a refusal — so the detail says what we can say and not more.
            return {
                status: "unreadable",
                url,
                detail: `could not be read from a browser: ${caught instanceof Error ? caught.message : String(caught)}`,
            };
        }
    }

    const endpoints = readDeclaredEndpoints(document);
    if (endpoints.length === 0) return {status: "none", reason: "no-endpoints-declared"};

    // Split rather than merged, because the package insists on it: a caller writing its own filter
    // is where the classification's discipline erodes. 22 of 68 parsed documents in the 2026-10-16
    // sample declared no endpoint at all, which is itself common and not a defect.
    const {probeable, notCheckable} = partitionByCheckability(endpoints);
    return {status: "read", url, probeable, notCheckable};
}
