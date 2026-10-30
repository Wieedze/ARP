import {formatEther, type Hex} from "viem";

import {deployments} from "./deployments";
import {INTUITION_MAINNET_EXPLORER, intuitionMainnet} from "./intuition-mainnet";

/**
 * An amount and a transaction link for a chain known only by its id — an event from the agent's
 * feed, which may be on either chain whatever the page's toggle says. Constants only, so nothing
 * here builds a client to answer a question about a URL.
 */
export function symbolFor(chainId: number): string {
    return chainId === intuitionMainnet.id ? "TRUST" : "tTRUST";
}

/** Wei to TRUST, trimmed, with the chain's unit. Never a float of the wei. */
export function amountOf(wei: string, chainId: number): string {
    const whole = formatEther(BigInt(wei)).replace(/0+$/, "").replace(/\.$/, "");
    return `${whole} ${symbolFor(chainId)}`;
}

export function explorerTxUrl(chainId: number, hash: Hex): string {
    const base =
        chainId === intuitionMainnet.id
            ? INTUITION_MAINNET_EXPLORER
            : deployments.chain.explorerUrl;
    return `${base}/tx/${hash}`;
}
