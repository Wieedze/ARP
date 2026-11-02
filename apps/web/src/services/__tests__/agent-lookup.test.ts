import {describe, expect, it} from "vitest";

import {agentRefOf} from "../agent-lookup";

describe("agentRefOf", () => {
    it("reads chain and token, with a slash or a colon", () => {
        expect(agentRefOf("8453/2340")).toEqual({chainId: 8453, tokenId: "2340"});
        expect(agentRefOf(" 56 : 12 ")).toEqual({chainId: 56, tokenId: "12"});
    });

    it("takes a bare number as a token on Base", () => {
        expect(agentRefOf("1380")).toEqual({chainId: 8453, tokenId: "1380"});
    });

    it("keeps one spelling of a token", () => {
        expect(agentRefOf("8453/007")).toEqual({chainId: 8453, tokenId: "7"});
        expect(agentRefOf("0")).toEqual({chainId: 8453, tokenId: "0"});
    });

    it("leaves a capability search alone", () => {
        expect(agentRefOf("MCP Server")).toBeNull();
        expect(agentRefOf("defi")).toBeNull();
        expect(agentRefOf("")).toBeNull();
        expect(agentRefOf("8453/")).toBeNull();
    });

    it("refuses chain 0", () => {
        expect(agentRefOf("0/12")).toBeNull();
    });
});
