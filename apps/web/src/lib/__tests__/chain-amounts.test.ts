import {describe, expect, it} from "vitest";

import {amountOf, explorerTxUrl, symbolFor} from "../chain-amounts";

const HASH = `0x${"e".repeat(64)}` as const;

describe("chain-amounts", () => {
    it("names the unit of the chain the amount was spent on, not the page's", () => {
        expect(symbolFor(1155)).toBe("TRUST");
        expect(symbolFor(13579)).toBe("tTRUST");
        expect(amountOf("2000000002000000", 13579)).toBe("0.002000000002 tTRUST");
        expect(amountOf("1000000000000000000", 1155)).toBe("1 TRUST");
    });

    it("links a hash to its own chain's explorer", () => {
        expect(explorerTxUrl(13579, HASH)).toBe(
            `https://testnet.explorer.intuition.systems/tx/${HASH}`,
        );
        expect(explorerTxUrl(1155, HASH)).toBe(`https://explorer.intuition.systems/tx/${HASH}`);
    });
});
