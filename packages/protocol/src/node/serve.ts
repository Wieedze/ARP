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

export type FetchHandler = (request: Request, ip: string) => Response | Promise<Response>;

export type ServeOptions = {
    port: number;
    /** Omitted, every interface — which is what the node wants and the MCP server refuses. */
    hostname?: string;
    /** A body over this many bytes is refused with 413 before it is read whole. */
    maxBodyBytes?: number;
};

class BodyTooLarge extends Error {}

async function bodyOf(
    message: IncomingMessage,
    limit: number | undefined,
): Promise<Uint8Array<ArrayBuffer>> {
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of message) {
        // Node yields Buffers (Uint8Arrays); Bun's `node:http` has been seen to yield strings.
        const bytes =
            typeof chunk === "string" ? new TextEncoder().encode(chunk) : (chunk as Uint8Array);
        size += bytes.byteLength;
        // Past the limit, keep draining and stop storing. Leaving the loop early destroys the
        // request, and under Bun the 413 written afterwards then reaches the client as a bare 200.
        if (limit === undefined || size <= limit) chunks.push(bytes);
    }
    if (limit !== undefined && size > limit) throw new BodyTooLarge();
    const out = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) {
        out.set(chunk, at);
        at += chunk.byteLength;
    }
    return out;
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
    const base = `http://${options.hostname ?? "localhost"}:${options.port}`;
    const server = createServer((message, out) => {
        void (async () => {
            try {
                const hasBody = message.method !== "GET" && message.method !== "HEAD";
                const body = hasBody ? await bodyOf(message, options.maxBodyBytes) : null;
                const ip = message.socket.remoteAddress ?? "unknown";
                await send(await handle(requestOf(message, body, base), ip), out);
            } catch (error) {
                if (out.headersSent) {
                    out.destroy();
                    return;
                }
                const tooLarge = error instanceof BodyTooLarge;
                out.writeHead(tooLarge ? 413 : 500, {"content-type": "application/json"});
                out.end(JSON.stringify({error: tooLarge ? "body too large" : "internal error"}));
            }
        })();
    });
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(options.port, options.hostname, () => resolve(server));
    });
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
