import {describe, expect, it, vi} from "vitest";
import type {ToolUsage} from "@arp-protocol/core";

import {isToolAtomId, toolUsageQueryKey, toolUsageQueryOptions} from "../use-tool-usage";

const ATOM = `0x${"ab".repeat(32)}`;

const usage = (edges: ToolUsage["edges"] = []): ToolUsage => ({
    toolAtomId: ATOM,
    label: "IPFS",
    pinnedUri: null,
    edges,
    totals: {
        supportAssets: 0n,
        opposeAssets: 0n,
        supportPositions: 0,
        opposePositions: 0,
    },
    provenance: {sourceId: "intuition", kind: "claim", origin: ATOM},
});

describe("isToolAtomId", () => {
    it("accepts 0x plus 32 bytes, in either case", () => {
        expect(isToolAtomId(ATOM)).toBe(true);
        expect(isToolAtomId(ATOM.toUpperCase().replace("0X", "0x"))).toBe(true);
    });

    it("rejects anything else, so a bad route param is not read as an unused tool", () => {
        // The distinction the page turns on: a malformed id is a broken link, while a well-formed
        // one with no edges is the normal case for ~88,000 atoms. Rendering the first as the second
        // would tell a user their tool has no reputation when the truth is we never looked it up.
        for (const bad of [
            undefined,
            "",
            "0x",
            "42",
            `0x${"ab".repeat(31)}`,
            `0x${"zz".repeat(32)}`,
        ]) {
            expect(isToolAtomId(bad)).toBe(false);
        }
    });
});

describe("toolUsageQueryKey", () => {
    it("keys on the atom id", () => {
        expect(toolUsageQueryKey(ATOM)).toEqual(["erc8004", "tool-usage", ATOM]);
    });

    it("carries no bonding curve, unlike the agent profile's key", () => {
        // `getToolUsage` reads `total_assets` off the term, which is the all-curve aggregate, so
        // there is no single curve this read belongs to. A curve in the key would promise a
        // narrowing that does not happen.
        expect(toolUsageQueryKey(ATOM)).toHaveLength(3);
    });

    it("keys null distinctly, so the disabled query cannot collide with a real one", () => {
        expect(toolUsageQueryKey(null)).toEqual(["erc8004", "tool-usage", null]);
    });
});

describe("toolUsageQueryOptions", () => {
    it("is disabled without an atom, and does not fetch", async () => {
        const fetchUsage = vi.fn(async () => usage());
        const options = toolUsageQueryOptions(null, fetchUsage);
        expect(options.enabled).toBe(false);
        await expect(options.queryFn()).rejects.toThrow("No tool atom to resolve.");
        expect(fetchUsage).not.toHaveBeenCalled();
    });

    it("hands the connector's answer to the view builder", async () => {
        const fetchUsage = vi.fn(async () => usage());
        const view = await toolUsageQueryOptions(ATOM, fetchUsage).queryFn();
        expect(fetchUsage).toHaveBeenCalledWith(ATOM);
        // The hook returns a VIEW, not the raw read: `isEmpty` exists only on the view, so this
        // asserts the mapping happened rather than that the fetch was called.
        expect(view.isEmpty).toBe(true);
        expect(view.toolAtomId).toBe(ATOM);
    });

    it("does not retry, and lets the error surface", async () => {
        const fetchUsage = vi.fn(async () => {
            throw new Error("indexer down");
        });
        const options = toolUsageQueryOptions(ATOM, fetchUsage);
        expect(options.retry).toBe(0);
        await expect(options.queryFn()).rejects.toThrow("indexer down");
    });
});
