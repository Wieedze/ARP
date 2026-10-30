import type {GraphqlTransport} from "@arp-protocol/graphql";
import {describe, expect, it} from "vitest";

import {resolveIdentityAtomStrict} from "../src/declare/resolve-subject.js";
import {intuitionSource} from "../src/sources/intuition/index.js";

const REGISTRY = "0xc165a2adc0000000000000000000000000000001";
const AGENT = {chainId: 13579, tokenId: "7", registry: REGISTRY} as const;
const A = `0x${"5b".repeat(32)}`;
const B = `0x${"5c".repeat(32)}`;

/** The `same as` read answers with these subjects, in this order; nothing else is asked. */
function source(subjects: string[]) {
    const transport: GraphqlTransport = {
        request: async () => ({
            triples: subjects.map((term_id) => ({subject: {term_id, label: "agent", data: null}})),
        }),
    };
    return intuitionSource({transport});
}

describe("resolveIdentityAtomStrict", () => {
    it("finds the one atom that claims the identity", async () => {
        expect(await resolveIdentityAtomStrict({agent: AGENT, source: source([A])})).toEqual({
            status: "found",
            atom: A,
        });
    });

    it("answers none when no atom claims it", async () => {
        expect(await resolveIdentityAtomStrict({agent: AGENT, source: source([])})).toEqual({
            status: "none",
        });
    });

    it("refuses to pick when a second atom also claims it through `same as`", async () => {
        const verdict = await resolveIdentityAtomStrict({agent: AGENT, source: source([A, B])});
        expect(verdict.status).toBe("ambiguous");
        expect(verdict.status === "ambiguous" && verdict.reason).toContain(B);
    });
});
