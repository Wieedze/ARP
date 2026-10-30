import {describe, expect, it} from "bun:test";

import {TOOLS} from "../../apps/mcp/src/tools.js";
import {
    classifyEndpoint,
    type EndpointClassification,
    type NotCheckableCode,
    partitionByCheckability,
    readDeclaredEndpoints,
} from "../../packages/protocol/src/index.js";
import {FILES, OWN_ENDPOINT, dataUri} from "../rig-registration-files.js";

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
        // Capabilities are the rare case: 0 of ~110 parsed documents across repeated n=200 samples (scripts/measure/cohort-skills.ts; the zero is stable, the denominator varies with the sample), so this is the only
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
            // `declared` is on both members of the union, so no narrowing is needed.
            const endpoints = readDeclaredEndpoints(file.doc).map((e) => e.classification.declared);
            // Hoisted: it does not depend on which string is being checked.
            const stillPointsThere = endpoints.some((url) => url.includes("nebula-scan"));
            if (stillPointsThere) continue;
            for (const borrowed of ["nebula-scan", "8453:26183", "borrowed from"]) {
                expect(prose).not.toContain(borrowed);
            }
        }
    });

    it("declares only capabilities the server it points at actually serves", () => {
        // A fixture claiming tools the server does not serve is a `declared ≠ served` mismatch the
        // verifier would report — against ARP's own rig, which would be an own goal.
        //
        // Keyed on OWN_ENDPOINT, not on the substring "localhost". The first version skipped unless
        // the URL contained localhost, so setting ARP_MCP_ENDPOINT — the change this repo's own
        // comment tells the next person to make — silently turned it into a no-op that still
        // reported green. Measured: 0 assertions executed under a public URL.
        const served = new Set<string>(TOOLS.map((t) => t.name));
        let checked = 0;
        for (const file of FILES) {
            for (const endpoint of readDeclaredEndpoints(file.doc)) {
                if (endpoint.capabilities.length === 0) continue;
                if (endpoint.classification.declared !== OWN_ENDPOINT) continue;
                for (const declared of endpoint.capabilities) {
                    expect(served).toContain(declared);
                    checked += 1;
                }
            }
        }
        // A test that verifies nothing must not report green.
        expect(checked).toBeGreaterThan(0);
    });

    it("describes its endpoint's locality in both directions", () => {
        // Asserted both ways rather than skipped when not local. The first version only checked the
        // local case, so a public endpoint made it vacuous — and the failure mode it guards against
        // is a description that stops matching the endpoint, which is exactly what happens when the
        // endpoint changes.
        const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(OWN_ENDPOINT);
        let checked = 0;
        for (const file of FILES) {
            const pointsAtOurs = readDeclaredEndpoints(file.doc).some(
                (e) => e.classification.declared === OWN_ENDPOINT,
            );
            if (!pointsAtOurs) continue;
            const prose = String(file.doc["description"]).toLowerCase();
            // A reader of the registry has to be able to tell a fixture from a service.
            if (isLocal) expect(prose).toContain("local");
            else expect(prose).toContain("regenerate");
            checked += 1;
        }
        expect(checked).toBeGreaterThan(0);
    });
});

describe("`exercises` is checked against the classifier, not trusted as prose", () => {
    /**
     * The field that was wrong.
     *
     * `rig-dead.exercises` claimed `confirmed/dead` while the real outcome was
     * `inconclusive/transport-error`, and `deployments/13579.json` copied the string verbatim. Every
     * structural test passed, because they checked the shape and not the claim.
     *
     * **What these close, precisely**: the checkability axis — `probeable` against `not-checkable` —
     * and, inside `not-checkable`, the code. That is everything derivable from the document alone.
     *
     * **What they do NOT close**: `confirmed` against `inconclusive`. Both are `probeable` before a
     * request is sent, so no unit test can tell them apart — and *the mutation that actually
     * shipped lived exactly there*. Measured: flipping `rig-dead`'s claim between `confirmed/dead`
     * and `inconclusive/transport-error` leaves this suite green.
     *
     * `scripts/verify-rig-claims.ts` closes that family by reading the gate's report, because the
     * probe is the only authority on it. Reporting these tests as closing "the class" was wrong by
     * one level.
     */
    /**
     * The **checkability** a claim implies — not "the statuses claimed", which is how the
     * overstatement happened.
     *
     * It maps `ProbeOutcome.status` names (`confirmed` / `inconclusive` / `not-checkable`) onto
     * `EndpointClassification["status"]` values (`probeable` / `not-checkable`). Two different
     * enums, and `confirmed` and `inconclusive` both land on `probeable` **by design** — a unit
     * test cannot tell them apart before a request is sent. The return type says so.
     *
     * What this does catch, and it is worth keeping cheap: a file claiming a probe outcome for an
     * endpoint that will never be probed. Measured — `rig-unprobeable: "confirmed/dead"` fails here.
     */
    const checkabilityImpliedByClaim = (
        exercises: string,
    ): Set<EndpointClassification["status"]> => {
        const claimed = new Set<EndpointClassification["status"]>();
        if (/\bnot-checkable\b/.test(exercises)) claimed.add("not-checkable");
        if (/\bconfirmed\b/.test(exercises)) claimed.add("probeable");
        if (/\binconclusive\b/.test(exercises)) claimed.add("probeable");
        return claimed;
    };

    it("every status a file claims is one its endpoints actually classify as", () => {
        for (const file of FILES) {
            const actual = new Set(
                readDeclaredEndpoints(file.doc).map((e) => e.classification.status),
            );
            for (const claimed of checkabilityImpliedByClaim(file.exercises)) {
                expect(actual, `${file.slug} claims ${claimed}`).toContain(claimed);
            }
        }
    });

    it("every file claims at least one status, so the field cannot be decorative", () => {
        for (const file of FILES) {
            expect(checkabilityImpliedByClaim(file.exercises).size, file.slug).toBeGreaterThan(0);
        }
    });

    it("a file claiming a not-checkable code names one the classifier can return", () => {
        // A `Record` keyed by the union, not an array: `satisfies readonly NotCheckableCode[]`
        // checks assignability, NOT exhaustiveness, so a fifth member would pass it and then be
        // silently skipped by the `continue` below. Measured — the array form did not catch a
        // grown union. The Record does, because a missing key is a type error.
        const codes = Object.keys({
            templated: true,
            "non-http-identifier": true,
            "unparseable-url": true,
            empty: true,
        } satisfies Record<NotCheckableCode, true>) as NotCheckableCode[];
        for (const file of FILES) {
            const named = codes.filter((c) => file.exercises.includes(c));
            if (named.length === 0) continue;
            const actual = readDeclaredEndpoints(file.doc).flatMap((e) =>
                e.classification.status === "not-checkable" ? [e.classification.code] : [],
            );
            for (const code of named) expect(actual, `${file.slug} claims ${code}`).toContain(code);
        }
    });
});
