import {decodeFunctionData, type Hex} from "viem";
import {describe, expect, it} from "vitest";

import {multiVaultDeclareAbi} from "../src/declare/multivault.js";
import {isUsageOutcome, prepareUsageContext} from "../src/declare/usage-context.js";
import {atomIdFor, fakeReads} from "./helpers.js";

const EDGE = `0x${"ab".repeat(32)}` as Hex;
const IN_CONTEXT_OF = `0x${"cd".repeat(32)}` as Hex;
const isCategory = async (label: string) => label === "video";

function plan(existing: Hex[], extra: Partial<Parameters<typeof prepareUsageContext>[0]> = {}) {
    return prepareUsageContext({
        usesTripleId: EDGE,
        inContextOf: IN_CONTEXT_OF,
        isCategory,
        reads: fakeReads({existing: new Set(existing.map((id) => id.toLowerCase())), chainId: 13579, atomCost: 10n, tripleCost: 20n, minDeposit: 1n}),
        ...extra,
    });
}

describe("prepareUsageContext", () => {
    it("refuses a call with nothing to add", async () => {
        expect(await plan([EDGE])).toMatchObject({status: "refused", rule: "nothing_to_add"});
    });

    it("refuses an edge that is neither on chain nor planned", async () => {
        expect(await plan([], {domain: "video"})).toMatchObject({status: "refused", rule: "not_declared"});
    });

    it("refuses a domain outside the tree, so free text never reaches the chain", async () => {
        expect(await plan([EDGE], {domain: "montage de ma vidéo de mariage"})).toMatchObject({
            status: "refused",
            rule: "unknown_domain",
        });
    });

    it("creates only the triple when the category exists", async () => {
        const video = atomIdFor("video");
        const result = await plan([EDGE, video], {domain: "Video "});
        expect(result.status).toBe("planned");
        if (result.status !== "planned") return;
        expect(result.calls.map((call) => call.kind)).toEqual(["create-triple"]);
        expect(result.calls[0]?.value).toBe(21n);
        const decoded = decodeFunctionData({abi: multiVaultDeclareAbi, data: result.calls[0]?.data ?? "0x"});
        expect(decoded.args?.[0]).toEqual([EDGE]);
        expect(decoded.args?.[1]).toEqual([IN_CONTEXT_OF]);
        expect(decoded.args?.[2]).toEqual([video]);
    });

    it("creates the outcome's words the first time, before the triple that needs them", async () => {
        const result = await plan([EDGE], {outcome: "failed"});
        expect(result.status).toBe("planned");
        if (result.status !== "planned") return;
        expect(result.calls.map((call) => call.kind)).toEqual(["create-atom", "create-atom", "create-triple"]);
        expect(result.totalValue).toBe(11n + 11n + 21n);
    });

    it("plans nothing when everything is already on chain", async () => {
        const first = await plan([EDGE], {outcome: "worked"});
        if (first.status !== "planned" || first.outcomeTripleId === null) throw new Error("expected a plan");
        const again = await plan(
            [EDGE, atomIdFor("has outcome"), atomIdFor("worked"), first.outcomeTripleId],
            {outcome: "worked"},
        );
        expect(again).toMatchObject({status: "planned", calls: [], totalValue: 0n});
    });

    it("accepts an edge created earlier in the same plan", async () => {
        const result = await plan([], {outcome: "worked", edgePlanned: true});
        expect(result.status).toBe("planned");
    });

    it("has two outcomes and no third", () => {
        expect(isUsageOutcome("failed")).toBe(true);
        expect(isUsageOutcome("works sometimes")).toBe(false);
    });
});
