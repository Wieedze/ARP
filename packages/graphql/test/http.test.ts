import {describe, expect, it} from "vitest";

import {createGraphqlTransport, GraphqlError} from "../src/client.js";
import {fetchTextWithTimeout, HttpError, readBodyText, type FetchLike} from "../src/http.js";

/** A response whose headers arrive at once and whose body never ends. */
function tricklingResponse(): Response {
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(new TextEncoder().encode("{"));
            // Never closes, never errors, ignores the abort: the worst case.
        },
    });
    return new Response(stream, {status: 200});
}

/** A response streaming `chunks` chunks of `size` bytes. */
function bulkyResponse(chunks: number, size: number): Response {
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
            if (sent >= chunks) {
                controller.close();
                return;
            }
            sent += 1;
            controller.enqueue(new Uint8Array(size).fill(0x61));
        },
    });
    return new Response(stream, {status: 200});
}

describe("fetchTextWithTimeout", () => {
    it("keeps the deadline running through the body read", async () => {
        const fetchImpl: FetchLike = async () => tricklingResponse();
        const error = await fetchTextWithTimeout(
            fetchImpl,
            "https://x.test",
            {},
            {timeoutMs: 30},
        ).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).kind).toBe("timeout"); // narrowed by the line above
    });

    it("stops reading past the byte cap", async () => {
        let pulled = 0;
        const fetchImpl: FetchLike = async () => {
            const stream = new ReadableStream<Uint8Array>({
                pull(controller) {
                    pulled += 1;
                    controller.enqueue(new Uint8Array(1024));
                },
            });
            return new Response(stream, {status: 200});
        };
        const error = await fetchTextWithTimeout(
            fetchImpl,
            "https://x.test",
            {},
            {timeoutMs: 1_000, maxBytes: 4096},
        ).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).kind).toBe("too-large"); // narrowed by the line above
        expect(pulled).toBeLessThan(10);
    });

    it("returns the text of a body under the cap", async () => {
        const fetchImpl: FetchLike = async () => new Response("hello");
        const {text} = await fetchTextWithTimeout(
            fetchImpl,
            "https://x.test",
            {},
            {timeoutMs: 100},
        );
        expect(text).toBe("hello");
    });
});

describe("readBodyText", () => {
    it("accepts a body exactly at the cap", async () => {
        const text = await readBodyText(bulkyResponse(4, 256), {maxBytes: 1024});
        expect(text).toHaveLength(1024);
    });

    it("refuses one byte over", async () => {
        await expect(readBodyText(bulkyResponse(5, 205), {maxBytes: 1024})).rejects.toThrow(
            /exceeds 1024 bytes/,
        );
    });
});

describe("createGraphqlTransport", () => {
    it("times out a response whose body never finishes", async () => {
        const transport = createGraphqlTransport({
            url: "https://x.test/graphql",
            fetch: async () => tricklingResponse(),
            timeoutMs: 30,
        });
        await expect(transport.request("{x}", {})).rejects.toBeInstanceOf(GraphqlError);
    });

    it("refuses a response larger than its cap", async () => {
        const transport = createGraphqlTransport({
            url: "https://x.test/graphql",
            fetch: async () => bulkyResponse(10, 1024),
            maxBodyBytes: 2048,
        });
        await expect(transport.request("{x}", {})).rejects.toThrow(/exceeds 2048 bytes/);
    });
});
