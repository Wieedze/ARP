/** The agent's activity, served to a browser on this machine.
 *
 *      bun run apps/mcp/src/session-log.ts --serve [--dir .arp] [--port 3003]
 *
 *  ```
 *  GET /events        Server-Sent Events: every event already on disk, then each new one
 *  GET /events.json   the same events, once, as a JSON array
 *  ```
 *
 *  **What it reads.** Three files in one directory, each written by a different program: the hook's
 *  `session.jsonl`, the skill fetcher's `receipts.jsonl` and the signer's `sent.jsonl`
 *  (`@arp-protocol/core`'s `activity.ts` has the table). Appended lines are picked up by polling
 *  the size, which is all a JSONL tail needs and behaves the same on every filesystem.
 *
 *  **What it is not.** It holds no key, signs nothing and writes nothing. It binds 127.0.0.1 only.
 *
 *  **Two checks, because CORS alone is not one.** CORS answers only for the origins it is given, so
 *  a page elsewhere cannot read a response cross-origin. That does not stop DNS rebinding: a page
 *  whose own name is re-pointed at 127.0.0.1 is same-origin with this server and needs no CORS. So
 *  the `Host` header must also name this machine — `127.0.0.1:<port>` or `localhost:<port>` —
 *  or the request gets 403, whatever its origin.
 *
 *  `node:http`, not `Bun.serve`, so it runs under the MCP's vitest suite and under Node.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { activityFromLine, type ActivityEvent, type ActivitySource } from '@arp-protocol/core';

export const DEFAULT_ACTIVITY_PORT = 3003;
/** Vite's dev and preview servers, which is where the web app runs during a demo. */
export const DEFAULT_ACTIVITY_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

const FILES: Record<ActivitySource, string> = {
  session: 'session.jsonl',
  receipt: 'receipts.jsonl',
  sent: 'sent.jsonl',
};

export type ActivityFeedOptions = {
  dir: string;
  port?: number;
  origins?: readonly string[];
  pollMs?: number;
};

/** Reads each file from where it was last left, and turns whole new lines into events. */
export class ActivityTail {
  private readonly offsets = new Map<ActivitySource, number>();
  private readonly mtimes = new Map<ActivitySource, number>();
  private readonly partial = new Map<ActivitySource, string>();

  constructor(private readonly dir: string) {}

  /** Everything appended since the last call. The first call returns everything. */
  read(): ActivityEvent[] {
    const out: ActivityEvent[] = [];
    // `FILES` is keyed by exactly the sources.
    for (const source of Object.keys(FILES) as ActivitySource[]) {
      const path = join(this.dir, FILES[source]);
      let size: number;
      let mtime: number;
      try {
        ({ size, mtimeMs: mtime } = statSync(path));
      } catch {
        // Not written yet: an agent that has signed nothing has no `sent.jsonl`.
        continue;
      }
      let offset = this.offsets.get(source) ?? 0;
      // Truncated, or rewritten to the same length: start again rather than read from inside a line.
      const rewritten = size === offset && mtime !== this.mtimes.get(source) && offset > 0;
      if (size < offset || rewritten) {
        offset = 0;
        this.partial.set(source, '');
      }
      this.mtimes.set(source, mtime);
      if (size === offset) continue;
      const buffer = Buffer.alloc(size - offset);
      const fd = openSync(path, 'r');
      try {
        readSync(fd, buffer, 0, buffer.length, offset);
      } finally {
        closeSync(fd);
      }
      this.offsets.set(source, size);
      const text = (this.partial.get(source) ?? '') + buffer.toString('utf8');
      const lines = text.split('\n');
      // The last piece has no newline yet: a writer is mid-line. Keep it for the next read.
      this.partial.set(source, lines.pop() ?? '');
      for (const line of lines) {
        const event = activityFromLine(source, line);
        if (event !== null) out.push(event);
      }
    }
    return out;
  }
}

function cors(request: IncomingMessage, origins: readonly string[]): Record<string, string> {
  const origin = request.headers.origin;
  return origin !== undefined && origins.includes(origin)
    ? { 'access-control-allow-origin': origin, vary: 'origin' }
    : {};
}

/** Starts the feed. Resolves once it listens; `close()` stops polling and every open stream. */
export async function serveActivity(
  options: ActivityFeedOptions,
): Promise<{ server: Server; port: number; close: () => Promise<void> }> {
  const origins = options.origins ?? DEFAULT_ACTIVITY_ORIGINS;
  const tail = new ActivityTail(options.dir);
  const history: ActivityEvent[] = [];
  const streams = new Set<ServerResponse>();

  const poll = (): void => {
    const fresh = tail.read();
    if (fresh.length === 0) return;
    history.push(...fresh);
    for (const stream of streams) {
      for (const event of fresh) stream.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  };
  poll();
  const timer = setInterval(poll, options.pollMs ?? 500);

  // Set once `listen` resolves; no request arrives before it.
  let boundPort = 0;
  const server = createServer((request, response) => {
    const headers = cors(request, origins);
    const host = request.headers.host ?? '';
    if (host !== `127.0.0.1:${boundPort}` && host !== `localhost:${boundPort}`) {
      response
        .writeHead(403, { 'content-type': 'text/plain' })
        .end('this feed answers to localhost only');
      return;
    }
    const path = (request.url ?? '/').split('?')[0];
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { ...headers, 'access-control-allow-methods': 'GET' }).end();
      return;
    }
    if (request.method !== 'GET') {
      response.writeHead(405, headers).end();
      return;
    }
    if (path === '/events.json') {
      poll();
      response.writeHead(200, { ...headers, 'content-type': 'application/json' });
      response.end(JSON.stringify(history));
      return;
    }
    if (path === '/events') {
      poll();
      response.writeHead(200, {
        ...headers,
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      for (const event of history) response.write(`data: ${JSON.stringify(event)}\n\n`);
      streams.add(response);
      request.on('close', () => streams.delete(response));
      return;
    }
    response
      .writeHead(404, { ...headers, 'content-type': 'text/plain' })
      .end('GET /events or /events.json');
  });

  await new Promise<void>((resolve) =>
    server.listen(options.port ?? DEFAULT_ACTIVITY_PORT, '127.0.0.1', resolve),
  );
  const address = server.address();
  const port =
    typeof address === 'object' && address !== null
      ? address.port
      : (options.port ?? DEFAULT_ACTIVITY_PORT);
  boundPort = port;

  return {
    server,
    port,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(timer);
        for (const stream of streams) stream.end();
        streams.clear();
        server.close(() => resolve());
      }),
  };
}
