import {afterEach, describe, expect, it, vi} from "vitest";

import {deployments} from "../../lib/deployments";
import {PIN_ENDPOINT, PinAuthError, pinThing} from "../intuition-pin";

const AUTH = {apiKey: "test-partner-key"};

function mockFetch(impl: typeof fetch) {
    vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("pinThing", () => {
    it("targets the gated pinning endpoint, not the read-only indexer", () => {
        expect(PIN_ENDPOINT).toBe("https://pin.intuition.systems/v1/graphql");
        // The indexer answers "no mutations exist" since 2026-09 (ADR 0016);
        // deriving the pin URL from it is the regression this guards against.
        expect(PIN_ENDPOINT).not.toBe(deployments.chain.graphqlUrl);
    });

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

        const uri = await pinThing(
            {
                name: "Solidity Audit",
                description: "Reputation domain for Solidity contract security",
                image: "https://example.com/image.png",
                url: "https://example.com",
            },
            AUTH,
        );

        expect(uri).toBe("ipfs://bafkrei-test");
        expect(captured?.url).toBe(PIN_ENDPOINT);
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

    it("sends the credential under the default 'apikey' header", async () => {
        let headers: Record<string, string> | undefined;
        mockFetch(async (_url, init) => {
            headers = init?.headers as Record<string, string>;
            return new Response(JSON.stringify({data: {pinThing: {uri: "ipfs://x"}}}), {
                status: 200,
                headers: {"Content-Type": "application/json"},
            });
        });

        await pinThing({name: "x", description: "y", image: "", url: ""}, AUTH);

        expect(headers?.["apikey"]).toBe("test-partner-key");
        expect(headers?.["Content-Type"]).toBe("application/json");
    });

    it("honours a headerName override so a scheme change needs no code change", async () => {
        let headers: Record<string, string> | undefined;
        mockFetch(async (_url, init) => {
            headers = init?.headers as Record<string, string>;
            return new Response(JSON.stringify({data: {pinThing: {uri: "ipfs://x"}}}), {
                status: 200,
                headers: {"Content-Type": "application/json"},
            });
        });

        await pinThing(
            {name: "x", description: "y", image: "", url: ""},
            {apiKey: "Bearer abc", headerName: "Authorization"},
        );

        expect(headers?.["Authorization"]).toBe("Bearer abc");
        expect(headers?.["apikey"]).toBeUndefined();
    });

    it("throws PinAuthError on 401, naming the env var and the verify command", async () => {
        mockFetch(
            async () =>
                new Response(JSON.stringify({message: "No API key found in request"}), {
                    status: 401,
                }),
        );

        const promise = pinThing({name: "x", description: "y", image: "", url: ""}, AUTH);

        await expect(promise).rejects.toBeInstanceOf(PinAuthError);
        await expect(promise).rejects.toMatchObject({name: "PinAuthError", status: 401});
        await expect(promise).rejects.toThrow(/INTUITION_PIN_API_KEY/);
        await expect(promise).rejects.toThrow(/bun run verify:pin/);
        await expect(promise).rejects.toThrow(/pin\.intuition\.systems/);
        // The upstream body is preserved — it is what distinguishes "no key
        // sent" from "key rejected".
        await expect(promise).rejects.toThrow(/No API key found in request/);
    });

    it("throws on a non-2xx HTTP response, surfacing status + body", async () => {
        mockFetch(async () => new Response("upstream down", {status: 502}));

        await expect(
            pinThing({name: "x", description: "y", image: "", url: ""}, AUTH),
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
            pinThing({name: "x", description: "y", image: "", url: ""}, AUTH),
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
            pinThing({name: "x", description: "y", image: "", url: ""}, AUTH),
        ).rejects.toThrow(/no uri/);
    });
});
