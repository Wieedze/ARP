import {DEFAULT_TIMEOUT_MS, fetchWithTimeout, HttpError, type FetchLike} from "../../http.js";
import {isRecord, readArray, readString} from "../../json.js";

/** A GraphQL read that did not produce a usable `data` object. */
export class GraphqlError extends Error {
    readonly url: string;
    readonly httpStatus: number | null;

    /**
     * `cause` carries the `HttpError` this wraps, when there was one, so
     * `isTimeoutError` can tell a deadline from a refusal without this module
     * having to classify it — and without a caller matching on message text.
     */
    constructor(message: string, url: string, httpStatus: number | null, cause?: unknown) {
        super(message, cause === undefined ? undefined : {cause});
        this.name = "GraphqlError";
        this.url = url;
        this.httpStatus = httpStatus;
    }
}

/**
 * `timeoutMs` overrides the transport's own budget for one request.
 *
 * Reads on this endpoint are not equally expensive: resolving one agent is a
 * point lookup, while ordering the whole cohort by an aggregate is a sort over
 * every row. One deadline for both either cuts off a read that was going to
 * succeed or lets a hung point lookup sit for the cohort's budget.
 */
export type GraphqlRequestOptions = {timeoutMs?: number};

export type GraphqlTransport = {
    request(
        query: string,
        variables: Record<string, unknown>,
        options?: GraphqlRequestOptions,
    ): Promise<Record<string, unknown>>;
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
        async request(query, variables, options) {
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
                    options?.timeoutMs ?? timeoutMs,
                );
            } catch (error) {
                const message = error instanceof HttpError ? error.message : String(error);
                throw new GraphqlError(message, config.url, null, error);
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
