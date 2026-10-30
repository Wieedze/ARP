import {describe, expect, it} from "vitest";
import type {AccountActivityBucket, AccountHoldings} from "@arp-protocol/core";

import {buildProfileView, type ProfileReader} from "../account-profile";

const ACCOUNT = "0x606B24eb3F814ea5D7117a9bBc1431252f32245A";

const holdings = (overrides: Partial<AccountHoldings> = {}): AccountHoldings => ({
    account: ACCOUNT,
    curveId: 1,
    termsHeld: 352,
    totalShares: 900n,
    depositedAssets: 1_000_000_000_000_000_000n,
    redeemedAssets: 0n,
    netAssets: 1_000_000_000_000_000_000n,
    atomDeposits: 235,
    tripleDeposits: 150,
    ...overrides,
});

function readerOf(params: {
    holdings: AccountHoldings;
    buckets?: AccountActivityBucket[];
    openingNet?: bigint;
    truncated?: boolean;
}): ProfileReader {
    return {
        async holdings() {
            return params.holdings;
        },
        async activity() {
            return {
                buckets: params.buckets ?? [],
                openingNet: params.openingNet ?? 0n,
                truncated: params.truncated ?? false,
            };
        },
    };
}

describe("buildProfileView", () => {
    it("leads on net, which is the figure that cannot flatter", async () => {
        // A page leading with "deposited" flatters anyone who has since withdrawn. Net is what the
        // account is still standing behind.
        const view = await buildProfileView({
            account: ACCOUNT,
            curveId: 1,
            reader: readerOf({
                holdings: holdings({
                    depositedAssets: 1_000_000_000_000_000_000n,
                    redeemedAssets: 250_000_000_000_000_000n,
                    netAssets: 750_000_000_000_000_000n,
                }),
            }),
        });
        expect(view.netTrust).toBe("0.75");
        expect(view.depositedTrust).toBe("1");
        expect(view.hasRedeemed).toBe(true);
    });

    it("does not report a redemption that never happened", async () => {
        // "Redeemed 0" reads as a fact about your behaviour that a first deposit has not had time
        // to be, so the row is absent rather than zero.
        const view = await buildProfileView({
            account: ACCOUNT,
            curveId: 1,
            reader: readerOf({holdings: holdings({redeemedAssets: 0n})}),
        });
        expect(view.hasRedeemed).toBe(false);
    });

    it("survives a net that went negative", async () => {
        /**
         * Redeeming an appreciated position returns **more assets than were deposited**, and
         * `netAssets` is a plain subtraction — so the figure under "Still committed" can be
         * negative. It is a real state of a real account, not an error, and the page must render it
         * rather than producing a malformed string or throwing.
         */
        const view = await buildProfileView({
            account: ACCOUNT,
            curveId: 1,
            reader: readerOf({
                holdings: holdings({
                    depositedAssets: 1_000_000_000_000_000_000n,
                    redeemedAssets: 1_500_000_000_000_000_000n,
                    netAssets: -500_000_000_000_000_000n,
                }),
            }),
        });
        expect(view.netTrust.startsWith("-")).toBe(true);
        expect(view.isNetNegative).toBe(true);
    });

    it("keeps the two markets apart, because they are two different acts", async () => {
        // A deposit on an atom prices the tool; one on a triple backs somebody's claim about it
        // (ADR `0039`). One number over both would cover two unrelated statements.
        const view = await buildProfileView({
            account: ACCOUNT,
            curveId: 1,
            reader: readerOf({holdings: holdings({atomDeposits: 235, tripleDeposits: 150})}),
        });
        expect(view.toolsPriced).toBe(235);
        expect(view.claimsBacked).toBe(150);
    });

    it("carries the opening balance so a truncated curve is not read from zero", async () => {
        /**
         * The indexer returns a limited window, so folding it from zero drew a line that looked like
         * the account began at its hundredth-last deposit. Verified against mainnet 2026-10-21: with
         * the opening carried, the curve's last point equals the account's net — 388,535.64 both
         * sides.
         */
        const view = await buildProfileView({
            account: ACCOUNT,
            curveId: 1,
            reader: readerOf({
                holdings: holdings(),
                openingNet: 900_000_000_000_000_000n,
                truncated: true,
                buckets: [
                    {
                        day: "2026-10-18",
                        deposited: 100_000_000_000_000_000n,
                        redeemed: 0n,
                        cumulativeNet: 1_000_000_000_000_000_000n,
                    },
                ],
            }),
        });
        expect(view.curveTruncated).toBe(true);
        expect(view.openingTrust).toBe("0.9");
        expect(view.curve.at(-1)?.value).toBe(1_000_000_000_000_000_000n);
    });
});
