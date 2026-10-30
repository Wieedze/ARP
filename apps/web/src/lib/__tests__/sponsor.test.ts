import {describe, expect, it} from "vitest";

import {sponsorAddressFor} from "../sponsor";

const SPONSOR = "0x906f3A52ec089f8D4E9127F91C6bE5Ae0d18f91f";

describe("sponsorAddressFor", () => {
    it("is null until one is configured, so every deposit reads as declared", () => {
        expect(sponsorAddressFor(13579, undefined)).toBeNull();
        expect(sponsorAddressFor(13579, "")).toBeNull();
    });

    it("returns the configured address on testnet", () => {
        expect(sponsorAddressFor(13579, ` ${SPONSOR} `)).toBe(SPONSOR);
    });

    it("has none on mainnet, whatever the environment says", () => {
        // The sponsoring service is testnet-only; a mainnet figure labelled proven by a testnet
        // key would be two chains in one number.
        expect(sponsorAddressFor(1155, SPONSOR)).toBeNull();
    });

    it("drops a malformed value rather than guessing", () => {
        expect(sponsorAddressFor(13579, "0x1234")).toBeNull();
        expect(sponsorAddressFor(13579, "0x%")).toBeNull();
    });
});
