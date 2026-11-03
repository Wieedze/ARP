import type {Server} from "node:http";
import {connect} from "node:net";
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

    it("binds loopback when no hostname is given", async () => {
        server = await serveFetch({port: PORT}, () => new Response("ok"));
        const address = server.address();
        expect(typeof address === "object" && address !== null ? address.address : null).toBe(
            "127.0.0.1",
        );
    });

    it("caps the body by default, and stops reading a body that never ends", async () => {
        let called = false;
        server = await serveFetch({port: PORT}, () => {
            called = true;
            return new Response("no");
        });
        // A client declaring 100 MiB and writing until the server stops it. Raw TCP, because a
        // fetch client may hide the 413 behind its own EPIPE.
        const declared = 100 * 1024 * 1024;
        const ceiling = 32 * 1024 * 1024;
        const {answer, sent} = await new Promise<{answer: string; sent: number}>((resolve) => {
            const socket = connect(PORT, "127.0.0.1");
            let answer = "";
            let sent = 0;
            let open = true;
            const finish = () => {
                open = false;
                resolve({answer, sent});
            };
            socket.on("data", (chunk) => {
                answer += chunk.toString();
            });
            socket.on("close", finish);
            socket.on("error", () => undefined);
            socket.on("connect", () => {
                socket.write(`POST / HTTP/1.1\r\nHost: x\r\nContent-Length: ${declared}\r\n\r\n`);
                const chunk = new Uint8Array(64 * 1024);
                const pump = () => {
                    while (open && sent < ceiling) {
                        sent += chunk.byteLength;
                        if (!socket.write(chunk)) {
                            socket.once("drain", pump);
                            return;
                        }
                    }
                    if (sent >= ceiling) socket.destroy();
                };
                pump();
            });
        });
        expect(answer).toMatch(/^HTTP\/1\.1 413/);
        expect(called).toBe(false);
        expect(sent).toBeLessThan(ceiling);
    });

    it("sets a request timeout on the server", async () => {
        server = await serveFetch({port: PORT, requestTimeoutMs: 5_000}, () => new Response("ok"));
        expect(server.requestTimeout).toBe(5_000);
        expect(server.headersTimeout).toBeLessThanOrEqual(5_000);
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
