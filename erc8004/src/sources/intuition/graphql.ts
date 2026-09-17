import {DEFAULT_TIMEOUT_MS, fetchWithTimeout, HttpError, type FetchLike} from "../../http.js";
import {isRecord, readArray, readString} from "../../json.js";

/** A GraphQL read that did not produce a usable `data` object. */
export class GraphqlError extends Error {
    readonly url: string;
    readonly httpStatus: number | null;

    constructor(message: string, url: string, httpStatus: number | null) {
        super(message);
        this.name = "GraphqlError";
        this.url = url;
        this.httpStatus = httpStatus;
    }
}

export type GraphqlTransport = {
    request(query: string, variables: Record<string, unknown>): Promise<Record<string, unknown>>;
};

/**
 * Minimal GraphQL POST transport.
 *
 * Reads on the Intuition endpoints are unauthenticated, so there is no key
 * handling here and none should be added: this package is read-only and has no
 * business holding a credential.
 */
export function createGraphqlTransport(config: {
    url: string;
    fetch: FetchLike;
    timeoutMs?: number;
}): GraphqlTransport {
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    return {
        async request(query, variables) {
            let response: Response;
            try {
                response = await fetchWithTimeout(
                    config.fetch,
                    config.url,
                    {
                        method: "POST",
                        headers: {
                            "content-type": "application/json",
                            accept: "application/json",
                        },
                        body: JSON.stringify({query, variables}),
                    },
                    timeoutMs,
                );
            } catch (error) {
                const message = error instanceof HttpError ? error.message : String(error);
                throw new GraphqlError(message, config.url, null);
            }

            if (!response.ok) {
                throw new GraphqlError(
                    `HTTP ${response.status} ${response.statusText}`,
                    config.url,
                    response.status,
                );
            }

            const body: unknown = await response.json().catch(() => null);
            if (!isRecord(body)) {
                throw new GraphqlError("response body is not a JSON object", config.url, 200);
            }

            const errors = readArray(body, "errors");
            if (errors.length > 0) {
                const messages = errors
                    .map((entry) => readString(entry, "message") ?? "unknown error")
                    .join("; ");
                throw new GraphqlError(messages, config.url, 200);
            }

            const data = body["data"];
            if (!isRecord(data)) {
                throw new GraphqlError("response carries no data object", config.url, 200);
            }
            return data;
        },
    };
}
