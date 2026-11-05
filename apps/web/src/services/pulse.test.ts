import {beforeEach, describe, expect, it, vi} from "vitest";

import {loadPulse, type PulseChain} from "./pulse";

const mocks = vi.hoisted(() => ({
    readPulse: vi.fn(),
    atomId: vi.fn(),
    getPulseUsage: vi.fn(),
}));

vi.mock("@arp-protocol/core", () => ({
    getPulseUsage: mocks.getPulseUsage,
    githubPulseSource: () => ({}),
    BECAUSE_LABEL: "because",
    HAS_OUTCOME_LABEL: "has outcome",
    multiVaultReads: () => ({atomId: mocks.atomId}),
    readPulse: mocks.readPulse,
    toolAtomUri: (url: string) => `ipfs://${url}`,
}));

const chain: PulseChain = {
    chainId: 13579,
    multiVault: "0x0000000000000000000000000000000000000001",
    rpcUrl: "http://rpc",
    graphqlUrl: "http://graph",
    inContextOf: "0x01",
    linePayers: [],
};
const read = {source: "a/b", skill: "x", status: "read"};

describe("loadPulse", () => {
    beforeEach(() => {
        mocks.readPulse.mockReset().mockResolvedValue(read);
        mocks.atomId.mockReset().mockResolvedValue("0xABC");
        mocks.getPulseUsage.mockReset().mockResolvedValue(new Map([["0xabc", {declarations: []}]]));
    });

    it("joins the file's facts and the usage", async () => {
        const view = await loadPulse("a/b", "x", chain);
        expect(view).toEqual({pulse: read, atomId: "0xABC", usage: {declarations: []}});
    });

    it("keeps the file's facts when the chain does not answer", async () => {
        mocks.atomId.mockRejectedValue(new Error("rpc down"));
        expect(await loadPulse("a/b", "x", chain)).toEqual({pulse: read, atomId: null, usage: null});
    });

    it("keeps the file's facts when the graph does not answer", async () => {
        mocks.getPulseUsage.mockRejectedValue(new Error("graph down"));
        expect((await loadPulse("a/b", "x", chain)).pulse).toEqual(read);
    });

    it("keeps the usage when GitHub does not answer, and says the repository did not", async () => {
        mocks.readPulse.mockRejectedValue(new TypeError("failed to fetch"));
        const view = await loadPulse("a/b", "x", chain);
        expect(view.pulse.status).toBe("repository_unreachable");
        expect(view.usage).toEqual({declarations: []});
    });
});
