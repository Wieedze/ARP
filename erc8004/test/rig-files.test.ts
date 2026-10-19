import {describe, expect, it} from "vitest";

import {TOOLS} from "../../scripts/arp-mcp-tools.js";
import {FILES, dataUri} from "../../scripts/rig-registration-files.js";
import {
    classifyEndpoint,
    partitionByCheckability,
    readDeclaredEndpoints,
} from "../src/verify/declaration.js";

/**
 * The testnet rig's registration files, run through the real classifier.
 *
 * A rig whose fixtures were never checked is the same failure as a fixture set covering one member
 * of a nine-member union — that one let task 15 suppress all nine signature reasons unnoticed. These
 * files will be minted into a registry permanently, so getting the shapes wrong is not cheap: the
 * ids are immutable and `setAgentURI` leaves the old URI in the event log.
 */
const bySlug = (slug: string) => {
    const file = FILES.find((f) => f.slug === slug);
    if (file === undefined) throw new Error(`no rig file named ${slug}`);
    return file;
};

describe("the rig declares what it claims to declare", () => {
    it("uses `services`, not `endpoints`", () => {
        // Measured over 150 random Base ids: `services` 106 occurrences, `endpoints` 2. A rig that
        // used the rarer spelling would exercise a path almost no real agent takes.
        for (const file of FILES) {
            expect(Object.keys(file.doc)).toContain("services");
            expect(Object.keys(file.doc)).not.toContain("endpoints");
            const found = readDeclaredEndpoints(file.doc);
            expect(found.length).toBeGreaterThan(0);
            expect(found.every((e) => e.declaredUnder === "services")).toBe(true);
        }
    });

    it("carries the ERC-8004 registration type every real document carries", () => {
        for (const file of FILES) {
            expect(file.doc["type"]).toBe(
                "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
            );
        }
    });

    it("encodes to a `data:` URI with no hosting obligation", () => {
        // 18 of the sampled mainnet agents do it this way. A pinned file would need a CID that is
        // actually valid, and 18 permanent testnet atoms already exist for strings that are not
        // CIDs (tasks/20 appendix).
        for (const file of FILES) {
            const uri = dataUri(file.doc);
            expect(uri.startsWith("data:application/json;base64,")).toBe(true);
            const decoded = JSON.parse(
                Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64").toString("utf8"),
            );
            expect(decoded).toEqual(file.doc);
        }
    });
});

describe("each rig file exercises the group it claims", () => {
    it("rig-confirmed declares one probeable MCP endpoint, with capabilities", () => {
        const endpoints = readDeclaredEndpoints(bySlug("rig-confirmed").doc);
        expect(endpoints).toHaveLength(1);
        expect(endpoints[0].protocol).toBe("mcp");
        expect(endpoints[0].classification.status).toBe("probeable");
        // Capabilities are the rare case: 0 of 112 real documents declared any, so this is the only
        // place the declared-against-served comparison can be exercised at all.
        expect(endpoints[0].capabilities.length).toBeGreaterThan(0);
    });

    it("rig-dead declares a probeable endpoint that is guaranteed to time out", () => {
        // 192.0.2.1 is TEST-NET-1, which RFC 5737 reserves for documentation and guarantees is
        // never routable — so the connection always times out and the verdict is `confirmed/dead`.
        //
        // An earlier draft used a `.invalid` hostname. Measured: that fails DNS resolution, Bun
        // reports it identically to a broken local network, and the prober correctly returned
        // `inconclusive/transport-error`. **The fixture was wrong, not the prober** — and no
        // structural test could have caught it, because the claim was about an outcome that needs a
        // network call. Running the gate is what caught it.
        const endpoints = readDeclaredEndpoints(bySlug("rig-dead").doc);
        expect(endpoints).toHaveLength(1);
        expect(endpoints[0].classification.status).toBe("probeable");
        expect(endpoints[0].classification).toMatchObject({
            url: expect.stringContaining("192.0.2.1"),
        });
        // Not `.invalid`: a DNS failure is indistinguishable from our own network being down.
        expect(JSON.stringify(bySlug("rig-dead").doc)).not.toContain("does-not-exist.invalid");
    });

    it("rig-unprobeable declares only endpoints that must never be called a defect", () => {
        const endpoints = readDeclaredEndpoints(bySlug("rig-unprobeable").doc);
        const {probeable, notCheckable} = partitionByCheckability(endpoints);
        expect(probeable).toEqual([]);
        expect(notCheckable).toHaveLength(2);
        expect(notCheckable.map((e) => e.classification.status)).toEqual([
            "not-checkable",
            "not-checkable",
        ]);
        // One of each shape, because they are 76% and 7% of real declared endpoints respectively.
        const codes = notCheckable.map((e) =>
            e.classification.status === "not-checkable" ? e.classification.code : null,
        );
        expect(codes).toContain("templated");
        expect(codes).toContain("non-http-identifier");
    });

    it("covers every classification the verifier can produce without a network call", () => {
        // The rig's reason for existing: before this, the discovery path ran against two agents with
        // an empty tokenURI, so none of these branches was reachable on testnet at all.
        const all = FILES.flatMap((f) => readDeclaredEndpoints(f.doc));
        const statuses = new Set(all.map((e) => e.classification.status));
        expect([...statuses].sort()).toEqual(["not-checkable", "probeable"]);
        const protocols = new Set(all.map((e) => e.protocol));
        expect(protocols.has("mcp")).toBe(true);
        expect(protocols.has("a2a")).toBe(true);
        expect(protocols.has(null)).toBe(true);
    });
});

describe("the rig's own endpoint values are classified as intended", () => {
    it("the templated A2A URL is templated, and names its placeholder", () => {
        const endpoints = readDeclaredEndpoints(bySlug("rig-unprobeable").doc);
        const a2a = endpoints.find((e) => e.protocol === "a2a");
        expect(a2a?.classification).toMatchObject({code: "templated", placeholder: "{agentId}"});
    });

    it("the CAIP-10 wallet value is an identifier, not a broken URL", () => {
        const c = classifyEndpoint("eip155:13579:0xE596096F4176b682E300d73963e7B04B383C1AA1");
        expect(c).toMatchObject({status: "not-checkable", code: "non-http-identifier"});
    });
});

describe("a rig file does not contradict itself", () => {
    /**
     * These three assertions exist because the fixture nearly shipped with all three wrong.
     *
     * `rig-confirmed` had been pointed at ARP's own MCP server, but its `description` still said the
     * endpoint was "borrowed from 8453:26183 (nebula-scan) because ARP runs no MCP server of its
     * own", and its `capabilities` still listed nebula-scan's three tools. The structural tests above
     * all passed: the shape was right and every claim in the prose was false.
     *
     * The ids are permanent once minted, so a self-contradicting file is not a thing to fix later.
     */
    it("does not name a borrowed endpoint it no longer uses", () => {
        for (const file of FILES) {
            const prose = String(file.doc["description"]);
            const endpoints = readDeclaredEndpoints(file.doc).map((e) =>
                e.classification.status === "probeable"
                    ? e.classification.declared
                    : e.classification.declared,
            );
            for (const borrowed of ["nebula-scan", "8453:26183", "borrowed from"]) {
                // Mentioning it is only wrong if nothing actually points there any more.
                const stillPointsThere = endpoints.some((url) => url.includes("nebula-scan"));
                if (!stillPointsThere) expect(prose).not.toContain(borrowed);
            }
        }
    });

    it("declares only capabilities the server it points at actually serves", () => {
        // A fixture claiming tools the server does not serve is a `declared ≠ served` mismatch the
        // verifier would report — against ARP's own rig, which would be an own goal.
        const served = new Set(TOOLS.map((t) => t.name));
        for (const file of FILES) {
            for (const endpoint of readDeclaredEndpoints(file.doc)) {
                if (endpoint.capabilities.length === 0) continue;
                const url =
                    endpoint.classification.status === "probeable"
                        ? endpoint.classification.url
                        : "";
                if (!url.includes("localhost") && !url.includes("127.0.0.1")) continue;
                for (const declared of endpoint.capabilities) {
                    expect(served).toContain(declared);
                }
            }
        }
    });

    it("says the endpoint is local when it is", () => {
        for (const file of FILES) {
            const isLocal = readDeclaredEndpoints(file.doc).some(
                (e) =>
                    e.classification.status === "probeable" &&
                    /localhost|127\.0\.0\.1/.test(e.classification.url),
            );
            if (!isLocal) continue;
            // A reader of the registry has to be able to tell a fixture from a service.
            expect(String(file.doc["description"]).toLowerCase()).toContain("local");
        }
    });
});
