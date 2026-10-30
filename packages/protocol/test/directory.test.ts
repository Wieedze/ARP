import type {GraphqlTransport} from "@arp-protocol/graphql";
import {verifyMessage, type Address} from "viem";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";
import {describe, expect, it} from "vitest";

import {
    getAgentEndpoints,
    isSameAgent,
    resolveAgentEndpoint,
    type DirectoryConfig,
    type DirectorySubject,
} from "../src/directory.js";
import {
    createHandshakeVerifier,
    endpointBindingDocument,
    type EndpointBinding,
    type HandshakeChain,
} from "../src/handshake.js";

const REGISTRY = "0xC165A2AD2E540A4069E02834009161E2b4490d5A";
const AGENT_ATOM = `0x${"aa".repeat(32)}`;
/** Agent 7, whose atom the claims hang on. */
const SUBJECT: DirectorySubject = {
    agentAtom: AGENT_ATOM,
    agentRegistry: `eip155:13579:${REGISTRY}`,
    agentId: "7",
};
const owner = privateKeyToAccount(generatePrivateKey());
const node = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());

function chainOf(state: {owner: Address}): HandshakeChain {
    return {ownerOf: async () => state.owner, verifyMessage: (args) => verifyMessage(args)};
}

async function bind(
    endpoint: string,
    chain: HandshakeChain,
    agentId = "7",
): Promise<EndpointBinding> {
    const v = createHandshakeVerifier({
        chain,
        domain: "arp.example",
        uri: "https://arp.example/handshake",
    });
    const challenge = await v.challenge({
        agentRegistry: `eip155:13579:${REGISTRY}`,
        agentId,
        nodePublicKey: node.publicKey,
        endpoint,
    });
    if (!challenge.ok) throw new Error("no challenge");
    const done = await v.complete({
        nonce: challenge.value.nonce,
        ownerSignature: await owner.signMessage({message: challenge.value.message}),
        nodeSignature: await node.signMessage({message: challenge.value.message}),
    });
    if (!done.ok) throw new Error("no binding");
    return done.value;
}

type Claim = {tripleId: string; endpoint: string; createdAt?: string};
type Proof = {tripleId: string; document: string};

/** A transport over stated graph rows, answering the two queries by their operation name. */
function graph(
    claims: Claim[],
    proofs: Proof[],
    seen: Record<string, unknown>[] = [],
): GraphqlTransport {
    return {
        async request(query, variables) {
            seen.push(variables);
            if (query.includes("query EndpointBindings")) {
                return {
                    triples: [
                        ...claims.map((claim) => ({
                            term_id: claim.tripleId,
                            created_at: claim.createdAt ?? "2026-10-30T12:00:00Z",
                            object: {
                                term_id: `0x${"ee".repeat(32)}`,
                                data: claim.endpoint,
                                label: null,
                            },
                        })),
                        "not a row",
                        {term_id: "0x01", object: null},
                    ],
                };
            }
            if (query.includes("query EndpointProofs")) {
                const triple = String(variables["triple"]).toLowerCase();
                return {
                    triples: [
                        ...proofs
                            .filter((proof) => proof.tripleId.toLowerCase() === triple)
                            .map((proof) => ({
                                object_id: proof.tripleId.toUpperCase().replace("0X", "0x"),
                                subject: {term_id: "0x02", data: proof.document},
                            })),
                        // An indexer that ignored the filter: a context on another triple.
                        {object_id: "0xdead", subject: {term_id: "0x03", data: "ipfs://stray"}},
                        {object_id: null, subject: null},
                        7,
                    ],
                };
            }
            throw new Error(`unexpected query ${query}`);
        },
    };
}

function config(
    transport: GraphqlTransport,
    chain: HandshakeChain,
    documents: Record<string, unknown>,
): DirectoryConfig {
    return {
        graphqlUrl: "https://testnet.intuition.sh/v1/graphql",
        predicates: {hasEndpoint: "0xe1", inContextOf: "0xc1"},
        chain,
        transport,
        async fetchDocument(uri) {
            if (!(uri in documents)) throw new Error("gateway answered 404");
            return documents[uri];
        },
    };
}

describe("getAgentEndpoints", () => {
    it("lists each claimed endpoint with its proof, and the bound one resolves", async () => {
        const state = {owner: owner.address};
        const chain = chainOf(state);
        const good = await bind("https://a.example", chain);
        const seen: Record<string, unknown>[] = [];
        const transport = graph(
            [
                {tripleId: "0xa1", endpoint: "https://a.example"},
                {tripleId: "0xb1", endpoint: "https://b.example"},
            ],
            [{tripleId: "0xa1", document: "ipfs://good"}],
            seen,
        );
        const cfg = config(transport, chain, {
            "ipfs://good": JSON.parse(endpointBindingDocument(good)),
        });
        const listed = await getAgentEndpoints(SUBJECT, cfg);
        expect(listed.map((entry) => [entry.endpoint, entry.status])).toEqual([
            ["https://a.example", "bound"],
            ["https://b.example", "unproven"],
        ]);
        expect(seen[0]).toMatchObject({subject: AGENT_ATOM, hasEndpoint: "0xe1", limit: 10});
        expect(seen.slice(1)).toEqual([
            {triple: "0xa1", inContextOf: "0xc1", limit: 5},
            {triple: "0xb1", inContextOf: "0xc1", limit: 5},
        ]);
        expect(await resolveAgentEndpoint(SUBJECT, cfg)).toBe("https://a.example");
    });

    it("reads a transferred token as transferred, and resolves nothing", async () => {
        const state = {owner: owner.address};
        const chain = chainOf(state);
        const binding = await bind("https://a.example", chain);
        state.owner = stranger.address;
        const cfg = config(
            graph(
                [{tripleId: "0xa1", endpoint: "https://a.example"}],
                [{tripleId: "0xa1", document: "ipfs://d"}],
            ),
            chain,
            {"ipfs://d": JSON.parse(endpointBindingDocument(binding))},
        );
        const [entry] = await getAgentEndpoints(SUBJECT, cfg);
        expect(entry?.status).toBe("transferred");
        expect(await resolveAgentEndpoint(SUBJECT, cfg)).toBeNull();
    });

    it("keeps the best proof, and reports proofs that are unreadable, foreign or for another endpoint", async () => {
        const chain = chainOf({owner: owner.address});
        const other = await bind("https://other.example", chain);
        const good = await bind("https://a.example", chain);
        const cfg = config(
            graph(
                [{tripleId: "0xa1", endpoint: "https://a.example"}],
                [
                    {tripleId: "0xa1", document: "ipfs://missing"},
                    {tripleId: "0xa1", document: "ipfs://not-a-binding"},
                    {tripleId: "0xa1", document: "ipfs://other"},
                    {tripleId: "0xa1", document: "ipfs://good"},
                ],
            ),
            chain,
            {
                "ipfs://not-a-binding": {name: "x"},
                "ipfs://other": JSON.parse(endpointBindingDocument(other)),
                "ipfs://good": JSON.parse(endpointBindingDocument(good)),
            },
        );
        const [entry] = await getAgentEndpoints(SUBJECT, cfg);
        expect(entry?.status).toBe("bound");
        expect(entry?.proofs.map((proof) => proof.status)).toEqual([
            "unreadable",
            "unreadable",
            "invalid",
            "bound",
        ]);
    });

    it("reads nothing more when the agent claims no endpoint", async () => {
        const seen: Record<string, unknown>[] = [];
        const cfg = config(graph([], [], seen), chainOf({owner: owner.address}), {});
        // The one malformed row the fake always adds has no endpoint, so it is dropped too.
        expect(
            await getAgentEndpoints(SUBJECT, {
                ...cfg,
                transport: {
                    async request(query, variables) {
                        seen.push(variables);
                        return query.includes("EndpointBindings") ? {triples: null} : {triples: []};
                    },
                },
            }),
        ).toEqual([]);
        expect(seen).toHaveLength(1);
    });

    it("fetches a pinned document through the gateway by default", async () => {
        const chain = chainOf({owner: owner.address});
        const good = await bind("https://a.example", chain);
        const urls: string[] = [];
        const listed = await getAgentEndpoints(SUBJECT, {
            graphqlUrl: "https://testnet.intuition.sh/v1/graphql",
            predicates: {hasEndpoint: "0xe1", inContextOf: "0xc1"},
            chain,
            transport: graph(
                [{tripleId: "0xa1", endpoint: "https://a.example"}],
                [
                    {tripleId: "0xa1", document: "ipfs://bafygood"},
                    {tripleId: "0xa1", document: "ipfs://bafygone"},
                    {tripleId: "0xa1", document: "https://not-ipfs.example"},
                ],
            ),
            fetch: async (input) => {
                urls.push(input);
                return input.endsWith("bafygood")
                    ? new Response(endpointBindingDocument(good))
                    : new Response("gone", {status: 404});
            },
        });
        expect(urls).toEqual(["https://ipfs.io/ipfs/bafygood", "https://ipfs.io/ipfs/bafygone"]);
        expect(listed[0]?.proofs.map((proof) => proof.status)).toEqual([
            "bound",
            "unreadable",
            "unreadable",
        ]);
    });

    it("reads another agent's valid binding under this agent's atom as invalid, and resolves nothing", async () => {
        // The attack: the owner of agent 8 completes a genuine handshake for 8, writes
        // (agent 7's atom, has endpoint, E) and attaches the binding to it.
        const chain = chainOf({owner: owner.address});
        const foreign = await bind("https://attacker.example", chain, "8");
        const cfg = config(
            graph(
                [{tripleId: "0xa1", endpoint: "https://attacker.example"}],
                [{tripleId: "0xa1", document: "ipfs://foreign"}],
            ),
            chain,
            {"ipfs://foreign": JSON.parse(endpointBindingDocument(foreign))},
        );
        const [entry] = await getAgentEndpoints(SUBJECT, cfg);
        expect(entry?.status).toBe("unproven");
        expect(entry?.proofs).toMatchObject([
            {status: "invalid", reason: "the document binds another agent"},
        ]);
        expect(await resolveAgentEndpoint(SUBJECT, cfg)).toBeNull();
        // The same binding read for its own agent is bound: the check is the subject, not the proof.
        expect(await resolveAgentEndpoint({...SUBJECT, agentId: "8"}, cfg)).toBe(
            "https://attacker.example",
        );
    });

    it("keeps the genuine endpoint when a newer foreign binding is attached beside it", async () => {
        const chain = chainOf({owner: owner.address});
        const genuine = await bind("https://a.example", chain);
        const foreign = await bind("https://attacker.example", chain, "8");
        const cfg = config(
            graph(
                [
                    {tripleId: "0xb1", endpoint: "https://attacker.example"},
                    {tripleId: "0xa1", endpoint: "https://a.example"},
                ],
                [
                    {tripleId: "0xb1", document: "ipfs://foreign"},
                    {tripleId: "0xa1", document: "ipfs://genuine"},
                ],
            ),
            chain,
            {
                "ipfs://foreign": JSON.parse(endpointBindingDocument(foreign)),
                "ipfs://genuine": JSON.parse(endpointBindingDocument(genuine)),
            },
        );
        expect(await resolveAgentEndpoint(SUBJECT, cfg)).toBe("https://a.example");
    });

    it("checks at most maxProofsPerClaim proofs per claim, oldest first", async () => {
        const chain = chainOf({owner: owner.address});
        const good = await bind("https://a.example", chain);
        const fetched: string[] = [];
        const junk = Array.from({length: 7}, (_, i) => ({
            tripleId: "0xa1",
            document: `ipfs://j${i}`,
        }));
        const seen: Record<string, unknown>[] = [];
        const cfg: DirectoryConfig = {
            ...config(
                graph(
                    [{tripleId: "0xa1", endpoint: "https://a.example"}],
                    [{tripleId: "0xa1", document: "ipfs://good"}, ...junk],
                    seen,
                ),
                chain,
                {},
            ),
            maxProofsPerClaim: 3,
            async fetchDocument(uri) {
                fetched.push(uri);
                if (uri === "ipfs://good") return JSON.parse(endpointBindingDocument(good));
                throw new Error("gateway answered 404");
            },
        };
        const [entry] = await getAgentEndpoints(SUBJECT, cfg);
        expect(seen[1]).toMatchObject({limit: 3});
        // The fake ignores `limit`, as a misbehaving indexer would; the reader still stops at 3.
        expect(fetched).toEqual(["ipfs://good", "ipfs://j0", "ipfs://j1"]);
        expect(entry?.status).toBe("bound");
    });

    it("refuses a subject that names no ERC-8004 agent", async () => {
        const cfg = config(graph([], []), chainOf({owner: owner.address}), {});
        await expect(
            getAgentEndpoints({...SUBJECT, agentRegistry: "eip155:13579"}, cfg),
        ).rejects.toBeInstanceOf(TypeError);
        await expect(getAgentEndpoints({...SUBJECT, agentId: "x"}, cfg)).rejects.toThrow(
            "not an ERC-8004 agent id",
        );
    });
});

describe("isSameAgent", () => {
    const seven = {agentRegistry: `eip155:13579:${REGISTRY}`, agentId: "7"};

    it("matches one token whatever the registry address's case", () => {
        expect(
            isSameAgent(seven, {
                agentRegistry: `eip155:13579:${REGISTRY.toLowerCase()}`,
                agentId: "7",
            }),
        ).toBe(true);
    });

    it("tells apart another token, another registry and another chain, and refuses malformed ids", () => {
        expect(isSameAgent(seven, {...seven, agentId: "8"})).toBe(false);
        expect(
            isSameAgent(seven, {
                agentRegistry: `eip155:13579:0x${"11".repeat(20)}`,
                agentId: "7",
            }),
        ).toBe(false);
        expect(isSameAgent(seven, {agentRegistry: `eip155:1155:${REGISTRY}`, agentId: "7"})).toBe(
            false,
        );
        expect(isSameAgent(seven, {...seven, agentId: "07"})).toBe(false);
        expect(isSameAgent({...seven, agentRegistry: "nope"}, seven)).toBe(false);
    });
});
