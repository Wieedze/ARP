import type {HandshakeError, HandshakeResult, HandshakeVerifier} from "./handshake.js";

/**
 * The verifier's two steps over HTTP, as a fetch-style handler a hosted service mounts.
 *
 *     POST <base>/challenge   {agentRegistry, agentId, nodePublicKey, endpoint}  → HandshakeChallenge
 *     POST <base>/complete    {nonce, ownerSignature, nodeSignature}             → EndpointBinding
 *
 * Anything else is 404. It holds no key and reads nothing but the chain the verifier was given.
 * The node's traffic never comes here: this is the one request an operator makes, once, at install.
 */
export function handshakeFetchHandler(
    verifier: HandshakeVerifier,
    options: {basePath?: string} = {},
): (request: Request) => Promise<Response> {
    const base = (options.basePath ?? "/handshake").replace(/\/$/, "");
    return async (request) => {
        const path = new URL(request.url).pathname;
        const step =
            path === `${base}/challenge`
                ? "challenge"
                : path === `${base}/complete`
                  ? "complete"
                  : null;
        if (step === null) return json(404, {error: "not-found"});
        if (request.method !== "POST") return json(405, {error: "method-not-allowed"});
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return json(400, {error: "malformed", reason: "body is not JSON"});
        }
        const result: HandshakeResult<unknown> =
            step === "challenge" ? await verifier.challenge(body) : await verifier.complete(body);
        return result.ok
            ? json(200, result.value)
            : json(handshakeStatusOf(result.error), errorBody(result.error));
    };
}

/** The HTTP status for each refusal, so a client can branch without parsing prose. */
export function handshakeStatusOf(error: HandshakeError): number {
    switch (error.code) {
        case "malformed":
            return 400;
        case "bad-owner-signature":
        case "bad-node-signature":
            return 401;
        case "unknown-nonce":
            return 404;
        case "owner-changed":
            return 409;
        case "expired":
            return 410;
        case "busy":
        case "chain-unreadable":
            return 503;
    }
}

function errorBody(error: HandshakeError): Record<string, unknown> {
    const {code, ...rest} = error;
    return {error: code, ...rest};
}

function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {"content-type": "application/json"},
    });
}
