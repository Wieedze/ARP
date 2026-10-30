import type {Server} from "node:http";
import {Readable} from "node:stream";

import {afterEach, describe, expect, it} from "vitest";

import {linesOf, serveFetch} from "../src/node/serve.js";

const PORT = 3197;
let server: Server | null = null;
afterEach(async () => {
    await new Promise<void>((resolve) =>
        server === null ? resolve() : server.close(() => resolve()),
    );
    server = null;
});

describe("serveFetch", () => {
    it("hands the handler a Request and writes back its Response, status and headers included", async () => {
        server = await serveFetch({port: PORT, hostname: "127.0.0.1"}, async (request, ip) =>
            Response.json(
                {
                    method: request.method,
                    path: new URL(request.url).pathname,
                    body: await request.text(),
                    ip,
                },
                {status: 201, headers: {"x-arp": "1"}},
            ),
        );
        const response = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
            method: "POST",
            body: "hello",
        });
        expect(response.status).toBe(201);
        expect(response.headers.get("x-arp")).toBe("1");
        const body = (await response.json()) as Record<string, string>;
        expect(body).toMatchObject({method: "POST", path: "/mcp", body: "hello"});
        expect(body.ip).toMatch(/127\.0\.0\.1/);
    });

    it("refuses a body over the limit with 413, without calling the handler", async () => {
        let called = false;
        server = await serveFetch({port: PORT, hostname: "127.0.0.1", maxBodyBytes: 8}, () => {
            called = true;
            return new Response("no");
        });
        const response = await fetch(`http://127.0.0.1:${PORT}/`, {
            method: "POST",
            body: "123456789",
        });
        expect(response.status).toBe(413);
        expect(called).toBe(false);
    });

    it("answers 500 when the handler throws, and keeps serving", async () => {
        server = await serveFetch({port: PORT, hostname: "127.0.0.1"}, (request) => {
            if (new URL(request.url).pathname === "/boom") throw new Error("boom");
            return new Response("ok");
        });
        expect((await fetch(`http://127.0.0.1:${PORT}/boom`)).status).toBe(500);
        expect(await (await fetch(`http://127.0.0.1:${PORT}/`)).text()).toBe("ok");
    });
});

describe("linesOf", () => {
    it("splits on newlines across chunk boundaries, drops blank lines, keeps a last unterminated line", async () => {
        const chunks = [
            Buffer.from('{"a":'),
            Buffer.from('1}\n\n{"b"'),
            Buffer.from(':2}\n{"c":3}'),
        ];
        const lines: string[] = [];
        for await (const line of linesOf(Readable.from(chunks))) lines.push(line);
        expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
    });
});
