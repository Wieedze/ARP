import {describe, expect, it} from "vitest";

import {
    buildRegistrationFile,
    registrationUriBytes,
    REGISTRATION_V1_TYPE,
    serialiseRegistrationFile,
    toRegistrationDataUri,
    toRegistrationUrl,
} from "../src/registration-file.js";

const REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

const base = {name: "Slither", chainId: 8453, registry: REGISTRY} as const;

describe("buildRegistrationFile", () => {
    it("carries the discriminator the ecosystem reads", () => {
        // Probed off agent 1 on Base, 2026-10-27. Not a version we chose: it is how a reader knows
        // what the document is.
        const file = buildRegistrationFile(base);
        expect(file.type).toBe(REGISTRATION_V1_TYPE);
        expect(file.type).toBe("https://eips.ethereum.org/EIPS/eip-8004#registration-v1");
    });

    it("refuses an unnamed identity, which is the whole reason it exists", () => {
        // `register()` with no argument already mints one of those — agents 6649 and 500000 on
        // Base are in exactly that state, and they render as `Agent 8453:6649`. Building a file
        // that reproduces the problem would be worse than not building one.
        for (const name of ["", "   ", "\n"]) {
            expect(() => buildRegistrationFile({...base, name})).toThrow(/needs a name/);
        }
    });

    it("omits what was not answered rather than publishing an empty string", () => {
        const file = buildRegistrationFile(base);
        expect(file.description).toBeNull();
        expect(file.image).toBeNull();
        expect(file.services).toEqual([]);

        const json = JSON.parse(serialiseRegistrationFile(file)) as Record<string, unknown>;
        expect("description" in json).toBe(false);
        expect("image" in json).toBe(false);
    });

    it("treats a whitespace-only field as unanswered", () => {
        const file = buildRegistrationFile({...base, description: "  ", webEndpoint: " "});
        expect(file.description).toBeNull();
        expect(file.services).toEqual([]);
    });

    it("emits the endpoint as the `web` service, which is the shape in the wild", () => {
        const file = buildRegistrationFile({...base, webEndpoint: "https://slither.dev"});
        expect(file.services).toEqual([{name: "web", endpoint: "https://slither.dev"}]);
    });

    it("keeps extra services and drops malformed ones", () => {
        const file = buildRegistrationFile({
            ...base,
            webEndpoint: "https://slither.dev",
            services: [
                {name: "mcp", endpoint: "https://slither.dev/mcp"},
                {name: "", endpoint: "https://nameless"},
                {name: "email", endpoint: "  "},
            ],
        });
        expect(file.services).toEqual([
            {name: "web", endpoint: "https://slither.dev"},
            {name: "mcp", endpoint: "https://slither.dev/mcp"},
        ]);
    });

    it("names its own registry as a CAIP-style entry with a null id", () => {
        // A fresh mint cannot know its id — the registry assigns it in the same call that reads
        // this document. Agent 1's own file does the same for its Base entry, so null is the
        // convention rather than a gap.
        const file = buildRegistrationFile(base);
        expect(file.registrations).toEqual([
            {agentId: null, agentRegistry: `eip155:8453:${REGISTRY}`},
        ]);
    });

    it("carries the id when the file is written after the mint", () => {
        const file = buildRegistrationFile({...base, agentId: 1_137_885});
        expect(file.registrations[0]?.agentId).toBe(1_137_885);
    });

    it("claims nothing it cannot support", () => {
        // `x402Support` is a claim about a payment surface a fresh agent does not have, and
        // `supportedTrust` says which trust models it accepts. `reputation` is what every probed
        // agent carries and what ARP itself reads.
        const file = buildRegistrationFile(base);
        expect(file.x402Support).toBe(false);
        expect(file.supportedTrust).toEqual(["reputation"]);
        expect(file.active).toBe(true);
    });
});

describe("toRegistrationDataUri", () => {
    it("produces the on-chain form agents 1 and 2340 carry", () => {
        const uri = toRegistrationDataUri(buildRegistrationFile(base));
        expect(uri.startsWith("data:application/json;base64,")).toBe(true);

        const decoded = JSON.parse(
            Buffer.from(uri.split("base64,")[1] ?? "", "base64").toString("utf8"),
        ) as {name: string; type: string};
        expect(decoded.name).toBe("Slither");
        expect(decoded.type).toBe(REGISTRATION_V1_TYPE);
    });

    it("survives a name outside Latin-1, which is an ordinary case here", () => {
        // Agent 2340 on Base is literally `🦞 Clawnch 🦞`. `btoa` throws on any code point above
        // 0xFF, so the bytes are UTF-8 encoded first — this is the test that would have caught it.
        const uri = toRegistrationDataUri(buildRegistrationFile({...base, name: "🦞 Clawnch 🦞"}));
        const decoded = JSON.parse(
            Buffer.from(uri.split("base64,")[1] ?? "", "base64").toString("utf8"),
        ) as {name: string};
        expect(decoded.name).toBe("🦞 Clawnch 🦞");
    });

    it("round-trips a description with quotes and newlines", () => {
        const description = 'He said "no".\nThen left.';
        const uri = toRegistrationDataUri(buildRegistrationFile({...base, description}));
        const decoded = JSON.parse(
            Buffer.from(uri.split("base64,")[1] ?? "", "base64").toString("utf8"),
        ) as {description: string};
        expect(decoded.description).toBe(description);
    });
});

describe("registrationUriBytes", () => {
    it("counts bytes, not characters, because the gas is bytes", () => {
        expect(registrationUriBytes("abc")).toBe(3);
        // One emoji is four bytes of storage and one character on screen. A caller pricing a mint
        // off `.length` would under-report it.
        expect(registrationUriBytes("🦞")).toBe(4);
        expect("🦞".length).toBe(2);
    });
});

describe("toRegistrationUrl", () => {
    it("passes a hosted URL through, trimmed", () => {
        // The other trade-off, and it is in use: agent 1100000 on Base points at
        // `https://centralcity.ai/a/L8Blf4`. Cheaper gas, and it can stop resolving.
        expect(toRegistrationUrl("  https://centralcity.ai/a/L8Blf4 ")).toBe(
            "https://centralcity.ai/a/L8Blf4",
        );
    });

    it("refuses an empty one rather than minting a URI that points nowhere", () => {
        expect(() => toRegistrationUrl("   ")).toThrow(/needs a URL/);
    });
});
