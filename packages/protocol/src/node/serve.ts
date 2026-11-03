/**
 * A fetch-style handler served by `node:http`, so the MCP server and the agent node run under Node
 * as well as Bun.
 *
 * Both used `Bun.serve`, which exists only under Bun, and `npx` runs Node (ADR `0089`). Bun
 * implements `node:http` too, so this one path serves both runtimes and nothing branches on which
 * one is running.
 *
 * Kept out of the package's main entry, behind `@arp-protocol/core/node`: the web app imports the
 * main entry, and a browser bundle has no `node:http`. Shared here rather than in one app because
 * ADR `0082` puts what the MCP server and the node share in this package, never one app importing
 * the other.
 */
import {createServer, type IncomingMessage, type Server, type ServerResponse} from "node:http";
import {PassThrough} from "node:stream";

export type FetchHandler = (request: Request, ip: string) => Response | Promise<Response>;

/** A body cap that holds a JSON-RPC call or a sponsor request with room to spare. */
export const DEFAULT_SERVE_MAX_BODY_BYTES = 1024 * 1024;
/** How long a client gets to send its whole request, headers and body. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/** How long a refused body's socket may stay open for the 413 to flush before it is dropped. */
const TOO_LARGE_GRACE_MS = 1_000;

export type ServeOptions = {
    port: number;
    /**
     * The interface to bind. Defaults to `127.0.0.1`: every caller in this repo binds loopback (the
     * node because a tunnel is its way in, task 39), and listening on every interface is a choice
     * a caller states, never a default it inherits.
     */
    hostname?: string;
    /** A body over this many bytes is refused with 413; reading stops at the cap. */
    maxBodyBytes?: number;
    /** A request not fully received within this many ms is dropped. */
    requestTimeoutMs?: number;
};

class BodyTooLarge extends Error {}

/**
 * The request body, read up to `limit` bytes.
 *
 * Past the limit it **stops reading**: the stream is paused and left, and the 413 goes out with
 * `connection: close`, so the server closes the socket instead of waiting for the rest. The first
 * version drained the whole body to keep Bun from turning the 413 into a bare 200 — which let a
 * client stream for as long as it liked; a paused stream does not destroy the request, so the
 * 413 still arrives.
 */
function bodyOf(message: IncomingMessage, limit: number): Promise<Uint8Array<ArrayBuffer>> {
    return new Promise((resolve, reject) => {
        const chunks: Uint8Array[] = [];
        let size = 0;
        const done = () => {
            message.off("data", onData);
            message.off("end", onEnd);
            message.off("error", onError);
        };
        const onData = (chunk: unknown) => {
            // Node yields Buffers (Uint8Arrays); Bun's `node:http` has been seen to yield strings.
            const bytes =
                typeof chunk === "string"
                    ? new TextEncoder().encode(chunk)
                    : chunk instanceof Uint8Array
                      ? chunk
                      : new Uint8Array(0);
            size += bytes.byteLength;
            if (size > limit) {
                done();
                message.pause();
                // The socket closes under a paused request; its error has nowhere else to go.
                message.on("error", () => undefined);
                reject(new BodyTooLarge());
                return;
            }
            chunks.push(bytes);
        };
        const onEnd = () => {
            done();
            const out = new Uint8Array(size);
            let at = 0;
            for (const chunk of chunks) {
                out.set(chunk, at);
                at += chunk.byteLength;
            }
            resolve(out);
        };
        const onError = (error: unknown) => {
            done();
            reject(error);
        };
        message.on("data", onData);
        message.on("end", onEnd);
        message.on("error", onError);
    });
}

function requestOf(
    message: IncomingMessage,
    body: Uint8Array<ArrayBuffer> | null,
    base: string,
): Request {
    const headers = new Headers();
    for (const [name, value] of Object.entries(message.headers)) {
        if (value === undefined) continue;
        for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
    }
    return new Request(new URL(message.url ?? "/", base), {
        method: message.method ?? "GET",
        headers,
        body: body === null || body.byteLength === 0 ? null : body,
    });
}

async function send(response: Response, out: ServerResponse): Promise<void> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, name) => {
        headers[name] = value;
    });
    out.writeHead(response.status, headers);
    out.end(response.body === null ? undefined : new Uint8Array(await response.arrayBuffer()));
}

/** Start serving. Resolves once the port is bound, with the server so a caller can close it. */
export function serveFetch(options: ServeOptions, handle: FetchHandler): Promise<Server> {
    const hostname = options.hostname ?? "127.0.0.1";
    const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_SERVE_MAX_BODY_BYTES;
    const base = `http://${hostname}:${options.port}`;
    const server = createServer((message, out) => {
        void (async () => {
            try {
                const hasBody = message.method !== "GET" && message.method !== "HEAD";
                const body = hasBody ? await bodyOf(message, maxBodyBytes) : null;
                const ip = message.socket.remoteAddress ?? "unknown";
                await send(await handle(requestOf(message, body, base), ip), out);
            } catch (error) {
                if (out.headersSent) {
                    out.destroy();
                    return;
                }
                const tooLarge = error instanceof BodyTooLarge;
                out.writeHead(tooLarge ? 413 : 500, {
                    "content-type": "application/json",
                    ...(tooLarge ? {connection: "close"} : {}),
                });
                // Once the 413 is out, the rest of the body is nobody's business: drop the socket
                // rather than leave a paused request holding it open. `finish` does not always fire
                // while the client is still writing into a paused socket, so a timer drops it too.
                if (tooLarge) {
                    const drop = () => message.socket.destroy();
                    out.once("finish", drop);
                    setTimeout(drop, TOO_LARGE_GRACE_MS).unref();
                }
                out.end(JSON.stringify({error: tooLarge ? "body too large" : "internal error"}));
            }
        })();
    });
    // `requestTimeout` bounds receiving the request, headers and body; `headersTimeout` must not
    // exceed it. Node enforces both; a runtime that ignores them is no worse than before.
    const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    server.requestTimeout = requestTimeoutMs;
    server.headersTimeout = Math.min(server.headersTimeout, requestTimeoutMs);
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(options.port, hostname, () => resolve(server));
    });
}

/**
 * A buffered copy of `stream`, listening from the moment it is called.
 *
 * Claude Desktop's built-in Node hands a server a stdin that emits each message once and keeps
 * nothing, so a listener attached after an `await` misses the client's `initialize` and the client
 * waits two minutes before giving up (found live on Windows, 2026-11-02). Taking the stream at load
 * time and reading the copy later is the fix.
 */
export function bufferedCopy(stream: NodeJS.ReadableStream): PassThrough {
    return stream.pipe(new PassThrough());
}

/**
 * Newline-delimited lines from a stream, for the stdio transport. Replaces `Bun.stdin.stream()`.
 */
export async function* linesOf(stream: AsyncIterable<unknown>): AsyncGenerator<string> {
    const decoder = new TextDecoder();
    let buffered = "";
    for await (const chunk of stream) {
        buffered +=
            typeof chunk === "string" ? chunk : decoder.decode(chunk as Uint8Array, {stream: true}); // stdin yields Buffers
        let newline = buffered.indexOf("\n");
        while (newline !== -1) {
            const line = buffered.slice(0, newline).trim();
            buffered = buffered.slice(newline + 1);
            newline = buffered.indexOf("\n");
            if (line.length > 0) yield line;
        }
    }
    const rest = buffered.trim();
    if (rest.length > 0) yield rest;
}
