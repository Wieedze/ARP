import {
    BaseError,
    ContractFunctionRevertedError,
    TransactionNotFoundError,
    TransactionReceiptNotFoundError,
} from "viem";

/**
 * Whether a failed contract read is the contract answering "no" — a revert — rather than the
 * chain being unreachable.
 *
 * The difference is the whole point. `ownerOf` reverts for a token that does not exist, which is an
 * answer about the agent; a timeout or a refused connection says nothing about it. Catching both as
 * "does not exist" reported an RPC outage as a fact about somebody's identity.
 *
 * viem turns a revert with data (JSON-RPC code 3) into `ContractFunctionRevertedError`. A node that
 * reverts without data answers code -32000 and the message `execution reverted`, which viem leaves
 * as a plain RPC error, so the message is matched too.
 */
export function isContractRevert(error: unknown): boolean {
    if (error instanceof BaseError) {
        if (error.walk((cause) => cause instanceof ContractFunctionRevertedError) !== null) {
            return true;
        }
    }
    let cursor: unknown = error;
    for (let depth = 0; depth < 8 && cursor instanceof Error; depth += 1) {
        if (/execution reverted/i.test(cursor.message)) return true;
        cursor = cursor.cause;
    }
    return false;
}

/** Whether a transaction read failed because the chain has no such transaction or receipt. */
export function isTransactionAbsent(error: unknown): boolean {
    if (!(error instanceof BaseError)) return false;
    return (
        error.walk(
            (cause) =>
                cause instanceof TransactionNotFoundError ||
                cause instanceof TransactionReceiptNotFoundError,
        ) !== null
    );
}

/** The chain could not be read, so nothing it would have said is known. Never a verdict. */
export class ChainUnreadableError extends Error {
    constructor(what: string, cause: unknown) {
        super(
            `could not read ${what}: ${cause instanceof Error ? cause.message.split("\n")[0] : String(cause)}`,
            {cause},
        );
        this.name = "ChainUnreadableError";
    }
}
