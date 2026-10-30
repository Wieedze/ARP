import {
    createPublicClient,
    custom,
    encodeAbiParameters,
    verifyMessage,
    type Address,
    type PublicClient,
} from "viem";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";
import {describe, expect, it} from "vitest";

import {
    createHandshakeVerifier,
    type HandshakeChain,
    type HandshakeError,
} from "../src/handshake.js";
import {handshakeChain} from "../src/handshake-chain.js";
import {handshakeFetchHandler, handshakeStatusOf} from "../src/handshake-http.js";

const REGISTRY = "0xC165A2AD2E540A4069E02834009161E2b4490d5A";
const owner = privateKeyToAccount(generatePrivateKey());
const node = privateKeyToAccount(generatePrivateKey());
const request = {
    agentRegistry: `eip155:13579:${REGISTRY}`,
    agentId: "7",
    nodePublicKey: node.publicKey,
    endpoint: "https://quiet-lake.trycloudflare.com",
};

const chain: HandshakeChain = {
    ownerOf: async () => owner.address,
    verifyMessage: (args) => verifyMessage(args),
};

function handler() {
    return handshakeFetchHandler(
        createHandshakeVerifier({
            chain,
            domain: "arp.example",
            uri: "https://arp.example/handshake",
        }),
    );
}

const post = (path: string, body: unknown) =>
    new Request(`https://arp.example${path}`, {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body),
    });

describe("handshakeFetchHandler", () => {
    it("runs both steps over HTTP", async () => {
        const handle = handler();
        const challenge = (await (await handle(post("/handshake/challenge", request))).json()) as {
            nonce: string;
            message: string;
        };
        const done = await handle(
            post("/handshake/complete", {
                nonce: challenge.nonce,
                ownerSignature: await owner.signMessage({message: challenge.message}),
                nodeSignature: await node.signMessage({message: challenge.message}),
            }),
        );
        expect(done.status).toBe(200);
        expect(await done.json()).toMatchObject({owner: owner.address, nodeAddress: node.address});
    });

    it("answers 404 off its paths, 405 on a GET and 400 on a body that is not JSON", async () => {
        const handle = handler();
        expect((await handle(post("/elsewhere", {}))).status).toBe(404);
        expect((await handle(new Request("https://arp.example/handshake/challenge"))).status).toBe(
            405,
        );
        const bad = await handle(post("/handshake/challenge", "{"));
        expect(bad.status).toBe(400);
        expect(await bad.json()).toEqual({error: "malformed", reason: "body is not JSON"});
    });

    it("carries the refusal's code and fields in the body", async () => {
        const response = await handler()(
            post("/handshake/complete", {nonce: "x", ownerSignature: "0x", nodeSignature: "0x"}),
        );
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({error: "unknown-nonce"});
    });

    it("mounts under another base path", async () => {
        const handle = handshakeFetchHandler(
            createHandshakeVerifier({chain, domain: "arp.example", uri: "https://arp.example/v1"}),
            {basePath: "/v1/"},
        );
        expect((await handle(post("/v1/challenge", request))).status).toBe(200);
    });
});

describe("handshakeStatusOf", () => {
    it.each<[HandshakeError, number]>([
        [{code: "malformed", reason: ""}, 400],
        [{code: "bad-owner-signature"}, 401],
        [{code: "bad-node-signature", recovered: null}, 401],
        [{code: "unknown-nonce"}, 404],
        [{code: "owner-changed", signedFor: owner.address, current: node.address}, 409],
        [{code: "expired"}, 410],
        [{code: "busy"}, 503],
        [{code: "chain-unreadable", reason: ""}, 503],
    ])("%j is %i", (error, status) => {
        expect(handshakeStatusOf(error)).toBe(status);
    });
});

describe("handshakeChain", () => {
    /** A client over a scripted EIP-1193 transport: `eth_call` answers `ownerOf`, nothing else. */
    function client(answer: Address | "revert"): PublicClient {
        return createPublicClient({
            transport: custom({
                async request({method}: {method: string}) {
                    if (method === "eth_chainId") return "0x350b";
                    if (method !== "eth_call") throw new Error(`unexpected ${method}`);
                    if (answer === "revert") throw new Error("execution reverted");
                    return encodeAbiParameters([{type: "address"}], [answer]);
                },
            }),
        }) as PublicClient;
    }

    it("reads ownerOf on the registry's chain, checksummed", async () => {
        const reads = handshakeChain({
            clients: {13579: client(owner.address.toLowerCase() as Address)},
        });
        expect(await reads.ownerOf({chainId: 13579, registry: REGISTRY, agentId: 7n})).toBe(
            owner.address,
        );
    });

    it("throws for a chain it has no RPC for, and on a revert", async () => {
        const reads = handshakeChain({clients: {13579: client("revert")}});
        await expect(reads.ownerOf({chainId: 1, registry: REGISTRY, agentId: 7n})).rejects.toThrow(
            "no RPC configured for chain 1",
        );
        await expect(
            reads.ownerOf({chainId: 13579, registry: REGISTRY, agentId: 7n}),
        ).rejects.toThrow();
    });

    it("verifies an EOA signature", async () => {
        const reads = handshakeChain({clients: {13579: client(owner.address)}});
        const signature = await owner.signMessage({message: "hello"});
        expect(
            await reads.verifyMessage({
                chainId: 13579,
                address: owner.address,
                message: "hello",
                signature,
            }),
        ).toBe(true);
    });

    it("accepts an RPC URL map without touching the network", () => {
        const reads = handshakeChain({rpcUrls: {13579: "http://127.0.0.1:1"}});
        expect(typeof reads.ownerOf).toBe("function");
    });
});
