import type {Address, Hex} from "viem";

import type {IdentityAtomPlan} from "@arp-protocol/core";

import type {
    CanonicalAgentAtom,
    ImportConsent,
    ImportLinkPlan,
    OwnershipVerdict,
} from "../../services/agent-import";

export type StepStatus = "idle" | "pending" | "done" | "error";

/** What the operator signed in step 2, kept apart from what step 1 proved. */
export type SignedConsent = {consent: ImportConsent; signature: Hex; signedOnChainId: number};

/** What step 1 established, once it succeeded. */
export type ProvenAgent = {
    chainId: number;
    tokenId: string;
    caip19: string;
    owner: Address;
    atom: CanonicalAgentAtom | null;
    operatingAccount: Address;
};

/**
 * A re-sign keeps the signature it would replace, as `previous`, until a new one arrives. That
 * signature is still valid, and dropping it on a rejected prompt would leave a priced link with no
 * agent to publish it for.
 */
export type ConsentState =
    | {stage: "unsigned"; error: string | null; previous: SignedConsent | null}
    | {stage: "signing"; previous: SignedConsent | null}
    | {stage: "signed"; signed: SignedConsent};

/** A priced write: price it, then send it. An error drops back to the stage before the attempt. */
export type WriteState<Plan, Result> =
    | {stage: "unpriced"; error: string | null}
    | {stage: "pricing"}
    | {stage: "priced"; plan: Plan; error: string | null}
    | {stage: "sending"; plan: Plan}
    | {stage: "sent"; plan: Plan; result: Result};

export type LinkTxs = {atomTx?: Hex; tripleTx?: Hex};

/**
 * The whole page. Steps 2 and 3 exist only inside `proven`, so checking another token cannot leave
 * the previous token's signature or priced calls behind: there is nowhere for them to survive.
 */
export type Phase =
    | {step: "idle"}
    | {step: "checking"}
    | {step: "check-failed"; message: string}
    | {step: "refused"; verdict: OwnershipVerdict}
    | {
          step: "proven";
          proven: ProvenAgent;
          consent: ConsentState;
          link: WriteState<ImportLinkPlan, LinkTxs>;
          identity: WriteState<IdentityAtomPlan, Hex[]>;
      };

export type ProvenPhase = Extract<Phase, {step: "proven"}>;

export function provenPhase(proven: ProvenAgent): ProvenPhase {
    return {
        step: "proven",
        proven,
        consent: {stage: "unsigned", error: null, previous: null},
        link: {stage: "unpriced", error: null},
        identity: {stage: "unpriced", error: null},
    };
}

export function proofStatus(phase: Phase): StepStatus {
    if (phase.step === "idle") return "idle";
    if (phase.step === "checking") return "pending";
    if (phase.step === "check-failed") return "error";
    return "done";
}

/** The signature the page can publish with: the current one, or the one a re-sign would replace. */
export function signedConsent(consent: ConsentState): SignedConsent | null {
    return consent.stage === "signed" ? consent.signed : consent.previous;
}

export function consentStatus(consent: ConsentState): StepStatus {
    if (consent.stage === "signing") return "pending";
    if (consent.stage === "signed") return "done";
    return consent.error === null ? "idle" : "error";
}

export function writeStatus(write: WriteState<unknown, unknown>): StepStatus {
    if (write.stage === "pricing" || write.stage === "sending") return "pending";
    if (write.stage === "sent") return "done";
    return write.error === null ? "idle" : "error";
}

export function writeError(write: WriteState<unknown, unknown>): string | null {
    return write.stage === "unpriced" || write.stage === "priced" ? write.error : null;
}

export function writePlan<Plan>(write: WriteState<Plan, unknown>): Plan | null {
    return write.stage === "unpriced" || write.stage === "pricing" ? null : write.plan;
}

export function writeResult<Result>(write: WriteState<unknown, Result>): Result | null {
    return write.stage === "sent" ? write.result : null;
}

/** Sets or clears the error at the write's current stage; a write in flight or sent is unchanged. */
export function withError<Plan, Result>(
    write: WriteState<Plan, Result>,
    error: string | null,
): WriteState<Plan, Result> {
    return write.stage === "unpriced" || write.stage === "priced" ? {...write, error} : write;
}
