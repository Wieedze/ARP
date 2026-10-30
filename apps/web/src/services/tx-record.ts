/**
 * Every transaction this browser sends, in the activity log, with its hash.
 *
 * Two entries per transaction: `sent` the moment the wallet hands back a hash, then `confirmed` or
 * `refused` once the receipt is read. Both carry the hash and the chain, so the bar links each one
 * to its own explorer. The label is the caller's, because only the caller knows what the call was
 * for — decoding it back out of calldata would drift the moment an encoder changed.
 *
 * Recording never fails a transaction: a log is not worth an action.
 */
import type {Hex} from "viem";

import {activityLog, type ActivityLog} from "./activity-log";

export type TxWhat = {
    /** Defaults to the waiting client's chain. */
    chainId?: number;
    /** Two or three words: "deposit", "mint identity", "redeem delegation". */
    label: string;
    detail?: string;
    /** Native value sent with the call, in wei. */
    valueWei?: bigint;
};

type ReceiptLike = {
    status: "success" | "reverted";
    blockNumber: bigint;
    gasUsed: bigint;
    effectiveGasPrice: bigint;
};

const chains = new Map<string, number>();

export function recordSent(hash: Hex, what: TxWhat, log: ActivityLog = activityLog): void {
    const key = `mine:sent:${hash}`;
    if (what.chainId !== undefined) chains.set(hash.toLowerCase(), what.chainId);
    if (log.has(key)) return;
    log.append({
        stream: "mine",
        step: "sent",
        label: what.label,
        ...(what.detail === undefined ? {} : {detail: what.detail}),
        tx: hash,
        ...(what.chainId === undefined ? {} : {chainId: what.chainId}),
        ...(what.valueWei === undefined || what.valueWei === 0n
            ? {}
            : {costWei: what.valueWei.toString()}),
        key,
    });
}

export function recordSettled(
    hash: Hex,
    receipt: ReceiptLike,
    log: ActivityLog = activityLog,
): void {
    const key = `mine:settled:${hash}`;
    if (log.has(key)) return;
    const chainId = chains.get(hash.toLowerCase());
    log.append({
        stream: "mine",
        step: receipt.status === "success" ? "confirmed" : "refused",
        label: receipt.status === "success" ? `block ${receipt.blockNumber}` : "reverted",
        tx: hash,
        ...(chainId === undefined ? {} : {chainId}),
        costWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
        key,
    });
}

/** A receipt wait that could not finish — timeout, dropped transaction, RPC down. */
export function recordUnsettled(hash: Hex, cause: unknown, log: ActivityLog = activityLog): void {
    const key = `mine:settled:${hash}`;
    if (log.has(key)) return;
    const chainId = chains.get(hash.toLowerCase());
    const message = cause instanceof Error ? cause.message : String(cause);
    log.append({
        stream: "mine",
        step: "refused",
        label: "no receipt",
        detail: message.split("\n")[0]?.slice(0, 120) ?? "",
        tx: hash,
        ...(chainId === undefined ? {} : {chainId}),
        key,
    });
}

/**
 * What the call sites use: record the hash, wait for its receipt, record how it settled, and hand
 * the receipt back exactly as the client returned it.
 */
export async function waitAndRecord<R extends ReceiptLike>(
    client: {
        waitForTransactionReceipt(args: {hash: Hex}): Promise<R>;
        chain?: {id: number} | undefined;
    },
    hash: Hex,
    what: TxWhat,
    log: ActivityLog = activityLog,
): Promise<R> {
    const chainId = what.chainId ?? client.chain?.id;
    recordSent(hash, chainId === undefined ? what : {...what, chainId}, log);
    let receipt: R;
    try {
        receipt = await client.waitForTransactionReceipt({hash});
    } catch (cause) {
        recordUnsettled(hash, cause, log);
        throw cause;
    }
    recordSettled(hash, receipt, log);
    return receipt;
}
