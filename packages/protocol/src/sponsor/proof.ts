import {getAddress, type Address, type Hex} from "viem";

import {verifyHireReceipt, type SignedHireReceipt} from "../hire-receipt.js";
import {corroborationOf, verifyContentReceipt, type SignedContentReceipt} from "../receipt.js";

/**
 * The proofs that make a deposit eligible for ARP's sponsorship (ADR `0094` §2), and the check.
 *
 * | kind      | what it is                                                      | strength |
 * | --------- | --------------------------------------------------------------- | -------- |
 * | `hire`    | the agent paid another agent on chain, and that agent's node    | strong   |
 * |           | signed the hire receipt (`hire-receipt.ts`)                     |          |
 * | `content` | ARP's node served the agent a tool's bytes and signed for it    | access   |
 * |           | (`receipt.ts`)                                                  |          |
 *
 * The runtime hook's log is not here: ADR `0094` leaves a direct MCP call as a weak declaration, and
 * how it combines with `apps/probe` is undecided by the user.
 *
 * **What `strong` means, and what it does not.** `docs/24`, as ADR `0094` was corrected: one
 * operator running both agents can pay itself and have its own second node sign. _Proven_ means a
 * second **key** signed, never a second operator. The bound on that is economic, and it is
 * {@link ProvenProof.cost}: the service sponsors less than the proof cost to make.
 */
export type SponsorProof =
    | {kind: "hire"; receipt: SignedHireReceipt}
    | {kind: "content"; receipt: SignedContentReceipt};

/** The two chain reads a hire proof needs. A viem `PublicClient` satisfies it. */
export type PaymentReads = {
    getTransaction(args: {hash: Hex}): Promise<{from: Address; to: Address | null; value: bigint}>;
    getTransactionReceipt(args: {hash: Hex}): Promise<{status: "success" | "reverted"}>;
};

export type ProvenProof = {
    status: "proven";
    kind: SponsorProof["kind"];
    strength: "strong" | "access";
    /**
     * What the proof cost the agent to obtain, in the native unit of `chainId`, or `null` when the
     * proof has no price this module can read.
     *
     * A content receipt is `null` today: a fetch through ARP is free until x402 puts a price on it
     * (`docs/tasks/41`). The service refuses an unpriced proof, because ADR `0094` §2 requires a
     * sponsored amount to stay **below** the cost of the proof that unlocks it, and nothing is below
     * an unknown.
     */
    cost: bigint | null;
    /** A key that identifies the proof, so one proof sponsors one deposit. */
    id: string;
    /** The object the proof is about, when it names one as an atom: a content receipt's tool atom. */
    object: Hex | null;
};

export type ProofVerdict = ProvenProof | {status: "refused"; reason: string};

export type ProofCheckContext = {
    /** The agent asking: the deposit's `receiver`. */
    receiver: Address;
    /** The chain the deposit is made on. A proof from another chain cannot be priced against it. */
    chainId: number;
    payments: PaymentReads;
    /**
     * Content-receipt signers this service accepts: ARP's own nodes. Empty refuses every content
     * receipt, which is the honest default (`corroborationOf`'s `accepted`).
     */
    acceptedContentSigners: readonly Address[];
};

function refused(reason: string): ProofVerdict {
    return {status: "refused", reason};
}

async function checkHire(
    signed: SignedHireReceipt,
    context: ProofCheckContext,
): Promise<ProofVerdict> {
    const verdict = await verifyHireReceipt(signed);
    if (verdict.status === "malformed") return refused(`hire receipt: ${verdict.reason}`);
    if (verdict.status === "mismatch") return refused("hire receipt: signature does not match");
    const {receipt} = signed;
    const receiver = getAddress(context.receiver);
    const callee = verdict.signer;
    if (signed.chainId !== context.chainId) {
        return refused(
            `hire receipt is for chain ${signed.chainId}, deposits are on ${context.chainId}`,
        );
    }
    if (getAddress(receipt.requester) !== receiver) {
        return refused(`hire receipt names requester ${receipt.requester}, not ${receiver}`);
    }
    if (callee === receiver) return refused("hire receipt is signed by the requester itself");

    const tx = await context.payments.getTransaction({hash: receipt.payment}).catch(() => null);
    if (tx === null) return refused(`payment ${receipt.payment} not found`);
    const mined = await context.payments
        .getTransactionReceipt({hash: receipt.payment})
        .catch(() => null);
    if (mined === null) return refused(`payment ${receipt.payment} is not mined`);
    if (mined.status !== "success") return refused(`payment ${receipt.payment} reverted`);
    if (getAddress(tx.from) !== receiver) {
        return refused(`payment came from ${tx.from}, not from ${receiver}`);
    }
    // The node's payee and its receipt key are one account (`apps/node/src/task.ts`), so a payment
    // to anyone else is not the payment this receipt is about.
    if (tx.to === null || getAddress(tx.to) !== callee) {
        return refused(
            `payment went to ${tx.to ?? "no one"}, not to the receipt's signer ${callee}`,
        );
    }
    if (tx.value !== BigInt(receipt.paid)) {
        return refused(`payment moved ${tx.value}, the receipt says ${receipt.paid}`);
    }
    if (tx.value === 0n) return refused("payment moved nothing");
    return {
        status: "proven",
        kind: "hire",
        strength: "strong",
        cost: tx.value,
        id: `hire:${context.chainId}:${receipt.payment.toLowerCase()}`,
        object: null,
    };
}

async function checkContent(
    signed: SignedContentReceipt,
    context: ProofCheckContext,
): Promise<ProofVerdict> {
    const verdict = await verifyContentReceipt(signed);
    if (verdict.status === "malformed") return refused(`content receipt: ${verdict.reason}`);
    if (verdict.status === "mismatch") return refused("content receipt: signature does not match");
    if (signed.chainId !== context.chainId) {
        return refused(
            `content receipt is for chain ${signed.chainId}, deposits are on ${context.chainId}`,
        );
    }
    const read = corroborationOf(
        signed.receipt,
        verdict.signer,
        context.receiver,
        context.acceptedContentSigners,
    );
    if (read.status !== "second-party") return refused(`content receipt is ${read.status}`);
    return {
        status: "proven",
        kind: "content",
        strength: "access",
        cost: null,
        id: `content:${context.chainId}:${read.signer.toLowerCase()}:${signed.receipt.nonce.toLowerCase()}`,
        object: signed.receipt.atom,
    };
}

/**
 * Whether a proof makes the receiver's deposit eligible, and what it cost.
 *
 * It reads the chain for a hire proof (the payment) and nothing for a content proof. Every refusal
 * carries its reason, because the caller is an agent that will either fix the request or deposit
 * its own TRUST, and ARP indexes that as _declared_ (ADR `0094` §2).
 */
export async function checkSponsorProof(
    proof: SponsorProof,
    context: ProofCheckContext,
): Promise<ProofVerdict> {
    if (typeof proof !== "object" || proof === null) return refused("no proof");
    try {
        if (proof.kind === "hire") return await checkHire(proof.receipt, context);
        if (proof.kind === "content") return await checkContent(proof.receipt, context);
    } catch (error) {
        // A proof is JSON from a stranger: a missing field throws inside a verifier, and that is a
        // refusal with a reason, never a 500.
        return refused(`proof is malformed: ${String(error).slice(0, 200)}`);
    }
    return refused("unknown proof kind");
}
