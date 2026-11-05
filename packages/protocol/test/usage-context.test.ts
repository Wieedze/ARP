import {decodeFunctionData, type Hex} from "viem";
import {describe, expect, it} from "vitest";

import {multiVaultDeclareAbi} from "../src/declare/multivault.js";
import {isUsageOutcome, isUsageReason, prepareUsageContext, USAGE_REASONS} from "../src/declare/usage-context.js";
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
        expect(again).toMatchObject({status: "planned", calls: [], totalValue: 0n, alreadyWritten: [first.outcomeTripleId]});
    });

    it("deposits on a qualifier somebody else wrote first, so they cannot silence the declarer below the edge", async () => {
        const first = await plan([EDGE], {outcome: "failed"});
        if (first.status !== "planned" || first.outcomeTripleId === null) throw new Error("expected a plan");
        const again = await plan(
            [EDGE, atomIdFor("has outcome"), atomIdFor("failed"), first.outcomeTripleId],
            {outcome: "failed", declarer: `0x${"11".repeat(20)}`},
        );
        expect(again.status).toBe("planned");
        if (again.status !== "planned") return;
        expect(again.calls.map((call) => [call.kind, call.value])).toEqual([["deposit", 1n]]);
    });

    it("deposits on an edge another wallet wrote, first, so the declarer's lines count", async () => {
        const result = await plan([EDGE, atomIdFor("video")], {domain: "video", declarer: `0x${"11".repeat(20)}`, declarerDidNotWriteEdge: true});
        if (result.status !== "planned") throw new Error("expected a plan");
        expect(result.calls.map((call) => call.kind)).toEqual(["deposit", "create-triple"]);
        expect(decodeFunctionData({abi: multiVaultDeclareAbi, data: result.calls[0]?.data ?? "0x"}).args?.[1]).toBe(EDGE);
    });

    it("does not deposit on an edge the declarer wrote", async () => {
        const result = await plan([EDGE, atomIdFor("video")], {domain: "video", declarer: `0x${"11".repeat(20)}`});
        if (result.status !== "planned") throw new Error("expected a plan");
        expect(result.calls.map((call) => call.kind)).toEqual(["create-triple"]);
    });

    it("accepts an edge created earlier in the same plan", async () => {
        const result = await plan([], {outcome: "worked", edgePlanned: true});
        expect(result.status).toBe("planned");
    });

    it("writes form B: the outcome is about the domain's triple and the reason about the outcome's", async () => {
        const result = await plan([EDGE, atomIdFor("video")], {domain: "video", outcome: "failed", reason: "missing-key"});
        if (result.status !== "planned" || result.contextTripleId === null || result.outcomeTripleId === null) {
            throw new Error("expected a plan");
        }
        const triples = result.calls
            .filter((call) => call.kind === "create-triple")
            .map((call) => decodeFunctionData({abi: multiVaultDeclareAbi, data: call.data}).args);
        expect(triples.map((args) => (args?.[0] as Hex[])[0])).toEqual([EDGE, result.contextTripleId, result.outcomeTripleId]);
        expect(triples.map((args) => (args?.[2] as Hex[])[0])).toEqual([atomIdFor("video"), atomIdFor("failed"), atomIdFor("missing-key")]);
        expect(result.reasonTripleId).not.toBeNull();
    });

    it("creates each triple after the one it is about", async () => {
        const result = await plan([], {edgePlanned: true, domain: "video", outcome: "failed", reason: "missing-file"});
        if (result.status !== "planned") throw new Error("expected a plan");
        expect(result.calls.at(-1)?.kind).toBe("create-triple");
        const kinds = result.calls.map((call) => call.kind);
        expect(kinds.filter((kind) => kind === "create-triple")).toHaveLength(3);
    });

    it("puts the outcome on the edge when no domain is given", async () => {
        const result = await plan([EDGE], {outcome: "worked"});
        if (result.status !== "planned") throw new Error("expected a plan");
        const triple = result.calls.find((call) => call.kind === "create-triple");
        expect(decodeFunctionData({abi: multiVaultDeclareAbi, data: triple?.data ?? "0x"}).args?.[0]).toEqual([EDGE]);
    });

    it("refuses a reason without a failure", async () => {
        expect(await plan([EDGE], {outcome: "worked", reason: "missing-key"})).toMatchObject({status: "refused", rule: "reason_without_failure"});
        expect(await plan([EDGE], {reason: "missing-key"})).toMatchObject({status: "refused", rule: "reason_without_failure"});
    });

    it("has four reasons and no fifth", () => {
        expect(USAGE_REASONS).toEqual(["missing-key", "missing-program", "missing-file", "not-the-right-tool"]);
        expect(isUsageReason("because I said so")).toBe(false);
    });

    it("has two outcomes and no third", () => {
        expect(isUsageOutcome("failed")).toBe(true);
        expect(isUsageOutcome("works sometimes")).toBe(false);
    });
});
