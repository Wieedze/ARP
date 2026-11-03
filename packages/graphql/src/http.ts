/** The subset of `fetch` this package uses. Injectable so tests never touch a network. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * The most body a read keeps before it gives up. Eight MiB is far above the largest response this
 * package's queries return (a 250-row cohort page) and far below what a hostile endpoint would need
 * to exhaust a process.
 */
export const DEFAULT_MAX_BODY_BYTES = 8 * 1024 * 1024;

/**
 * A network read that failed: before producing a body, while reading it, or because the body
 * outgrew its cap (`too-large`).
 */
export class HttpError extends Error {
    readonly kind: "network" | "timeout" | "too-large";
    readonly timeoutMs: number;

    /** `cause` keeps the underlying failure so the chain stays walkable. */
    constructor(
        kind: "network" | "timeout" | "too-large",
        message: string,
        timeoutMs: number,
        cause?: unknown,
    ) {
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

export type ReadBodyOptions = {
    /** Bytes kept before the read is abandoned with `HttpError("too-large")`. */
    maxBytes?: number;
    /** Aborting it abandons the read with `HttpError("timeout")`, even when the stream ignores it. */
    signal?: AbortSignal;
    /** Reported on the error, so a caller can say which deadline fired. */
    timeoutMs?: number;
};

/**
 * Read a response body as text, bounded in size and in time.
 *
 * `fetch` resolves when the headers arrive; a server that then trickles the body, or sends an
 * endless one, would hold `response.text()` forever and fill memory doing it. This reads chunk by
 * chunk, stops at `maxBytes`, and races every chunk against `signal` — a stream that does not
 * honour the abort is still abandoned on time.
 */
export async function readBodyText(
    response: Response,
    options: ReadBodyOptions = {},
): Promise<string> {
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BODY_BYTES;
    const timeoutMs = options.timeoutMs ?? 0;
    const body = response.body;
    if (body === null) return "";

    const reader = body.getReader();
    const signal = options.signal;
    let onAbort: (() => void) | null = null;
    const aborted =
        signal === undefined
            ? null
            : new Promise<never>((_, reject) => {
                  const fire = () =>
                      reject(
                          new HttpError(
                              "timeout",
                              `timed out after ${timeoutMs}ms reading the body`,
                              timeoutMs,
                          ),
                      );
                  onAbort = fire;
                  if (signal.aborted) fire();
                  else signal.addEventListener("abort", fire, {once: true});
              });
    // A rejection nobody awaits after the read finished is not an error worth reporting.
    aborted?.catch(() => undefined);

    const decoder = new TextDecoder();
    let total = 0;
    let text = "";
    try {
        for (;;) {
            const chunk = await (aborted === null
                ? reader.read()
                : Promise.race([reader.read(), aborted]));
            if (chunk.done) break;
            total += chunk.value.byteLength;
            if (total > maxBytes) {
                throw new HttpError("too-large", `body exceeds ${maxBytes} bytes`, timeoutMs);
            }
            text += decoder.decode(chunk.value, {stream: true});
        }
        return text + decoder.decode();
    } catch (error) {
        reader.cancel().catch(() => undefined);
        if (error instanceof HttpError) throw error;
        throw new HttpError(
            "network",
            error instanceof Error ? error.message : String(error),
            timeoutMs,
            error,
        );
    } finally {
        if (signal !== undefined && onAbort !== null) signal.removeEventListener("abort", onAbort);
    }
}

/**
 * `fetch` and the body read under **one** deadline, the body capped at `maxBytes`.
 *
 * `fetchWithTimeout` clears its timer when the headers arrive, which bounds nothing that happens
 * after; this keeps it running until the last byte.
 */
export async function fetchTextWithTimeout(
    fetchImpl: FetchLike,
    url: string,
    init: RequestInit,
    options: {timeoutMs: number; maxBytes?: number},
): Promise<{response: Response; text: string}> {
    const {timeoutMs} = options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        let response: Response;
        try {
            response = await fetchImpl(url, {...init, signal: controller.signal});
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
        }
        const text = await readBodyText(response, {
            signal: controller.signal,
            timeoutMs,
            ...(options.maxBytes === undefined ? {} : {maxBytes: options.maxBytes}),
        });
        return {response, text};
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
