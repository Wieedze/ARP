import {describe, expect, it} from "vitest";

import {
    classifyEndpoint,
    partitionByCheckability,
    readDeclaredEndpoints,
} from "../src/verify/declaration.js";

/**
 * Every value in this file was observed on the live Base registry on 2026-10-16, with the token id
 * it came from. Invented endpoint strings would not have caught the thing that matters here — that
 * the common spelling is `services` and not `endpoints` — because an invented fixture would have
 * used whichever key the author already believed in.
 */

/** Agent 8453:2340 (Clawnch) — the `endpoints` spelling, with declared capabilities. */
const CLAWNCH = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "🦞 Clawnch 🦞",
    endpoints: [
        {
            name: "mcp",
            endpoint: "https://clawn.ch/api/mcp",
            version: "2025-11-03",
            capabilities: [
                "clawnch_get_skill",
                "clawnch_launch_token",
                "clawnch_upload_image",
                "clawnch_list_launches",
                "clawnch_get_stats",
                "clawnch_check_rate_limit",
            ],
        },
        {name: "a2a", endpoint: "https://clawn.ch/api/a2a"},
    ],
};

/** Agent 8453:77000 (Termix) — the `services` spelling, and both URLs templated. */
const TERMIX = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "sparktoolrl0.agent",
    services: [
        {
            name: "A2A",
            endpoint:
                "https://platform-backend-base.prod.termix.live/api/v1/a2a/agents/{agentId}/card",
            version: "0.3.0",
        },
        {
            name: "Termix Platform",
            endpoint:
                "https://platform-backend-base.prod.termix.live/api/v1/agents/{agentId}/services",
            version: "aacp-platform-v1",
        },
    ],
    registrations: [],
};

/** Agent 8453:51722 — non-HTTP identifiers under `wallet` and `ens`. Legitimate, not defects. */
const IDENTIFIERS = {
    services: [
        {name: "wallet", endpoint: "eip155:8453:0xe157F1F5e12adB38Ba013683E9Ce24efe21e5bA6"},
        {name: "ens", endpoint: "thethclup999.base.eth"},
        {name: "mcp", endpoint: "https://gmchain.vercel.app/api/mcp"},
    ],
};

describe("classifyEndpoint", () => {
    it("accepts an http(s) URL and normalises it once", () => {
        const c = classifyEndpoint("https://clawn.ch/api/mcp");
        expect(c.status).toBe("probeable");
        if (c.status !== "probeable") return;
        expect(c.url).toBe("https://clawn.ch/api/mcp");
        expect(c.declared).toBe("https://clawn.ch/api/mcp");
    });

    it("declines a templated URL and names the placeholder", () => {
        const c = classifyEndpoint(
            "https://platform-backend-base.prod.termix.live/api/v1/a2a/agents/{agentId}/card",
        );
        expect(c.status).toBe("not-checkable");
        if (c.status !== "not-checkable") return;
        expect(c.code).toBe("templated");
        expect(c.placeholder).toBe("{agentId}");
    });

    it("declines a CAIP address and an ENS name without calling either a failure", () => {
        for (const value of [
            "eip155:8453:0xe157F1F5e12adB38Ba013683E9Ce24efe21e5bA6",
            "thethclup999.base.eth",
            "support@enkazweb.com",
        ]) {
            const c = classifyEndpoint(value);
            expect(c.status).toBe("not-checkable");
            if (c.status !== "not-checkable") continue;
            expect(c.code).toBe("non-http-identifier");
        }
    });

    it("declines an absent, blank or non-string value", () => {
        for (const value of [undefined, null, "", "   ", 42, {}]) {
            const c = classifyEndpoint(value);
            expect(c.status).toBe("not-checkable");
            if (c.status !== "not-checkable") continue;
            expect(c.code).toBe("empty");
        }
    });

    it("separates a malformed http value from an identifier", () => {
        // Claims the scheme but `new URL()` rejects it. Unlike a template or a CAIP address this
        // *is* a fact about the document, so it gets its own code rather than being lumped in.
        const c = classifyEndpoint("https://");
        expect(c.status).toBe("not-checkable");
        if (c.status !== "not-checkable") return;
        expect(c.code).toBe("unparseable-url");
    });

    it("never returns a boolean-shaped verdict", () => {
        // The shape is the safeguard: 82% of real endpoints are not-checkable, and an `ok: false`
        // would render "we cannot check this" as "this is broken".
        const c = classifyEndpoint("thethclup999.base.eth");
        expect(c).not.toHaveProperty("ok");
        expect(["probeable", "not-checkable"]).toContain(c.status);
    });
});

describe("readDeclaredEndpoints", () => {
    it("reads the `endpoints` spelling, with its capabilities and protocol", () => {
        const found = readDeclaredEndpoints(CLAWNCH);
        expect(found).toHaveLength(2);
        expect(found[0].declaredUnder).toBe("endpoints");
        expect(found[0].protocol).toBe("mcp");
        expect(found[0].capabilities).toHaveLength(6);
        expect(found[0].version).toBe("2025-11-03");
        expect(found[1].protocol).toBe("a2a");
        expect(found[1].capabilities).toEqual([]);
    });

    it("reads the `services` spelling, which is the common one", () => {
        // Measured 2026-10-16 over 150 random ids: `services` 106 occurrences, `endpoints` 2. A
        // verifier reading only `endpoints` reports almost nothing cohort-wide, which was a real
        // bug while measuring.
        const found = readDeclaredEndpoints(TERMIX);
        expect(found).toHaveLength(2);
        expect(found.every((e) => e.declaredUnder === "services")).toBe(true);
        expect(found.map((e) => e.classification.status)).toEqual([
            "not-checkable",
            "not-checkable",
        ]);
    });

    it("matches the protocol case-insensitively, since documents use both", () => {
        // Clawnch writes `mcp`, Termix writes `A2A`.
        expect(readDeclaredEndpoints(TERMIX)[0].protocol).toBe("a2a");
        expect(readDeclaredEndpoints(TERMIX)[0].name).toBe("A2A");
    });

    it("leaves `protocol` null for a name with no handshake to perform", () => {
        const found = readDeclaredEndpoints(TERMIX);
        expect(found[1].name).toBe("Termix Platform");
        expect(found[1].protocol).toBeNull();
    });

    it("reads the nested `registrations[].endpoints` spelling", () => {
        const found = readDeclaredEndpoints({
            registrations: [{endpoints: [{name: "mcp", endpoint: "https://example.test/mcp"}]}, {}],
        });
        expect(found).toHaveLength(1);
        expect(found[0].declaredUnder).toBe("registrations[].endpoints");
    });

    it("returns an empty array for a document that declares nothing", () => {
        // 22 of 68 parsed documents in the sample. Not a defect, and deliberately not a
        // synthesised failure row: a reader must tell "nothing to probe" from "probe failed".
        expect(readDeclaredEndpoints({name: "bare", description: ""})).toEqual([]);
        expect(readDeclaredEndpoints({services: [], endpoints: []})).toEqual([]);
    });

    it("survives documents that are not objects, or whose entries are not objects", () => {
        for (const document of [null, undefined, "{}", 7, []]) {
            expect(readDeclaredEndpoints(document)).toEqual([]);
        }
        expect(readDeclaredEndpoints({services: ["https://example.test", null, 3]})).toEqual([]);
    });
});

describe("partitionByCheckability", () => {
    it("keeps the two groups apart on a document that mixes them", () => {
        const {probeable, notCheckable} = partitionByCheckability(
            readDeclaredEndpoints(IDENTIFIERS),
        );
        expect(probeable.map((e) => e.name)).toEqual(["mcp"]);
        expect(notCheckable.map((e) => e.name)).toEqual(["wallet", "ens"]);
    });

    it("puts every endpoint in exactly one group", () => {
        const all = readDeclaredEndpoints(IDENTIFIERS);
        const {probeable, notCheckable} = partitionByCheckability(all);
        expect(probeable.length + notCheckable.length).toBe(all.length);
    });
});
