import {useId, useState} from "react";
import {parseEther, isAddress, type Address} from "viem";
import {useAccount} from "wagmi";
import type {Delegation} from "@metamask/smart-accounts-kit";

import {controlClass, primaryControlClass} from "../../lib/control-class";
import {useChainChoice} from "../../lib/chain-choice";
import {connectedWalletClient} from "../../hooks/wallet-client";
import {planHire, signHire, type HireDraft} from "../../services/hire";
import {formatTrust, truncateMiddle} from "../../services/trust-format";

/**
 * The authority a buyer signs to hire an agent.
 *
 * Three explicit steps — describe, review, sign — and nothing advances on its own. The middle step
 * exists because the whole point of a bounded delegation is that the bounds are **read before they
 * are signed**, and a form that prepared and signed in one click would be a spend limit nobody saw.
 *
 * What is signed is an authority, not a payment: the agent spends from the buyer's account when it
 * redeems, up to the budget, at the MultiVault, on the three methods the bound allows. `redeem` is
 * not one of them, so an agent cannot return the buyer's deposits to itself.
 */

type Phase =
    | {step: "form"}
    | {step: "preparing"}
    | {step: "review"; draft: HireDraft}
    | {step: "signing"; draft: HireDraft}
    | {step: "signed"; draft: HireDraft; delegation: Delegation}
    | {step: "error"; message: string};

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function HireForm({agentLabel}: {agentLabel: string}) {
    const {address, isConnected} = useAccount();
    const chain = useChainChoice();
    const fieldId = useId();

    const [seller, setSeller] = useState("");
    const [budget, setBudget] = useState("");
    const [phase, setPhase] = useState<Phase>({step: "form"});

    const sellerValid = isAddress(seller.trim());
    let budgetWei: bigint | null = null;
    try {
        budgetWei = budget.trim() === "" ? null : parseEther(budget.trim());
    } catch {
        budgetWei = null;
    }
    const isPreparing = phase.step === "preparing";
    const canPrepare =
        isConnected && sellerValid && budgetWei !== null && budgetWei > 0n && phase.step === "form";

    async function handlePrepare() {
        if (address === undefined || !sellerValid || budgetWei === null) return;
        setPhase({step: "preparing"});
        try {
            const walletClient = await connectedWalletClient();
            const draft = await planHire({
                owner: address,
                walletClient,
                seller: seller.trim() as Address,
                budget: budgetWei,
                multiVault: chain.multiVault,
                chainId: chain.chainId,
                isDeployed: async (account) =>
                    (await chain.client.getCode({address: account})) !== undefined,
            });
            setPhase({step: "review", draft});
        } catch (error) {
            setPhase({step: "error", message: errorMessage(error)});
        }
    }

    async function handleSign() {
        if (phase.step !== "review" || address === undefined) return;
        const {draft} = phase;
        setPhase({step: "signing", draft});
        try {
            const walletClient = await connectedWalletClient();
            const delegation = await signHire({owner: address, walletClient, plan: draft.plan});
            setPhase({step: "signed", draft, delegation});
        } catch (error) {
            setPhase({step: "error", message: errorMessage(error)});
        }
    }

    if (!isConnected) {
        return (
            <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                Connect a wallet to hire {agentLabel}.
            </p>
        );
    }

    if (phase.step === "signed") {
        return (
            <div className="border border-[color:var(--color-accent)] p-4" role="status">
                <p className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-accent)]">
                    Authority signed
                </p>
                <p className="mt-3 max-w-[52ch] text-[length:var(--text-body-sm)]">
                    Give this to {agentLabel}. It spends from{" "}
                    <span className="font-mono">{truncateMiddle(phase.draft.buyer, 8, 6)}</span>, up
                    to <span className="font-mono">{formatTrust(phase.draft.plan.budget)}</span>.
                </p>
                {/* Said because a signature that cannot be redeemed looks identical to one that
                    can, and the difference only shows when the agent tries. */}
                {phase.draft.deployed ? null : (
                    <p className="mt-3 max-w-[52ch] text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                        Your account is not deployed yet, so this cannot be redeemed until it is.
                    </p>
                )}
                <pre className="mt-3 max-h-48 overflow-auto border border-[color:var(--color-rule)] p-3 font-mono text-[length:var(--text-label)]">
                    {JSON.stringify(
                        phase.delegation,
                        (_key, value) => (typeof value === "bigint" ? value.toString() : value),
                        1,
                    )}
                </pre>
            </div>
        );
    }

    if (phase.step === "review" || phase.step === "signing") {
        return (
            <div className="border border-[color:var(--color-rule-strong)] p-4">
                <p className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                    What you are about to authorise
                </p>
                <dl className="mt-3 flex flex-col gap-2 text-[length:var(--text-body-sm)]">
                    {phase.draft.plan.bounds.map((bound) => (
                        <div key={bound.name} className="flex flex-wrap items-baseline gap-x-3">
                            <dt className="text-[color:var(--color-steel)]">{bound.describes}</dt>
                            <dd className="font-mono">
                                {bound.name === "NativeTokenTransferAmountEnforcer"
                                    ? formatTrust(phase.draft.plan.budget)
                                    : bound.name === "AllowedTargetsEnforcer"
                                      ? truncateMiddle(chain.multiVault, 8, 6)
                                      : bound.name === "TimestampEnforcer"
                                        ? new Date(
                                              (phase.draft.plan.expiresAt ?? 0) * 1000,
                                          ).toISOString().slice(0, 10)
                                        : "deposit · createAtoms · createTriples"}
                            </dd>
                        </div>
                    ))}
                </dl>
                <div className="mt-5 flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={handleSign}
                        disabled={phase.step === "signing"}
                        className={primaryControlClass}
                    >
                        {phase.step === "signing" ? "Waiting for your wallet…" : "Sign the authority"}
                    </button>
                    <button
                        type="button"
                        onClick={() => setPhase({step: "form"})}
                        disabled={phase.step === "signing"}
                        className={controlClass}
                    >
                        Back
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-[34rem]">
            {phase.step === "error" ? (
                <p className="mb-3 text-[length:var(--text-body-sm)] break-words" role="alert">
                    {phase.message}
                </p>
            ) : null}

            <label
                htmlFor={`${fieldId}-seller`}
                className="block font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]"
            >
                Its runtime address
            </label>
            <input
                id={`${fieldId}-seller`}
                type="text"
                value={seller}
                onChange={(event) => setSeller(event.target.value)}
                placeholder="0x…"
                className="mt-2 w-full border border-[color:var(--color-rule-strong)] bg-transparent px-3 py-1.5 font-mono"
            />
            {/* The one field a buyer cannot look up, and the service says why: an agent's atom
                resolves to its NFT and its owner, neither of which is the key it signs with. */}
            <p className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                Not on the graph — ask the agent for it.
            </p>

            <label
                htmlFor={`${fieldId}-budget`}
                className="mt-5 block font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]"
            >
                Budget ({chain.symbol})
            </label>
            <input
                id={`${fieldId}-budget`}
                type="text"
                inputMode="decimal"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                placeholder="0.0"
                className="mt-2 w-48 border border-[color:var(--color-rule-strong)] bg-transparent px-3 py-1.5 font-mono tabular-nums"
            />

            <button
                type="button"
                onClick={handlePrepare}
                disabled={!canPrepare}
                className={`mt-5 ${controlClass}`}
            >
                {isPreparing ? "Preparing…" : "Review the bounds"}
            </button>
        </div>
    );
}
