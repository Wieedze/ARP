import {afterEach, describe, expect, it, vi} from "vitest";

import {CHAIN_STORAGE_KEY, readStored} from "../chain-choice";

function stubStorage(value: string | null) {
    vi.stubGlobal("localStorage", {
        getItem: (key: string) => (key === CHAIN_STORAGE_KEY ? value : null),
    });
}

describe("readStored", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("opens on testnet when nothing was chosen (ADR 0105)", () => {
        stubStorage(null);
        expect(readStored()).toBe(false);
    });

    it("keeps a reader's choice of either chain", () => {
        stubStorage("mainnet");
        expect(readStored()).toBe(true);
        stubStorage("testnet");
        expect(readStored()).toBe(false);
    });

    it("falls back to testnet when storage throws", () => {
        vi.stubGlobal("localStorage", {
            getItem: () => {
                throw new Error("blocked");
            },
        });
        expect(readStored()).toBe(false);
    });
});
