import {describe, expect, it, vi} from "vitest";
import type {AccountHoldings} from "@arp-protocol/core";

import {profileQueryKey, profileQueryOptions} from "../use-profile";
import type {ProfileReader} from "../../services/account-profile";

const ACCOUNT = "0x606B24eb3F814ea5D7117a9bBc1431252f32245A";

const reader = (holdings: Partial<AccountHoldings> = {}): ProfileReader => ({
    async holdings(account, curveId) {
        return {
            account,
            curveId,
            termsHeld: 1,
            totalShares: 1n,
            depositedAssets: 1n,
            redeemedAssets: 0n,
            netAssets: 1n,
            atomDeposits: 1,
            tripleDeposits: 0,
            ...holdings,
        };
    },
    async activity() {
        return {buckets: [], openingNet: 0n, truncated: false};
    },
});

describe("profileQueryKey", () => {
    it("keys on the account, so switching wallets does not serve the other one's figures", () => {
        // The one cache mistake a page about "your" money must not make.
        expect(profileQueryKey(ACCOUNT, 1)).not.toEqual(profileQueryKey("0xdead", 1));
    });

    it("keys on the curve too, because the two curves are two markets", () => {
        expect(profileQueryKey(ACCOUNT, 1)).not.toEqual(profileQueryKey(ACCOUNT, 2));
    });

    it("has a key for no account, rather than an undefined hole", () => {
        expect(profileQueryKey(undefined, 1)).toContain("none");
    });
});

describe("profileQueryOptions", () => {
    it("does not run without an account", () => {
        expect(profileQueryOptions(undefined, 1, reader()).enabled).toBe(false);
        expect(profileQueryOptions(ACCOUNT, 1, reader()).enabled).toBe(true);
    });

    it("passes the account and the curve through to the reader", async () => {
        const holdings = vi.fn(reader().holdings);
        const options = profileQueryOptions(ACCOUNT, 2, {holdings, activity: reader().activity});
        const view = await options.queryFn();
        expect(holdings).toHaveBeenCalledWith(ACCOUNT, 2);
        expect(view.curveId).toBe(2);
    });

    it("lets a failed read surface rather than retrying indefinitely", () => {
        expect(profileQueryOptions(ACCOUNT, 1, reader()).retry).toBe(1);
    });

    it("is staler-sooner than the catalogue, because you expect your own figures to move", () => {
        // Your own deposits are the one figure you expect to change when you act.
        expect(profileQueryOptions(ACCOUNT, 1, reader()).staleTime).toBeLessThan(120_000);
    });
});
