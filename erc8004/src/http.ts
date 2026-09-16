/** The subset of `fetch` this package uses. Injectable so tests never touch a network. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const DEFAULT_TIMEOUT_MS = 10_000;

/** A network read that failed before producing a body. */
export class HttpError extends Error {
    readonly kind: "network" | "timeout";
    readonly timeoutMs: number;

    constructor(kind: "network" | "timeout", message: string, timeoutMs: number) {
        super(message);
        this.name = "HttpError";
        this.kind = kind;
        this.timeoutMs = timeoutMs;
    }
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
