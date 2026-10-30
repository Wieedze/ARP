import {describe, expect, it} from "vitest";

import {getTermLabels} from "../src/term-labels.js";

function transportOf(terms: unknown[]) {
    const seen: Record<string, unknown>[] = [];
    return {
        seen,
        transport: {
            async request(_query: string, variables: Record<string, unknown>) {
                seen.push(variables);
                return {terms};
            },
        },
    };
}

describe("getTermLabels", () => {
    it("names an atom by its label and a triple by its three, keyed lower-case", async () => {
        const {transport, seen} = transportOf([
            {id: "0xAA", atom: {label: " Agent 13579:8 "}, triple: null},
            {
                id: "0xbb",
                atom: null,
                triple: {
                    subject: {label: "Agent 13579:8"},
                    predicate: {label: "uses"},
                    object: {label: "brainstorming"},
                },
            },
        ]);
        const labels = await getTermLabels(["0xAA", "0xaa", "0xBB"], {graphqlUrl: "x", transport});
        expect(seen[0]).toEqual({ids: ["0xaa", "0xbb"]});
        expect(labels.get("0xaa")).toEqual({kind: "atom", label: "Agent 13579:8"});
        expect(labels.get("0xbb")).toEqual({
            kind: "triple",
            subject: "Agent 13579:8",
            predicate: "uses",
            object: "brainstorming",
        });
    });

    it("leaves out what the indexer does not know, and asks nothing for no ids", async () => {
        const {transport, seen} = transportOf([
            {
                id: "0xcc",
                atom: null,
                triple: {subject: {label: "a"}, predicate: null, object: {label: "b"}},
            },
            "junk",
        ]);
        expect((await getTermLabels(["0xcc"], {graphqlUrl: "x", transport})).size).toBe(0);
        expect((await getTermLabels([], {graphqlUrl: "x", transport})).size).toBe(0);
        expect(seen).toHaveLength(1);
    });
});
