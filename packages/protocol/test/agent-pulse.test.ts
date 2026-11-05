import {
    AGENT_IDENTITIES_QUERY,
    ATTACHED_DOCUMENTS_QUERY,
    PULSE_DOMAIN_EDGES_QUERY,
    PULSE_EDGE_TOOLS_QUERY,
    type GraphqlTransport,
} from "@arp-protocol/graphql";
import type {Hex} from "viem";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";
import {describe, expect, it} from "vitest";

import {canonicalAgentThing, thingUri} from "../src/declare/agent-atom.js";
import {atomDataForUri} from "../src/declare/multivault.js";
import {atomIsCanonicalFor, findAgentsInDomains, readLineReceipts, receiptHolds, resolveAgentAtom, walletControlsSubject, type LineReceipt, type PaymentFacts} from "../src/agent-pulse.js";
import type {StrictIdentityAtom} from "../src/declare/index.js";
import type {AgentIdentityAtom} from "../src/verify/subject.js";
import {signHireReceipt, type HireReceipt, type SignedHireReceipt} from "../src/hire-receipt.js";
import {IPFS_GATEWAYS, readIpfsJson} from "../src/verify/probe.js";

const KNOWN_REGISTRY = "0xC165A2AD2E540A4069E02834009161E2b4490d5A";
const node = privateKeyToAccount(generatePrivateKey());
const hirer = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());
const LINE = `0x${"11".repeat(32)}` as Hex;
const PAYMENT = `0x${"22".repeat(32)}` as Hex;
const line = {tripleId: LINE, writer: hirer.address};

const REGISTRY = "eip155:13579:0xC165A2AD2E540A4069E02834009161E2b4490d5A";
const fields = (overrides: Partial<HireReceipt> = {}): HireReceipt => ({
    version: 2,
    agentRegistry: REGISTRY,
    agentId: "2",
    requester: hirer.address,
    payment: PAYMENT,
    paid: "1000",
    requestHash: `0x${"33".repeat(32)}`,
    resultHash: `0x${"44".repeat(32)}`,
    issuedAt: 1_000,
    termId: LINE,
    expiresAt: 2_000,
    ...overrides,
});
const signed = (signer = node, overrides: Partial<HireReceipt> = {}) =>
    signHireReceipt(fields(overrides), {chainId: 13579, verifyingContract: hirer.address}, signer);

const attached = (document: unknown, others = 0): GraphqlTransport & {creators: string[]} => {
    const seen: {creators: string[]} = {creators: []};
    return {
        get creators() {
            return seen.creators;
        },
        request: async (query: string, variables?: Record<string, unknown>) => {
            if (query !== ATTACHED_DOCUMENTS_QUERY) throw new Error("unexpected query");
            seen.creators = variables?.["creators"] as string[]; // this test's own variable
            return {
                others: {aggregate: {count: others}},
                triples: [{creator_id: hirer.address, subject: {data: "ipfs://receipt", value: {json_object: {data: document}}}}],
            };
        },
    };
};

const payment = (overrides: Partial<PaymentFacts> = {}) => async (): Promise<PaymentFacts> => ({
    status: "success",
    from: hirer.address,
    to: node.address,
    value: 1000n,
    ...overrides,
});

const read = (
    document: unknown,
    facts: () => Promise<PaymentFacts | null> = payment(),
    boundNodes: string[] = [node.address],
) =>
    readLineReceipts(line, {
        graphqlUrl: "unused",
        transport: attached(document),
        inContextOf: "0xc0",
        agentRegistry: REGISTRY,
        agentId: "2",
        boundNodes,
        chainId: 13579,
        getPayment: facts,
        subjectControl: async () => "yes",
    });

describe("readLineReceipts", () => {
    it("holds when the node signed, the payment is real and the receipt names this line", async () => {
        const {receipts: [receipt]} = await read(await signed());
        expect(receipt?.signature).toBe("valid");
        expect(receipt?.paidWei).toBe("1000");
        expect(receiptHolds(receipt!)).toBe(true);
    });

    it.each([
        ["signed by a key no bound address names", () => signed(stranger), payment(), "signerIsABoundNode"],
        ["naming another line", () => signed(node, {termId: `0x${"99".repeat(32)}`}), payment(), "namesThisLine"],
        ["from somebody who did not write the line", () => signed(node, {requester: stranger.address}), payment({from: stranger.address}), "requesterStandsBehindTheLine"],
        ["for a reverted payment", () => signed(), payment({status: "reverted"}), "paymentMined"],
        ["for a payment by somebody else", () => signed(), payment({from: stranger.address}), "paymentFromRequester"],
        ["for a payment to somebody else", () => signed(), payment({to: stranger.address}), "paymentToSigner"],
        ["about another agent", () => signed(node, {agentId: "3"}), payment(), "namesThisAgent"],
    ] as const)("does not hold when %s", async (_name, make, facts, failing) => {
        const {receipts: [receipt]} = await read(await make(), facts);
        expect(receipt?.checks[failing as keyof LineReceipt["checks"]]).toBe(false);
        expect(receiptHolds(receipt!)).toBe(false);
    });

    it.each(["no", "unknown"] as const)(
        "does not hold when a wallet pays a real node about an agent it does not control (%s)",
        async (control) => {
            const {receipts: [receipt]} = await readLineReceipts(line, {
                graphqlUrl: "unused",
                transport: attached(await signed()),
                inContextOf: "0xc0",
                agentRegistry: REGISTRY,
                agentId: "2",
                boundNodes: [node.address],
                chainId: 13579,
                getPayment: payment(),
                subjectControl: async () => control,
            });
            expect(receipt?.signature).toBe("valid");
            expect(receipt?.checks.requesterControlsTheSubject).toBe(false);
            expect(receipt?.subjectControl).toBe(control);
            expect(receiptHolds(receipt!)).toBe(false);
        },
    );

    it("does not hold when the payment cannot be found", async () => {
        const {receipts: [receipt]} = await read(await signed(), async () => null);
        expect(receipt?.checks.paymentMined).toBe(false);
        expect(receiptHolds(receipt!)).toBe(false);
    });

    it("does not hold when the signature was altered", async () => {
        const good = await signed();
        const altered: SignedHireReceipt = {...good, receipt: {...good.receipt, paid: "999999"}};
        const {receipts: [receipt]} = await read(altered);
        expect(receipt?.signature).toBe("invalid");
        expect(receiptHolds(receipt!)).toBe(false);
    });

    it("skips a document that is not a receipt, because `in context of` attaches other things", async () => {
        expect((await read({"@type": "Thing", name: "a delegation"})).receipts).toEqual([]);
    });

    it("reads only what the line's wallets and bound nodes attached, and counts the rest", async () => {
        const transport = attached(await signed(), 7);
        const read2 = await readLineReceipts(
            {...line, holders: [stranger.address]},
            {
                graphqlUrl: "unused",
                transport,
                inContextOf: "0xc0",
                agentRegistry: REGISTRY,
                agentId: "2",
                boundNodes: [node.address],
                chainId: 13579,
                getPayment: payment({from: stranger.address}),
                subjectControl: async () => "yes",
            },
        );
        expect(transport.creators).toEqual([hirer.address, stranger.address, node.address]);
        expect(read2.othersNotRead).toBe(7);
    });

    it("accepts a requester who holds a position on the line it did not create", async () => {
        const first = await signed(node, {requester: stranger.address});
        const {receipts: [receipt]} = await readLineReceipts(
            {...line, holders: [stranger.address]},
            {
                graphqlUrl: "unused",
                transport: attached(first),
                inContextOf: "0xc0",
                agentRegistry: REGISTRY,
                agentId: "2",
                boundNodes: [node.address],
                chainId: 13579,
                getPayment: payment({from: stranger.address}),
                subjectControl: async () => "yes",
            },
        );
        expect(receipt?.checks.requesterStandsBehindTheLine).toBe(true);
        expect(receiptHolds(receipt!)).toBe(true);
    });

    it("says a payment could not be read, which is not a false one", async () => {
        const {receipts: [receipt]} = await read(await signed(), async () => {
            throw new Error("rpc down");
        });
        expect(receipt?.paymentUnread).toBe(true);
        expect(receiptHolds(receipt!)).toBe(false);
    });

    it("says a document no source served was not read", async () => {
        const out = await readLineReceipts(line, {
            graphqlUrl: "unused",
            transport: attached(null),
            inContextOf: "0xc0",
            agentRegistry: REGISTRY,
            agentId: "2",
            boundNodes: [node.address],
            chainId: 13579,
            getPayment: payment(),
            subjectControl: async () => "yes",
            fetchDocument: async () => {
                throw new Error("every gateway refused");
            },
        });
        expect(out.receipts).toEqual([]);
        expect(out.unreadable).toEqual([{document: "ipfs://receipt", reason: "every gateway refused"}]);
    });

    it("asks a gateway only when the index holds no document", async () => {
        const good = await signed();
        const urls: string[] = [];
        const {receipts: [receipt]} = await readLineReceipts(line, {
            graphqlUrl: "unused",
            transport: attached(null),
            inContextOf: "0xc0",
            agentRegistry: REGISTRY,
            agentId: "2",
            boundNodes: [node.address],
            chainId: 13579,
            getPayment: payment(),
            subjectControl: async () => "yes",
            fetch: async (url: string) => {
                urls.push(url);
                return new Response(JSON.stringify(good));
            },
        });
        expect(urls).toHaveLength(1);
        expect(receiptHolds(receipt!)).toBe(true);
    });
});

describe("atomIsCanonicalFor", () => {
    const ref = (tokenId: string) => ({chainId: 13579, registry: KNOWN_REGISTRY, tokenId}) as const;
    // Stands in for the multivault: an id per document, so the two tokens' documents differ.
    const atomIdOf = async (data: Hex) => data;
    const canonicalOf = async (tokenId: string) =>
        atomIdOf(atomDataForUri(thingUri(canonicalAgentThing(13579, tokenId))));

    it("accepts an agent's own canonical atom", async () => {
        expect(await atomIsCanonicalFor(await canonicalOf("2"), ref("2"), [KNOWN_REGISTRY], atomIdOf)).toBe(true);
    });

    it("refuses another agent's atom when it is this token's only claimant", async () => {
        expect(await atomIsCanonicalFor(await canonicalOf("2"), ref("7"), [KNOWN_REGISTRY], atomIdOf)).toBe(false);
    });

    it("refuses a token with the same number on a registry it does not know", async () => {
        const elsewhere = {...ref("2"), registry: "0x00000000000000000000000000000000000000f1"} as const;
        expect(await atomIsCanonicalFor(await canonicalOf("2"), elsewhere, [KNOWN_REGISTRY], atomIdOf)).toBe(false);
    });
});

describe("resolveAgentAtom", () => {
    const ref = {chainId: 13579, registry: "0xC165A2AD2E540A4069E02834009161E2b4490d5A", tokenId: "2"} as const;
    const canonical = thingUri(canonicalAgentThing(13579, "2"));
    const REAL = `0x${"aa".repeat(32)}`;
    const FAKE = `0x${"bb".repeat(32)}`;
    const resolve = (claims: {atom: string; data: string; creator: string}[], controllers?: string[]) =>
        resolveAgentAtom(ref, {
            graphqlUrl: "unused",
            strict: async () => ({status: "ambiguous", reason: "two claimants"}),
            transport: {
                request: async () => ({
                    triples: claims.map((claim) => ({
                        creator_id: claim.creator,
                        subject: {term_id: claim.atom, data: claim.data},
                    })),
                }),
            },
            ...(controllers === undefined ? {} : {controllersOf: async () => controllers}),
        });

    it("keeps the owner's atom over a canonical atom a stranger created", async () => {
        const answer = await resolve(
            [
                {atom: FAKE, data: canonical, creator: stranger.address},
                {atom: REAL, data: "ipfs://with-metadata", creator: hirer.address},
            ],
            [hirer.address],
        );
        expect(answer).toMatchObject({status: "found", atom: REAL});
    });

    it("keeps the canonical atom when a stranger also claims the identity", async () => {
        const answer = await resolve([
            {atom: FAKE, data: "ipfs://stranger", creator: stranger.address},
            {atom: REAL, data: canonical, creator: "0xmirror"},
        ]);
        expect(answer).toMatchObject({status: "found", atom: REAL});
    });

    it("keeps the atom the token's owner claimed when none is canonical", async () => {
        const answer = await resolve(
            [
                {atom: FAKE, data: "ipfs://stranger", creator: stranger.address},
                {atom: REAL, data: "ipfs://with-metadata", creator: hirer.address},
            ],
            [hirer.address],
        );
        expect(answer).toMatchObject({status: "found", atom: REAL});
    });

    it("stays ambiguous when nothing a stranger cannot produce stands out", async () => {
        const claims = [
            {atom: FAKE, data: "ipfs://stranger", creator: stranger.address},
            {atom: REAL, data: "ipfs://with-metadata", creator: "0xmirror"},
        ];
        expect(await resolve(claims, [hirer.address])).toMatchObject({status: "ambiguous"});
        expect(await resolve(claims)).toMatchObject({status: "ambiguous"});
    });

    it("does not read claims when one atom holds the identity", async () => {
        const answer = await resolveAgentAtom(ref, {
            graphqlUrl: "unused",
            strict: async () => ({status: "none"}),
            transport: {
                request: async () => {
                    throw new Error("no claim should be read");
                },
            },
        });
        expect(answer).toEqual({status: "none"});
    });
});

const KNOWN = "0xC165A2AD2E540A4069E02834009161E2b4490d5A";
const CANONICAL_6 = thingUri(canonicalAgentThing(13579, "6"));
const FAKE_REGISTRY_CAIP = "eip155:13579/erc721:0x00000000000000000000000000000000000000f1/6";

describe("walletControlsSubject", () => {
    const CAIP = "eip155:13579/erc721:0xC165A2AD2E540A4069E02834009161E2b4490d5A/6";
    const OTHER = "eip155:13579/erc721:0xC165A2AD2E540A4069E02834009161E2b4490d5A/9";
    const asks = (labels: string[], back: StrictIdentityAtom = {status: "found", atom: "0xsubject" as AgentIdentityAtom}) =>
        walletControlsSubject("0xsubject", hirer.address, {
            graphqlUrl: "unused",
            chainId: 13579,
            transport: {
                request: async () => ({
                    triples: labels.map((label) => ({subject_id: "0xsubject", subject: {data: CANONICAL_6}, object: {label}})),
                }),
            },
            knownRegistries: [KNOWN],
            resolveStrict: async () => back,
            controllersOf: async () => [stranger.address, hirer.address],
        });

    it("says yes for the token's owner or declared wallet", async () => {
        expect(await asks([CAIP])).toBe("yes");
    });

    it("says no for a wallet that is neither", async () => {
        const answer = await walletControlsSubject("0xsubject", hirer.address, {
            graphqlUrl: "unused",
            chainId: 13579,
            transport: {
                request: async () => ({triples: [{subject_id: "0xsubject", subject: {data: CANONICAL_6}, object: {label: CAIP}}]}),
            },
            knownRegistries: [KNOWN],
            resolveStrict: async () => ({status: "found", atom: "0xsubject" as AgentIdentityAtom}),
            controllersOf: async () => [stranger.address],
        });
        expect(answer).toBe("no");
    });

    it("reads the owner of the identity the atom is canonical for, whatever token a stranger added", async () => {
        const asked: string[] = [];
        const answer = await walletControlsSubject("0xsubject", hirer.address, {
            graphqlUrl: "unused",
            chainId: 13579,
            knownRegistries: [KNOWN],
            transport: {
                request: async () => ({
                    triples: [CAIP, OTHER].map((label) => ({subject_id: "0xsubject", subject: {data: CANONICAL_6}, object: {label}})),
                }),
            },
            resolveStrict: async () => ({status: "found", atom: "0xsubject" as AgentIdentityAtom}),
            controllersOf: async (ref) => {
                asked.push(ref.tokenId);
                return [stranger.address];
            },
        });
        expect(asked).toEqual(["6"]);
        expect(answer).toBe("no");
    });

    it("never says yes when a stranger's token is the only identity on somebody else's atom", async () => {
        const ask = (data: string) =>
            walletControlsSubject("0xsubject", hirer.address, {
                graphqlUrl: "unused",
                chainId: 13579,
                knownRegistries: [KNOWN],
                transport: {
                    request: async () => ({
                        triples: [{subject_id: "0xsubject", subject: {data}, object: {label: OTHER}}],
                    }),
                },
                resolveStrict: async () => ({status: "found", atom: "0xsubject" as AgentIdentityAtom}),
                controllersOf: async () => [hirer.address],
            });
        expect(await ask("ipfs://somebody-elses-atom")).toBe("unknown");
        expect(await ask(CANONICAL_6)).toBe("unknown");
    });

    it("says no for an identity on a registry somebody deployed, whatever its ownerOf says", async () => {
        expect(await asks([FAKE_REGISTRY_CAIP])).toBe("no");
    });

    it("ignores a registry it does not know beside a real identity", async () => {
        expect(await asks([CAIP, FAKE_REGISTRY_CAIP])).toBe("yes");
    });

    it("ignores an identity on another chain", async () => {
        expect(await asks([CAIP, "eip155:8453/erc721:0xC165A2AD2E540A4069E02834009161E2b4490d5A/6"])).toBe("yes");
    });

    it("says no for an atom that only claims an identity", async () => {
        expect(await asks([CAIP], {status: "found", atom: "0xreal" as AgentIdentityAtom})).toBe("no");
    });

    it("says unknown when several atoms claim the identity, and no for no identity", async () => {
        expect(await asks([CAIP], {status: "ambiguous", reason: "two"})).toBe("unknown");
        expect(await asks([])).toBe("no");
    });
});

describe("findAgentsInDomains", () => {
    const graph = (identities: unknown[]): GraphqlTransport => ({
        request: async (query: string) => {
            if (query === PULSE_DOMAIN_EDGES_QUERY) return {triples: [{subject_id: "0xe1"}, {subject_id: "0xe2"}]};
            if (query === PULSE_EDGE_TOOLS_QUERY) {
                return {triples: [{object: {term_id: "0xagent", label: "Agent 2"}}, {object: {term_id: "0xskill", label: "a skill"}}]};
            }
            if (query === AGENT_IDENTITIES_QUERY) return {triples: identities};
            throw new Error("unexpected query");
        },
    });

    const CAIP = "eip155:13579/erc721:0xC165A2AD2E540A4069E02834009161E2b4490d5A/2";
    const OTHER = "eip155:13579/erc721:0xC165A2AD2E540A4069E02834009161E2b4490d5A/9";
    const edge = (label: string) => ({
        subject_id: "0xagent",
        subject: {data: thingUri(canonicalAgentThing(13579, "2"))},
        object: {label},
    });
    const find = (identities: unknown[], back: StrictIdentityAtom = {status: "found", atom: "0xagent" as AgentIdentityAtom}) =>
        findAgentsInDomains(["document"], {
            graphqlUrl: "unused",
            inContextOf: "0xc0",
            chainId: 13579,
            knownRegistries: [KNOWN],
            transport: graph(identities),
            resolveStrict: async () => back,
        });

    it("keeps an atom whose identity resolves back to it, and leaves out a skill", async () => {
        const {agents} = await find([edge(CAIP)]);
        expect(agents).toEqual([{atomId: "0xagent", label: "Agent 2", caip19: CAIP, ambiguous: false}]);
    });

    it("leaves out an agent whose only identity is on a registry nobody knows", async () => {
        expect((await find([edge(FAKE_REGISTRY_CAIP)])).agents).toEqual([]);
    });

    it("ignores a `same as` that is not an agent identity", async () => {
        expect((await find([edge("https://x.com/somebody")])).agents).toEqual([]);
        expect((await find([edge("Unknown")])).agents).toEqual([]);
    });

    it("keeps the identity the atom is canonical for when a stranger adds a token of their own", async () => {
        const uri = thingUri(canonicalAgentThing(13579, "2"));
        const {agents} = await find([
            {subject_id: "0xagent", subject: {data: uri}, object: {label: CAIP}},
            {subject_id: "0xagent", subject: {data: uri}, object: {label: OTHER}},
        ]);
        expect(agents).toEqual([{atomId: "0xagent", label: "Agent 2", caip19: CAIP, ambiguous: false}]);
    });

    it("gives no address when a stranger's token is the only identity on an atom, so it cannot divert a caller", async () => {
        const {agents} = await find([{subject_id: "0xagent", subject: {data: "ipfs://somebody-elses-atom"}, object: {label: OTHER}}]);
        expect(agents).toEqual([{atomId: "0xagent", label: "Agent 2", caip19: null, ambiguous: true}]);
    });

    it("gives no address for an atom naming two identities and canonical for neither", async () => {
        const {agents} = await find([
            {subject_id: "0xagent", subject: {data: "ipfs://x"}, object: {label: CAIP}},
            {subject_id: "0xagent", subject: {data: "ipfs://x"}, object: {label: OTHER}},
        ]);
        expect(agents).toEqual([{atomId: "0xagent", label: "Agent 2", caip19: null, ambiguous: true}]);
    });

    it("drops an atom that only claims an identity belonging to another atom", async () => {
        const {agents} = await find([edge(CAIP)], {status: "found", atom: "0xreal" as AgentIdentityAtom});
        expect(agents).toEqual([]);
    });

    it("gives no address when several atoms claim the identity", async () => {
        const {agents} = await find([edge(CAIP)], {status: "ambiguous", reason: "two claimants"});
        expect(agents[0]).toMatchObject({caip19: null, ambiguous: true});
    });

    it("returns nothing and asks nothing for no domain", async () => {
        expect(await findAgentsInDomains([], {graphqlUrl: "unused", inContextOf: "0xc0", chainId: 13579, knownRegistries: [KNOWN]})).toEqual({agents: [], truncated: false});
    });
});

describe("readIpfsJson", () => {
    it("moves to the next gateway when one refuses", async () => {
        const urls: string[] = [];
        const body = await readIpfsJson(
            "ipfs://cid",
            async (url) => {
                urls.push(url);
                return urls.length === 1 ? new Response("no", {status: 429}) : new Response('{"ok":true}');
            },
            1_000,
        );
        expect(body).toEqual({ok: true});
        expect(urls).toEqual(IPFS_GATEWAYS.map((gateway) => `${gateway}cid`));
    });

    it("says what every gateway answered when none serves it", async () => {
        await expect(readIpfsJson("ipfs://cid", async () => new Response("no", {status: 429}), 1_000)).rejects.toThrow(/429.*429/);
    });

    it("refuses anything that is not an ipfs URI", async () => {
        await expect(readIpfsJson("file:///etc/passwd", async () => new Response("{}"), 1_000)).rejects.toThrow("not an ipfs");
    });
});
