import {
    getAccountActivity,
    getAccountHoldings,
    type AccountActivityBucket,
    type AccountHoldings,
} from "@arp-protocol/core";

import {formatTrust} from "./trust-format";

/**
 * What one account has actually done, for its own page.
 *
 * ## What this is not
 *
 * Not a score and not a rank. ARP composes neither (ADR `0046`), and an account page is the most
 * tempting place to invent one — "your reputation: 72" would be a number ARP made up about a person.
 * What is here is what the chain says: what you hold, what you put in, what you took back out.
 *
 * ## Two markets, reported apart
 *
 * `vault_type` on each deposit says whether it landed on an **atom** or a **triple**, and those are
 * two different acts:
 *
 * - a deposit on an atom prices **the tool** — "this is worth something";
 * - a deposit on a triple backs **somebody's claim** about it — "I believe they used it", or the
 *   counter-vault, "I do not".
 *
 * ADR `0039` is why an agent's own declaration goes on the edge. Summing the two into "your
 * positions" would report one number covering two unrelated statements.
 */
export type ProfileView = {
    account: string;
    /** The bonding curve every figure was read at. Named on the figures, never summed across. */
    curveId: number;
    termsHeld: number;
    /** Still committed: deposited minus redeemed. The number that means something. */
    netTrust: string;
    /**
     * True when more has been redeemed than deposited, so `netTrust` is negative.
     *
     * A real state, not an error: redeeming an appreciated position returns more assets than went
     * in. The page needs it because "Still committed: -0.5 TRUST" is not a sentence, and the label
     * has to change rather than the number being hidden.
     */
    isNetNegative: boolean;
    depositedTrust: string;
    redeemedTrust: string;
    /** `false` when nothing has ever been redeemed, so the row is absent rather than a zero. */
    hasRedeemed: boolean;
    /** Deposits that priced a tool. */
    toolsPriced: number;
    /** Deposits that backed somebody's claim. */
    claimsBacked: number;
    /** Oldest first. Empty when this account has never deposited. */
    curve: {label: string; value: bigint}[];
    /** What it held before the first point of the curve — non-zero only when the window is a prefix. */
    openingTrust: string;
    curveTruncated: boolean;
};

export type ProfileReader = {
    holdings(account: string, curveId: number): Promise<AccountHoldings>;
    activity(
        account: string,
        curveId: number,
    ): Promise<{buckets: AccountActivityBucket[]; openingNet: bigint; truncated: boolean}>;
};

export function intuitionProfileReader(graphqlUrl: string): ProfileReader {
    return {
        holdings: (account, curveId) => getAccountHoldings(account, {graphqlUrl, curveId}),
        activity: (account, curveId) => getAccountActivity(account, {graphqlUrl, curveId}),
    };
}

/**
 * Both reads, in parallel, mapped to what the page renders.
 *
 * Pure of React and of the network — the reader is injected — so the mapping is testable without a
 * DOM, which is where every view defect this project has shipped was hiding.
 */
export async function buildProfileView(params: {
    account: string;
    curveId: number;
    reader: ProfileReader;
}): Promise<ProfileView> {
    const [holdings, activity] = await Promise.all([
        params.reader.holdings(params.account, params.curveId),
        params.reader.activity(params.account, params.curveId),
    ]);

    return {
        account: params.account,
        curveId: params.curveId,
        termsHeld: holdings.termsHeld,
        netTrust: formatTrust(holdings.netAssets),
        isNetNegative: holdings.netAssets < 0n,
        depositedTrust: formatTrust(holdings.depositedAssets),
        redeemedTrust: formatTrust(holdings.redeemedAssets),
        hasRedeemed: holdings.redeemedAssets > 0n,
        toolsPriced: holdings.atomDeposits,
        claimsBacked: holdings.tripleDeposits,
        curve: activity.buckets.map((bucket) => ({
            label: bucket.day,
            value: bucket.cumulativeNet,
        })),
        openingTrust: formatTrust(activity.openingNet),
        curveTruncated: activity.truncated,
    };
}
