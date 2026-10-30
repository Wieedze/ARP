import {describe, expect, it} from "vitest";

import {sigilModulesOf} from "../agent-sigil";
import type {CapabilityGroup} from "../agent-trust";

function group(relation: CapabilityGroup["relation"], entries: unknown[]): CapabilityGroup {
    // The fixture only supplies the three fields the mapper reads; the cast is the narrow shape
    // this module's contract actually depends on.
    return {relation, label: relation, entries: entries as CapabilityGroup["entries"]};
}

const entry = (over: Record<string, unknown>) => ({
    relation: "uses-tool",
    label: null,
    name: null,
    url: null,
    sourceHandle: null,
    ...over,
});

describe("sigilModulesOf", () => {
    it("reads only the uses-tool group", () => {
        const groups = [
            group("implements", [entry({name: "erc8004"})]),
            group("supports-protocol", [entry({name: "mcp"})]),
            group("uses-tool", [entry({name: "ipfs"})]),
        ];
        expect(sigilModulesOf(groups)).toEqual([{name: "ipfs", state: "declared"}]);
    });

    it("is empty when the agent declares no tools, rather than drawing other claims", () => {
        expect(sigilModulesOf([group("has-tag", [entry({name: "ai"})])])).toEqual([]);
        expect(sigilModulesOf([])).toEqual([]);
    });

    it("prefers the term id over the name, so an upstream rename does not redraw the glyph", () => {
        const groups = [group("uses-tool", [entry({name: "ipfs", sourceHandle: "0xabc"})])];
        expect(sigilModulesOf(groups)).toEqual([{name: "0xabc", state: "declared"}]);
    });

    it("falls back to the name, then the label, and drops an entry with neither", () => {
        const groups = [
            group("uses-tool", [
                entry({name: "ipfs"}),
                entry({label: "github"}),
                entry({}),
                entry({name: "   "}),
            ]),
        ];
        expect(sigilModulesOf(groups).map((m) => m.name)).toEqual(["ipfs", "github"]);
    });

    it("drops a duplicate, which would otherwise claim twice the cells for one tool", () => {
        const groups = [
            group("uses-tool", [
                entry({sourceHandle: "0xabc"}),
                entry({sourceHandle: "0xabc", name: "same tool, second edge"}),
            ]),
        ];
        expect(sigilModulesOf(groups)).toHaveLength(1);
    });

    /**
     * The state is `declared` for everything, and this test is the record of why rather than a
     * tautology: `proven` needs a third party's receipt and nothing in this app reads one, so a
     * filled dot would claim a rung of `docs/14`'s ladder this repo cannot reach. When a receipt
     * source arrives, this expectation is what should fail.
     */
    it("marks every module declared, because no receipt source exists yet", () => {
        const groups = [group("uses-tool", [entry({name: "ipfs"}), entry({name: "github"})])];
        expect(sigilModulesOf(groups).every((m) => m.state === "declared")).toBe(true);
    });
});
