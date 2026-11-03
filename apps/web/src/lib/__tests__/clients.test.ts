import {describe, expect, it} from "vitest";

import {choiceFor} from "../chain-choice";
import {intuitionTestnet} from "../chains";
import {publicClient, publicClientFor} from "../clients";
import {intuitionMainnet} from "../intuition-mainnet";

describe("publicClientFor", () => {
    it("builds one client per chain id and hands every caller the same one", () => {
        expect(publicClientFor(intuitionTestnet)).toBe(publicClientFor(intuitionTestnet));
        expect(publicClientFor(intuitionMainnet)).not.toBe(publicClientFor(intuitionTestnet));
        expect(publicClient).toBe(publicClientFor(intuitionTestnet));
    });

    it("is the client a chain choice carries, however often the choice is asked for", () => {
        expect(choiceFor(false).client).toBe(publicClientFor(intuitionTestnet));
        expect(choiceFor(true).client).toBe(publicClientFor(intuitionMainnet));
        expect(choiceFor(true)).toBe(choiceFor(true));
    });
});
