import {describe, expect, it} from "vitest";

import {createErc8004Client} from "../src/client.js";
import {DEFAULT_TIMEOUT_MS, fetchWithTimeout, HttpError} from "../src/http.js";
import {marketCapableSources} from "../src/profile.js";
import {ERC8004_REGISTRY_SOURCE_ID} from "../src/sources/erc8004-registry/index.js";
import {
    INTUITION_MAINNET_GRAPHQL,
    INTUITION_TESTNET_GRAPHQL,
} from "../src/sources/intuition/index.js";

describe("createErc8004Client defaults", () => {
    it("composes Intuition first, then the raw registry", () => {
        const client = createErc8004Client();
        expect(client.sources.map((source) => source.id)).toEqual([
            "intuition",
            ERC8004_REGISTRY_SOURCE_ID,
        ]);
        expect(client.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
        expect(marketCapableSources(client)).toEqual(["intuition"]);
    });

    it("takes an explicit source list, timeout and fetch", () => {
        const fetchImpl = async () => new Response("{}");
        const client = createErc8004Client({sources: [], timeoutMs: 42, fetch: fetchImpl});
        expect(client.sources).toEqual([]);
        expect(client.timeoutMs).toBe(42);
        expect(client.fetch).toBe(fetchImpl);
    });

    it("publishes both graph endpoints so testnet is a configuration, not a fork", () => {
        expect(INTUITION_MAINNET_GRAPHQL).toBe("https://mainnet.intuition.sh/v1/graphql");
        expect(INTUITION_TESTNET_GRAPHQL).toBe("https://testnet.intuition.sh/v1/graphql");
    });
});

describe("fetchWithTimeout", () => {
    it("classifies an abort as a timeout", async () => {
        const hanging = (_input: string, init?: RequestInit): Promise<Response> =>
            new Promise((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
            });
        await expect(
            fetchWithTimeout(hanging, "https://example.test", {}, 10),
        ).rejects.toMatchObject({name: "HttpError", kind: "timeout", timeoutMs: 10});
    });

    it("classifies everything else as a network failure", async () => {
        const failing = async (): Promise<Response> => {
            throw new Error("ECONNRESET");
        };
        const error = await fetchWithTimeout(failing, "https://example.test", {}, 100).catch(
            (caught: unknown) => caught,
        );
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).kind).toBe("network");
    });

    it("passes a successful response through", async () => {
        const ok = async (): Promise<Response> => new Response("ok", {status: 200});
        const response = await fetchWithTimeout(ok, "https://example.test", {}, 100);
        expect(response.status).toBe(200);
    });
});
