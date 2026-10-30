/** The subset of `fetch` this package uses. Injectable so tests never touch a network. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const DEFAULT_TIMEOUT_MS = 10_000;

/** A network read that failed before producing a body. */
export class HttpError extends Error {
    readonly kind: "network" | "timeout";
    readonly timeoutMs: number;

    /** `cause` keeps the underlying failure so the chain stays walkable. */
    constructor(kind: "network" | "timeout", message: string, timeoutMs: number, cause?: unknown) {
        super(message, cause === undefined ? undefined : {cause});
        this.name = "HttpError";
        this.kind = kind;
        this.timeoutMs = timeoutMs;
    }
}

/**
 * Was this failure a deadline rather than a refusal?
 *
 * Walks the `cause` chain, because the transports in this package wrap an
 * `HttpError` in their own error type rather than letting a raw one escape. It
 * lives here, beside `HttpError`, so the source-neutral layers can ask the
 * question without importing anything source-specific.
 *
 * The distinction matters to a caller: a timeout is worth retrying or waiting
 * out, and an endpoint that answered with a refusal is not.
 */
export function isTimeoutError(error: unknown): boolean {
    let cursor: unknown = error;
    for (let depth = 0; depth < 8 && cursor !== null && cursor !== undefined; depth += 1) {
        if (cursor instanceof HttpError) return cursor.kind === "timeout";
        cursor = cursor instanceof Error ? cursor.cause : null;
    }
    return false;
}

/**
 * `fetch` with a deadline.
 *
 * A trust connector that hangs on one unresponsive provider is worse than one
 * that reports the provider as unreachable, so every outbound read is bounded.
 */
export async function fetchWithTimeout(
    fetchImpl: FetchLike,
    url: string,
    init: RequestInit,
    timeoutMs: number,
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetchImpl(url, {...init, signal: controller.signal});
    } catch (error) {
        if (controller.signal.aborted) {
            throw new HttpError("timeout", `timed out after ${timeoutMs}ms: ${url}`, timeoutMs);
        }
        throw new HttpError(
            "network",
            error instanceof Error ? error.message : String(error),
            timeoutMs,
            error,
        );
    } finally {
        clearTimeout(timer);
    }
}

/** The ambient `fetch`, or a loud failure if the runtime has none. */
export function defaultFetch(): FetchLike {
    if (typeof globalThis.fetch !== "function") {
        throw new TypeError(
            "no global fetch available — pass one via createErc8004Client({fetch})",
        );
    }
    return (input, init) => globalThis.fetch(input, init);
}
