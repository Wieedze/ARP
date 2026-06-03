import {afterEach, describe, expect, it, vi} from "vitest";

import {deployments} from "../../lib/deployments";
import {pinThing} from "../intuition-pin";

const GRAPHQL_URL = deployments.chain.graphqlUrl;

function mockFetch(impl: typeof fetch) {
    vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("pinThing", () => {
    it("posts the GraphQL mutation with all four fields and returns the uri", async () => {
        let captured: {url: string; init: RequestInit} | undefined;
        mockFetch(async (url, init) => {
            captured = {url: String(url), init: init!};
            return new Response(
                JSON.stringify({
                    data: {pinThing: {uri: "ipfs://bafkrei-test"}},
                }),
                {status: 200, headers: {"Content-Type": "application/json"}},
            );
        });

        const uri = await pinThing({
            name: "Solidity Audit",
            description: "Reputation domain for Solidity contract security",
            image: "https://example.com/image.png",
            url: "https://example.com",
        });

        expect(uri).toBe("ipfs://bafkrei-test");
        expect(captured?.url).toBe(GRAPHQL_URL);
        expect(captured?.init.method).toBe("POST");

        const body = JSON.parse(String(captured?.init.body));
        expect(body.query).toContain("mutation pinThing");
        expect(body.variables).toEqual({
            name: "Solidity Audit",
            description: "Reputation domain for Solidity contract security",
            image: "https://example.com/image.png",
            url: "https://example.com",
        });
    });

    it("throws on a non-2xx HTTP response, surfacing status + body", async () => {
        mockFetch(async () => new Response("upstream down", {status: 502}));

        await expect(
            pinThing({name: "x", description: "y", image: "", url: ""}),
        ).rejects.toThrow(/HTTP 502.*upstream down/);
    });

    it("throws when GraphQL returns an errors field", async () => {
        mockFetch(
            async () =>
                new Response(
                    JSON.stringify({errors: [{message: "validation failed"}]}),
                    {status: 200, headers: {"Content-Type": "application/json"}},
                ),
        );

        await expect(
            pinThing({name: "x", description: "y", image: "", url: ""}),
        ).rejects.toThrow(/GraphQL.*validation failed/);
    });

    it("throws when the response is shape-correct but uri is missing", async () => {
        mockFetch(
            async () =>
                new Response(JSON.stringify({data: {pinThing: {}}}), {
                    status: 200,
                    headers: {"Content-Type": "application/json"},
                }),
        );

        await expect(
            pinThing({name: "x", description: "y", image: "", url: ""}),
        ).rejects.toThrow(/no uri/);
    });
});
