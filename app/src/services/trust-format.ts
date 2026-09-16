import {formatEther} from "viem";
import type {FreshnessVerdict, MarketSide, SignatureVerdict} from "@arp-protocol/erc8004";

/**
 * Display helpers for the trust panel. Pure functions, no React, no clock of
 * their own — anything time-dependent takes the seconds the connector already
 * computed rather than recomputing from `Date.now()` and disagreeing with it.
 */

const DECIMAL_PLACES = 8;

/**
 * Format a wei-denominated TRUST amount for display.
 *
 * Trailing zeros are trimmed, and anything below the last displayed place
 * renders as `<0.00000001` rather than as `0.00000000` — the vaults on this
 * surface hold dust positions and rounding one to zero would read as "nobody
 * is here" when somebody is.
 */
export function formatTrust(wei: bigint): string {
    if (wei === 0n) return "0";
    const negative = wei < 0n;
    const absolute = negative ? -wei : wei;
    const exact = formatEther(absolute);
    const [whole, fraction = ""] = exact.split(".");
    const trimmed = fraction.slice(0, DECIMAL_PLACES).replace(/0+$/, "");
    if (whole === "0" && trimmed === "") return negative ? ">-0.00000001" : "<0.00000001";
    const value = trimmed === "" ? whole : `${whole}.${trimmed}`;
    return negative ? `-${value}` : value;
}

/** `0x1234abcd…9f0e` — for term ids, hashes and addresses in dense rows. */
export function truncateMiddle(value: string, head = 10, tail = 6): string {
    if (value.length <= head + tail + 1) return value;
    return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** `4 days`, `23 hours`, `12 minutes`, `40 seconds`. Singular where it matters. */
export function formatDuration(seconds: number): string {
    const value = Math.max(0, Math.floor(seconds));
    const units: [number, string][] = [
        [DAY, "day"],
        [HOUR, "hour"],
        [MINUTE, "minute"],
    ];
    for (const [size, name] of units) {
        if (value >= size) {
            const count = Math.floor(value / size);
            return `${count} ${name}${count === 1 ? "" : "s"}`;
        }
    }
    return `${value} second${value === 1 ? "" : "s"}`;
}

export type FreshnessCopy = {
    label: string;
    detail: string;
    tone: "fresh" | "stale" | "unknown";
};

/**
 * Freshness, phrased against the window the provider declared for itself.
 *
 * A stale document always says *how far* past its own deadline it is. "Stale"
 * on its own invites the reader to assume it just expired; four days past a
 * twenty-four hour window is a different claim.
 */
export function describeFreshness(verdict: FreshnessVerdict): FreshnessCopy {
    if (verdict.status === "fresh") {
        return {
            label: "Fresh",
            detail: `${formatDuration(verdict.secondsRemaining)} left of the window it declared (until ${verdict.validUntil})`,
            tone: "fresh",
        };
    }
    if (verdict.status === "stale") {
        return {
            label: "Stale",
            detail: `${formatDuration(verdict.secondsStale)} past the window it declared (expired ${verdict.validUntil})`,
            tone: "stale",
        };
    }
    return {label: "No window", detail: verdict.reason, tone: "unknown"};
}

export type SignatureCopy = {
    label: string;
    detail: string;
    tone: "verified" | "mismatch" | "unverified";
};

/**
 * The connector's verdict, relayed verbatim.
 *
 * There is no branch here that turns an `unverified` into anything warmer.
 * `unverified` means the signature could not be checked — usually because
 * there is none — and saying so is the honest answer about a stranger.
 */
export function describeSignature(verdict: SignatureVerdict): SignatureCopy {
    if (verdict.status === "verified") {
        return {
            label: "Signature verified",
            detail: `EIP-712 recovers to the signer the document names, ${truncateMiddle(verdict.declaredSigner, 8, 6)}`,
            tone: "verified",
        };
    }
    if (verdict.status === "mismatch") {
        return {
            label: "Signature mismatch",
            detail: `Document names ${truncateMiddle(verdict.declaredSigner, 8, 6)} as its signer; the signature recovers to ${truncateMiddle(verdict.recovered, 8, 6)}`,
            tone: "mismatch",
        };
    }
    return {label: "Not verified", detail: verdict.reason, tone: "unverified"};
}

/**
 * How many positions hold this side of a claim, and how many distinct
 * accounts that is.
 *
 * Never a bare market cap. Every vault on this surface currently holds one or
 * two positions, so a lone number would suggest depth that is not there. In
 * the MultiVault an account holds at most one position per vault, so the
 * position count *is* the distinct-staker count — stated rather than assumed.
 */
export function describeStakers(side: MarketSide): string {
    const count = side.positionCount;
    if (count === null) return "position count not reported by the indexer";
    if (count === 0) return "no positions · no distinct stakers";
    if (count === 1) return "1 position · 1 distinct staker";
    return `${count} positions · ${count} distinct stakers`;
}

/**
 * The block explorer for the chain the ERC-8004 identity lives on. `null` for
 * a chain we have no explorer for, which is rendered as an absent link rather
 * than a guessed one.
 */
export function agentRegistryExplorerUrl(
    chainId: number,
    registry: string,
    tokenId: string,
): string | null {
    const base: Record<number, string> = {
        1: "https://etherscan.io",
        56: "https://bscscan.com",
        8453: "https://basescan.org",
    };
    const host = base[chainId];
    return host === undefined ? null : `${host}/token/${registry}?a=${tokenId}`;
}

/** Why a resolver document could not be read, in one sentence a reader can act on. */
export function describeFetchError(error: {kind: string} & Record<string, unknown>): string {
    switch (error.kind) {
        case "no-resolver-url":
            return "The graph edge carries no resolver URL, so there is no document to read.";
        case "skipped":
            return "The resolver was not fetched.";
        case "network":
            return `The resolver could not be reached: ${String(error["message"])}`;
        case "timeout":
            return `The resolver did not answer within ${String(error["timeoutMs"])} ms.`;
        case "http":
            return `The resolver answered HTTP ${String(error["status"])} ${String(error["statusText"])}.`;
        case "not-json":
            return `The resolver answered ${String(error["contentType"]) || "an unknown content type"} rather than JSON.`;
        case "malformed":
            return `The document could not be parsed: ${String(error["message"])}`;
        default:
            return "The document could not be read.";
    }
}
