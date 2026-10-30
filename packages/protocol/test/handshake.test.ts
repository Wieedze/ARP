import {getAddress, verifyMessage, type Address} from "viem";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";
import {parseSiweMessage} from "viem/siwe";
import {describe, expect, it} from "vitest";

import {
    asEndpointBinding,
    bindingFromDocument,
    bindingStatement,
    createHandshakeVerifier,
    endpointBindingDocument,
    memoryChallengeStore,
    nodeAddressOf,
    normaliseEndpoint,
    parseAgentRegistry,
    validateHandshakeRequest,
    verifyEndpointBinding,
    type EndpointBinding,
    type HandshakeChain,
} from "../src/handshake.js";

const REGISTRY = "0xC165A2AD2E540A4069E02834009161E2b4490d5A";
const AGENT = {agentRegistry: `eip155:13579:${REGISTRY}`, agentId: "7"};
const ENDPOINT = "https://quiet-lake.trycloudflare.com";

const owner = privateKeyToAccount(generatePrivateKey());
const node = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());

/** A registry with one token whose owner the test moves, and EOA-only signature checks. */
function fakeChain(state: {
    owner: Address | null;
    failVerify?: boolean;
}): HandshakeChain & {reads: number} {
    const chain = {
        reads: 0,
        async ownerOf() {
            chain.reads += 1;
            if (state.owner === null) throw new Error("ERC721NonexistentToken(7)");
            return state.owner;
        },
        async verifyMessage(args: {address: Address; message: string; signature: `0x${string}`}) {
            if (state.failVerify === true) throw new Error("rpc down");
            return verifyMessage(args);
        },
    };
    return chain;
}

const request = {...AGENT, nodePublicKey: node.publicKey, endpoint: ENDPOINT};

function clock(start = Date.parse("2026-10-30T12:00:00Z")) {
    let at = start;
    return {now: () => new Date(at), advance: (seconds: number) => (at += seconds * 1000)};
}

function verifier(chain: HandshakeChain, time = clock()) {
    let n = 0;
    return createHandshakeVerifier({
        chain,
        domain: "arp.example",
        uri: "https://arp.example/handshake",
        now: time.now,
        nonce: () => `nonce${String(++n).padStart(8, "0")}`,
    });
}

async function handshake(chain: HandshakeChain): Promise<EndpointBinding> {
    const v = verifier(chain);
    const challenge = await v.challenge(request);
    if (!challenge.ok) throw new Error(JSON.stringify(challenge.error));
    const result = await v.complete({
        nonce: challenge.value.nonce,
        ownerSignature: await owner.signMessage({message: challenge.value.message}),
        nodeSignature: await node.signMessage({message: challenge.value.message}),
    });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    return result.value;
}

describe("parseAgentRegistry", () => {
    it("splits a CAIP-10 registry and checksums it", () => {
        expect(parseAgentRegistry(`eip155:13579:${REGISTRY.toLowerCase()}`)).toEqual({
            chainId: 13579,
            registry: REGISTRY,
        });
    });
    it("refuses anything else", () => {
        expect(
            parseAgentRegistry("eip155:0:0x0000000000000000000000000000000000000000"),
        ).toBeNull();
        expect(parseAgentRegistry(`solana:1:${REGISTRY}`)).toBeNull();
        expect(parseAgentRegistry("eip155:99999999999999999999:" + REGISTRY)).toBeNull();
    });
});

describe("normaliseEndpoint", () => {
    it("keeps https and drops a bare trailing slash", () => {
        expect(normaliseEndpoint(" https://a.example/ ")).toBe("https://a.example");
        expect(normaliseEndpoint("https://a.example/task?x=1")).toBe("https://a.example/task?x=1");
    });
    it("refuses http, credentials, fragments and garbage", () => {
        expect(normaliseEndpoint("http://a.example")).toBeNull();
        expect(normaliseEndpoint("https://u:p@a.example")).toBeNull();
        expect(normaliseEndpoint("https://a.example#x")).toBeNull();
        expect(normaliseEndpoint("not a url")).toBeNull();
    });
});

describe("nodeAddressOf", () => {
    it("derives the address of an uncompressed public key", () => {
        expect(nodeAddressOf(node.publicKey)).toBe(node.address);
    });
    it("refuses a compressed key, an address or non-hex", () => {
        expect(nodeAddressOf(`0x02${"11".repeat(32)}`)).toBeNull();
        expect(nodeAddressOf(node.address)).toBeNull();
        expect(nodeAddressOf("hello")).toBeNull();
    });
});

describe("bindingStatement", () => {
    it("names the node, the agent and the endpoint, on one line", () => {
        const text = bindingStatement(AGENT, node.address, ENDPOINT);
        expect(text).toContain(node.address);
        expect(text).toContain(`agent 7 of eip155:13579:${REGISTRY}`);
        expect(text).toContain(ENDPOINT);
        expect(text).not.toContain("\n");
    });
});

describe("validateHandshakeRequest", () => {
    it("accepts a complete request and normalises the registry", () => {
        const result = validateHandshakeRequest({
            ...request,
            agentRegistry: AGENT.agentRegistry.toLowerCase(),
        });
        expect(result.ok && result.value.agent.agentRegistry).toBe(AGENT.agentRegistry);
    });
    it.each([
        [null, "body is not an object"],
        [{...request, agentRegistry: 1}, "agentRegistry is missing"],
        [{...request, agentRegistry: "x"}, "agentRegistry is not"],
        [{...request, agentId: "07"}, "agentId"],
        [{...request, nodePublicKey: undefined}, "nodePublicKey is missing"],
        [{...request, nodePublicKey: node.address}, "nodePublicKey is not"],
        [{...request, endpoint: undefined}, "endpoint is missing"],
        [{...request, endpoint: "http://a.example"}, "endpoint is not"],
    ])("refuses %j", (input, reason) => {
        const result = validateHandshakeRequest(input);
        expect(result.ok).toBe(false);
        if (!result.ok && result.error.code === "malformed")
            expect(result.error.reason).toContain(reason);
    });
});

describe("memoryChallengeStore", () => {
    const entry = (expiresAt: string) =>
        ({request: {}, challenge: {expiresAt}}) as unknown as Parameters<
            ReturnType<typeof memoryChallengeStore>["put"]
        >[1]; // only expiresAt is read
    it("hands an entry out once", () => {
        const store = memoryChallengeStore();
        expect(store.put("a", entry("2999-01-01T00:00:00Z"))).toBe(true);
        expect(store.take("a")).toBeDefined();
        expect(store.take("a")).toBeUndefined();
    });
    it("refuses a duplicate nonce and a write past the bound, after dropping expired entries", () => {
        const time = clock();
        const store = memoryChallengeStore({maxPending: 1, now: time.now});
        expect(store.put("a", entry("2026-10-30T12:01:00Z"))).toBe(true);
        expect(store.put("a", entry("2026-10-30T12:01:00Z"))).toBe(false);
        expect(store.put("b", entry("2026-10-30T12:01:00Z"))).toBe(false);
        time.advance(120);
        expect(store.put("b", entry("2026-10-30T12:05:00Z"))).toBe(true);
    });
});

describe("createHandshakeVerifier", () => {
    it("issues an EIP-4361 challenge addressed to the on-chain owner", async () => {
        const result = await verifier(fakeChain({owner: owner.address})).challenge(request);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const parsed = parseSiweMessage(result.value.message);
        expect(parsed.address).toBe(owner.address);
        expect(parsed.chainId).toBe(13579);
        expect(parsed.domain).toBe("arp.example");
        expect(parsed.nonce).toBe(result.value.nonce);
        expect(parsed.resources).toEqual([ENDPOINT]);
        expect(parsed.statement).toBe(bindingStatement(AGENT, node.address, ENDPOINT));
        expect(Date.parse(result.value.expiresAt) - Date.parse(result.value.issuedAt)).toBe(
            300_000,
        );
    });

    it("binds when the owner and the node both sign", async () => {
        const binding = await handshake(fakeChain({owner: owner.address}));
        expect(binding.owner).toBe(owner.address);
        expect(binding.nodeAddress).toBe(node.address);
        expect(binding.endpoint).toBe(ENDPOINT);
    });

    it("refuses a token that cannot be read", async () => {
        const result = await verifier(fakeChain({owner: null})).challenge(request);
        expect(!result.ok && result.error.code).toBe("chain-unreadable");
    });

    it("refuses a malformed request without reading the chain", async () => {
        const chain = fakeChain({owner: owner.address});
        const result = await verifier(chain).challenge({...request, agentId: "x"});
        expect(!result.ok && result.error.code).toBe("malformed");
        expect(chain.reads).toBe(0);
    });

    it("refuses when the store is full", async () => {
        const v = createHandshakeVerifier({
            chain: fakeChain({owner: owner.address}),
            domain: "arp.example",
            uri: "https://arp.example/handshake",
            store: memoryChallengeStore({maxPending: 0}),
        });
        const result = await v.challenge(request);
        expect(!result.ok && result.error.code).toBe("busy");
    });

    describe("complete", () => {
        async function started(
            state: {owner: Address | null; failVerify?: boolean},
            time = clock(),
        ) {
            const chain = fakeChain(state);
            const v = verifier(chain, time);
            const challenge = await v.challenge(request);
            if (!challenge.ok) throw new Error("no challenge");
            return {v, challenge: challenge.value, time};
        }

        it.each([
            [null, "body is not an object"],
            [{nonce: 1}, "nonce is missing"],
            [{nonce: "n", ownerSignature: "zz", nodeSignature: "0x"}, "ownerSignature"],
            [{nonce: "n", ownerSignature: "0x", nodeSignature: 3}, "nodeSignature"],
        ])("refuses a malformed body %j", async (body, reason) => {
            const result = await verifier(fakeChain({owner: owner.address})).complete(body);
            expect(
                !result.ok && result.error.code === "malformed" && result.error.reason,
            ).toContain(reason);
        });

        it("refuses a nonce it never issued, and a nonce used twice", async () => {
            const {v, challenge} = await started({owner: owner.address});
            const body = {
                nonce: challenge.nonce,
                ownerSignature: await owner.signMessage({message: challenge.message}),
                nodeSignature: await node.signMessage({message: challenge.message}),
            };
            expect((await v.complete(body)).ok).toBe(true);
            const again = await v.complete(body);
            expect(!again.ok && again.error.code).toBe("unknown-nonce");
        });

        it("spends the nonce on a failed attempt", async () => {
            const {v, challenge} = await started({owner: owner.address});
            const ownerSignature = await owner.signMessage({message: challenge.message});
            const bad = await v.complete({
                nonce: challenge.nonce,
                ownerSignature,
                nodeSignature: await stranger.signMessage({message: challenge.message}),
            });
            expect(!bad.ok && bad.error.code).toBe("bad-node-signature");
            const retry = await v.complete({
                nonce: challenge.nonce,
                ownerSignature,
                nodeSignature: await node.signMessage({message: challenge.message}),
            });
            expect(!retry.ok && retry.error.code).toBe("unknown-nonce");
        });

        it("refuses after the expiry", async () => {
            const {v, challenge, time} = await started({owner: owner.address});
            time.advance(301);
            const result = await v.complete({
                nonce: challenge.nonce,
                ownerSignature: await owner.signMessage({message: challenge.message}),
                nodeSignature: await node.signMessage({message: challenge.message}),
            });
            expect(!result.ok && result.error.code).toBe("expired");
        });

        it("refuses a node signature that does not parse", async () => {
            const {v, challenge} = await started({owner: owner.address});
            const result = await v.complete({
                nonce: challenge.nonce,
                ownerSignature: await owner.signMessage({message: challenge.message}),
                nodeSignature: "0x1234",
            });
            expect(result).toEqual({
                ok: false,
                error: {code: "bad-node-signature", recovered: null},
            });
        });

        it("refuses a signature from anyone but the owner", async () => {
            const {v, challenge} = await started({owner: owner.address});
            const result = await v.complete({
                nonce: challenge.nonce,
                ownerSignature: await stranger.signMessage({message: challenge.message}),
                nodeSignature: await node.signMessage({message: challenge.message}),
            });
            expect(!result.ok && result.error.code).toBe("bad-owner-signature");
        });

        it("refuses when the token moved while the owner was signing", async () => {
            const state: {owner: Address | null} = {owner: owner.address};
            const {v, challenge} = await started(state);
            state.owner = stranger.address;
            const result = await v.complete({
                nonce: challenge.nonce,
                ownerSignature: await owner.signMessage({message: challenge.message}),
                nodeSignature: await node.signMessage({message: challenge.message}),
            });
            expect(result).toEqual({
                ok: false,
                error: {code: "owner-changed", signedFor: owner.address, current: stranger.address},
            });
        });

        it("reports an unreadable chain on the second read and on the signature check", async () => {
            const state: {owner: Address | null; failVerify?: boolean} = {owner: owner.address};
            const first = await started(state);
            state.owner = null;
            const gone = await first.v.complete({
                nonce: first.challenge.nonce,
                ownerSignature: await owner.signMessage({message: first.challenge.message}),
                nodeSignature: await node.signMessage({message: first.challenge.message}),
            });
            expect(!gone.ok && gone.error.code).toBe("chain-unreadable");

            const second = await started({owner: owner.address, failVerify: true});
            const down = await second.v.complete({
                nonce: second.challenge.nonce,
                ownerSignature: await owner.signMessage({message: second.challenge.message}),
                nodeSignature: await node.signMessage({message: second.challenge.message}),
            });
            expect(down).toEqual({
                ok: false,
                error: {code: "chain-unreadable", reason: "rpc down"},
            });
        });
    });
});

describe("verifyEndpointBinding", () => {
    it("is bound while the signer still owns the token", async () => {
        const chain = fakeChain({owner: owner.address});
        const binding = await handshake(chain);
        expect(await verifyEndpointBinding(binding, chain)).toEqual({
            status: "bound",
            owner: owner.address,
        });
    });

    it("is transferred once the token moves, until a new handshake", async () => {
        const state: {owner: Address | null} = {owner: owner.address};
        const chain = fakeChain(state);
        const binding = await handshake(chain);
        state.owner = stranger.address;
        expect(await verifyEndpointBinding(binding, chain)).toEqual({
            status: "transferred",
            signedBy: owner.address,
            current: stranger.address,
        });
    });

    it("is unknown when the chain cannot be read, never bound or invalid", async () => {
        const state: {owner: Address | null; failVerify?: boolean} = {owner: owner.address};
        const chain = fakeChain(state);
        const binding = await handshake(chain);
        state.owner = null;
        expect((await verifyEndpointBinding(binding, chain)).status).toBe("unknown");
        state.owner = owner.address;
        state.failVerify = true;
        expect((await verifyEndpointBinding(binding, chain)).status).toBe("unknown");
    });

    it.each<[string, (binding: EndpointBinding) => EndpointBinding, string]>([
        ["a version", (b) => ({...b, version: 2}), "unknown version"],
        ["the endpoint", (b) => ({...b, endpoint: "https://other.example"}), "does not say"],
        ["an unnormalised endpoint", (b) => ({...b, endpoint: `${b.endpoint}/`}), "normal form"],
        ["a bad field", (b) => ({...b, agentId: "x"}), "agentId"],
        ["the owner", (b) => ({...b, owner: stranger.address}), "not addressed to the owner"],
        ["a non-address owner", (b) => ({...b, owner: "0x1" as Address}), "not an address"],
        ["the node address", (b) => ({...b, nodeAddress: stranger.address}), "does not match"],
        [
            "a signature to non-hex",
            (b) => ({...b, nodeSignature: "zz" as `0x${string}`}),
            "not hex",
        ],
        ["the message", (b) => ({...b, message: "hello"}), "not EIP-4361"],
        ["the agent", (b) => ({...b, agentId: "8"}), "does not say"],
        [
            "the chain",
            (b) => ({...b, message: b.message.replace("Chain ID: 13579", "Chain ID: 1")}),
            "another chain",
        ],
        ["the node signature", (b) => ({...b, nodeSignature: b.ownerSignature}), "node signature"],
        [
            "the owner signature",
            (b) => ({...b, ownerSignature: b.nodeSignature}),
            "owner signature",
        ],
    ])("is invalid when %s is changed", async (_what, mutate, reason) => {
        const chain = fakeChain({owner: owner.address});
        const binding = await handshake(chain);
        const verdict = await verifyEndpointBinding(mutate(binding), chain);
        expect(verdict.status).toBe("invalid");
        if (verdict.status === "invalid") expect(verdict.reason).toContain(reason);
    });

    it("is invalid when the node public key is swapped for another key", async () => {
        const chain = fakeChain({owner: owner.address});
        const binding = await handshake(chain);
        const verdict = await verifyEndpointBinding(
            {...binding, nodePublicKey: stranger.publicKey, nodeAddress: stranger.address},
            chain,
        );
        expect(verdict.status).toBe("invalid");
    });
});

describe("the binding document", () => {
    it("is canonical, a schema.org Thing, and gives the binding back", async () => {
        const binding = await handshake(fakeChain({owner: owner.address}));
        const reordered = Object.fromEntries(Object.entries(binding).reverse()) as EndpointBinding;
        const text = endpointBindingDocument(binding);
        expect(endpointBindingDocument(reordered)).toBe(text);
        const parsed: unknown = JSON.parse(text);
        expect(parsed).toMatchObject({"@type": "Thing", url: ENDPOINT});
        expect(bindingFromDocument(parsed)).toEqual(binding);
    });

    it("refuses what is not a binding", () => {
        expect(bindingFromDocument(null)).toBeNull();
        expect(bindingFromDocument({binding: {version: "1"}})).toBeNull();
        expect(asEndpointBinding({version: 1})).toBeNull();
        expect(asEndpointBinding("x")).toBeNull();
    });
});

describe("the owner's checksum", () => {
    it("is normalised whatever case the chain returns", async () => {
        const chain = fakeChain({owner: owner.address.toLowerCase() as Address});
        const binding = await handshake(chain);
        expect(binding.owner).toBe(getAddress(owner.address));
    });
});
