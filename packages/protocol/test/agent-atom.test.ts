import {describe, expect, it} from "vitest";

import {
    canonicalAgentThing,
    canonicalCaipThing,
    thingDocument,
    thingUri,
} from "../src/declare/agent-atom.js";

/**
 * The fixture is not invented: agent 8453:6649's atom was minted by Intuition's own ingestion, its
 * `data` field read off mainnet 2026-10-20, and the 171 bytes behind the CID retrieved from a
 * third-party IPFS gateway. So these tests assert against the ecosystem, not against ourselves.
 */
const FIXTURE = {
    chainId: 8453,
    tokenId: "6649",
    uri: "ipfs://bafkreif6xwptjdsux2iwnhdbxyjom23bzzimhk62y574rreexdghi6hlbq",
    bytes: '{"@context":"https://schema.org","@type":"Thing","description":"ERC-8004 agent 8453:6649","image":"","name":"Agent 8453:6649","url":"https://8004scan.io/agents/8453/6649"}',
} as const;

describe("the canonical agent atom", () => {
    it("reproduces the exact document Intuition pinned", () => {
        const document = thingDocument(canonicalAgentThing(FIXTURE.chainId, FIXTURE.tokenId));
        expect(document).toBe(FIXTURE.bytes);
        expect(new TextEncoder().encode(document).length).toBe(171);
    });

    it("recomputes the CID that is on chain, with no network and no key", () => {
        expect(thingUri(canonicalAgentThing(FIXTURE.chainId, FIXTURE.tokenId))).toBe(FIXTURE.uri);
    });

    it("keeps the fallbacks, because they are part of the frozen recipe", () => {
        const thing = canonicalAgentThing(13579, "3");
        expect(thing).toEqual({
            name: "Agent 13579:3",
            description: "ERC-8004 agent 13579:3",
            image: "",
            url: "https://8004scan.io/agents/13579/3",
        });
    });

    it("prefers a registration's own fields, and treats blank as absent", () => {
        const thing = canonicalAgentThing(8453, "1", {
            name: "  Auditor  ",
            description: "   ",
            webEndpoint: "https://auditor.example",
        });
        expect(thing.name).toBe("Auditor");
        expect(thing.description).toBe("ERC-8004 agent 8453:1");
        expect(thing.url).toBe("https://auditor.example");
    });

    it("sorts keys, so a differing order cannot produce a second atom", () => {
        expect(thingDocument({name: "n", description: "d", image: "i", url: "u"})).toBe(
            '{"@context":"https://schema.org","@type":"Thing","description":"d","image":"i","name":"n","url":"u"}',
        );
    });

    it("gives the CAIP Thing the fixed description the resolver depends on", () => {
        const caip = "eip155:8453/erc721:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/6649";
        const thing = canonicalCaipThing(caip);
        expect(thing.name).toBe(caip);
        expect(thing.description).toContain("CAIP-style external identifier atom");
        expect(thing.url).toBe("");
    });

    it("recomputes the CAIP atom's on-chain CID too — the second half of the `same as` edge", () => {
        // Read off mainnet 2026-10-20: the object of agent 8453:6649's `same as` triple. A second,
        // independent fixture, because one matching CID could be a coincidence of one recipe.
        const caip = "eip155:8453/erc721:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/6649";
        expect(thingUri(canonicalCaipThing(caip))).toBe(
            "ipfs://bafkreiagjji27tchqekmrvpl4u5fneb3ua6fkqj34ab3msnqskb3pqjo64",
        );
    });

    it("gives two different agents two different atoms", () => {
        expect(thingUri(canonicalAgentThing(8453, "1"))).not.toBe(
            thingUri(canonicalAgentThing(8453, "2")),
        );
    });
});
