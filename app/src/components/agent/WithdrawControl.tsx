import {useId, useState} from "react";
import {useAccount, useSwitchChain} from "wagmi";
import {formatEther, type Hex} from "viem";

import {controlClass, linkClass, primaryControlClass} from "../../lib/control-class";
import {useStakeActions} from "../../hooks/use-stake-actions";
import {INTUITION_MAINNET_CHAIN_ID, mainnetTxUrl} from "../../lib/intuition-mainnet";
import {formatTrust} from "../../services/trust-format";
import {parseShareAmount, type RedeemQuote} from "../../services/trust-stake";
import {type HeadingTag} from "./StakeControl";

/**
 * The exit: take a position back off an agent or a tool.
 *
 * Its reason for existing is the whole shape of the thing — _« soit on mise sur un agent soit on
 * retire notre mise, c'est un market »_. A deposit nobody can withdraw is a donation, and a market
 * where the only direction is in is not a market. ADR `0056`.
 *
 * Three explicit steps like the deposit side — choose, review, sign — and nothing advances on its
 * own. No effect, no retry, and `handleConfirm` is reachable from exactly one click, because a
 * resubmitted redemption burns shares the account no longer holds.
 *
 * **Denominated in shares, with the TRUST shown beside it.** A redemption is a share burn and the
 * TRUST out depends on the curve, so a form that took TRUST would be inverting a bonding curve in
 * the browser and presenting the result as the amount. `previewRedeem` is the only thing that knows.
 */

type Phase =
    | {step: "form"}
    | {step: "quoting"}
    | {step: "confirm"; quote: RedeemQuote}
    | {step: "signing"; quote: RedeemQuote}
    | {step: "sent"; quote: RedeemQuote; hash: Hex}
    | {step: "done"; quote: RedeemQuote; hash: Hex}
    /**
      * `hash` is the difference between "we never sent anything" and "we sent it and then lost
      * sight of it". On a surface that moves real value those are not the same sentence, and only
      * one of them may offer to sign again.
      */
    | {step: "error"; message: string; hash: Hex | null};

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

export function WithdrawControl({
    termId,
    curveId,
    /** What the connected account holds here, from the chain. The ceiling and the "all" value. */
    heldShares,
    onSettled,
    /** Same reason as `StakeControl`'s: the level belongs to the parent, not to the control. */
    headingLevel: Heading = "h4",
}: {
    termId: Hex;
    curveId: bigint | undefined;
    heldShares: bigint | null;
    onSettled: () => void;
    headingLevel?: HeadingTag;
}) {
    const {address, isConnected, chainId} = useAccount();
    const {switchChainAsync, isPending: isSwitching} = useSwitchChain();
    const {quoteExit, submitExit, awaitReceipt} = useStakeActions();

    const [amount, setAmount] = useState("");
    const [phase, setPhase] = useState<Phase>({step: "form"});
    const [switchError, setSwitchError] = useState<string | null>(null);
    const fieldId = useId();

    const onMainnet = chainId === INTUITION_MAINNET_CHAIN_ID;
    const held = heldShares ?? 0n;
    const check = parseShareAmount(amount, held);

    // Nothing to take out: the section is absent rather than disabled. A form that cannot be used is
    // a control that has to be explained, and there is nothing to explain — the account holds none.
    //
    // **Gated on the phase, and that is the whole point.** `onSettled` refetches the vault, so after
    // a FULL withdrawal `getShares` returns 0 and this would unmount the component mid-receipt —
    // taking the hash, the TRUST figure and the explorer link with it, on the path the "All of it"
    // button makes the encouraged one. The receipt outlives the holding that produced it, and the
    // section disappears when the user dismisses it and the phase returns to `form`.
    if ((heldShares === null || heldShares === 0n) && phase.step === "form") return null;

    const isQuoting = phase.step === "quoting";
    const canReview =
        isConnected &&
        onMainnet &&
        curveId !== undefined &&
        check.status === "ok" &&
        phase.step === "form";

    async function handleSwitch() {
        setSwitchError(null);
        try {
            await switchChainAsync({chainId: INTUITION_MAINNET_CHAIN_ID});
        } catch (error) {
            setSwitchError(errorMessage(error));
        }
    }

    async function handleReview() {
        if (check.status !== "ok" || address === undefined || curveId === undefined) return;
        setPhase({step: "quoting"});
        try {
            const quote = await quoteExit({
                termId,
                curveId,
                shares: check.value,
                receiver: address,
            });
            setPhase({step: "confirm", quote});
        } catch (error) {
            setPhase({step: "error", message: errorMessage(error), hash: null});
        }
    }

    async function handleConfirm() {
        if (phase.step !== "confirm") return;
        const {quote} = phase;
        setPhase({step: "signing", quote});
        // Held outside the try so the catch can tell a redemption that never went out from one that
        // did and then lost sight of itself. Only the first may offer to sign again.
        let broadcast: Hex | null = null;
        try {
            const hash = await submitExit(quote);
            broadcast = hash;
            setPhase({step: "sent", quote, hash});
            await awaitReceipt(hash);
            setPhase({step: "done", quote, hash});
            onSettled();
        } catch (error) {
            setPhase({step: "error", message: errorMessage(error), hash: broadcast});
        }
    }

    return (
        <section aria-labelledby={`${fieldId}-heading`} className="mt-10">
            <Heading id={`${fieldId}-heading`} className="font-medium">
                Withdraw
            </Heading>
            <p className="mt-1 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)] max-w-[60ch]">
                You hold <span className="font-mono">{formatTrust(held)}</span> shares here. Burning
                them returns TRUST at the curve&rsquo;s current price, less the exit fee.
            </p>

            {phase.step === "confirm" || phase.step === "signing" ? (
                <div className="mt-4 border border-[color:var(--color-rule-strong)] p-4 max-w-[36rem]">
                    <p className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                        Confirm before your wallet opens
                    </p>
                    <p className="mt-3 text-[length:var(--text-body-sm)] max-w-[52ch]">
                        You are about to burn{" "}
                        <span className="font-mono">{formatTrust(phase.quote.shares)}</span> shares
                        and receive{" "}
                        <span className="font-mono">
                            {formatTrust(phase.quote.assetsAfterFees)} TRUST
                        </span>
                        , after fees.
                    </p>
                    <p className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)] max-w-[52ch]">
                        Real TRUST, Intuition mainnet.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={phase.step === "signing"}
                            className={primaryControlClass}
                        >
                            {phase.step === "signing" ? "Waiting for your wallet…" : "Withdraw"}
                        </button>
                        <button
                            type="button"
                            onClick={() => setPhase({step: "form"})}
                            disabled={phase.step === "signing"}
                            className={controlClass}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : phase.step === "sent" || phase.step === "done" ? (
                <div
                    className="mt-4 border border-[color:var(--color-accent)] p-4 max-w-[36rem]"
                    role="status"
                >
                    <p className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-accent)]">
                        {phase.step === "done"
                            ? "Withdrawn"
                            : "Submitted — waiting for the receipt"}
                    </p>
                    <p className="mt-3 text-[length:var(--text-body-sm)] max-w-[52ch]">
                        {formatTrust(phase.quote.assetsAfterFees)} TRUST back to your wallet.
                        {phase.step === "done"
                            ? null
                            : " Nothing above has been updated yet — it will refresh once the receipt lands."}
                    </p>
                    <p className="mt-3 font-mono text-[length:var(--text-body-sm)]">
                        <a
                            href={mainnetTxUrl(phase.hash)}
                            target="_blank"
                            rel="noreferrer"
                            className={linkClass}
                        >
                            Transaction →
                        </a>
                    </p>
                    {phase.step === "done" ? (
                        <button
                            type="button"
                            onClick={() => {
                                setPhase({step: "form"});
                                setAmount("");
                            }}
                            className={`mt-4 ${controlClass}`}
                        >
                            Done
                        </button>
                    ) : null}
                </div>
            ) : phase.step === "error" ? (
                <div className="mt-4" role="alert">
                    <p className="text-[length:var(--text-body-sm)] max-w-[60ch] break-words">
                        {phase.message}
                    </p>
                    {phase.hash === null ? null : (
                        <p className="mt-2 text-[length:var(--text-body-sm)] max-w-[60ch]">
                            The transaction went out. It may still land — check it before signing
                            anything again.{" "}
                            <a
                                href={mainnetTxUrl(phase.hash)}
                                target="_blank"
                                rel="noreferrer"
                                className={`font-mono ${linkClass}`}
                            >
                                Transaction →
                            </a>
                        </p>
                    )}
                    <button
                        type="button"
                        onClick={() => setPhase({step: "form"})}
                        className={`mt-3 ${controlClass}`}
                    >
                        Back
                    </button>
                </div>
            ) : (
                <div className="mt-4 max-w-[34rem]">
                    <label
                        htmlFor={`${fieldId}-shares`}
                        className="block font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]"
                    >
                        Shares
                    </label>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                        <input
                            id={`${fieldId}-shares`}
                            type="text"
                            inputMode="decimal"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            placeholder="0.0"
                            // Only when there is a message to point at: a dangling IDREF is worse
                            // than none, because it reads as a description that failed to load.
                            aria-describedby={
                                check.status === "empty" || check.status === "ok"
                                    ? undefined
                                    : `${fieldId}-shares-error`
                            }
                            className="w-48 border border-[color:var(--color-rule-strong)] bg-transparent px-3 py-1.5 font-mono tabular-nums"
                        />
                        {/* The exact held value, not a formatted one re-parsed: formatting rounds,
                            and a rounded "all" either leaves dust behind or exceeds the holding. */}
                        <button
                            type="button"
                            onClick={() => setAmount(formatEther(held))}
                            className={controlClass}
                        >
                            All of it
                        </button>
                    </div>

                    {check.status === "empty" || check.status === "ok" ? null : (
                        <p
                            id={`${fieldId}-shares-error`}
                            className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]"
                        >
                            {check.status === "unparseable"
                                ? "Not a number."
                                : check.status === "not-positive"
                                  ? "Enter a number greater than zero."
                                  : `More than you hold (${formatTrust(check.held)} shares).`}
                        </p>
                    )}

                    {!isConnected ? (
                        <p className="mt-4 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                            Connect a wallet to withdraw.
                        </p>
                    ) : !onMainnet ? (
                        <div className="mt-4">
                            <p className="text-[length:var(--text-body-sm)] max-w-[60ch]">
                                Your wallet is on chain{" "}
                                <span className="font-mono">{chainId ?? "unknown"}</span>. This
                                withdrawal happens on Intuition mainnet (
                                {INTUITION_MAINNET_CHAIN_ID}).
                            </p>
                            <button
                                type="button"
                                onClick={handleSwitch}
                                disabled={isSwitching}
                                className={`mt-3 ${controlClass}`}
                            >
                                Switch to Intuition mainnet
                            </button>
                            {switchError === null ? null : (
                                <p
                                    className="mt-2 text-[length:var(--text-body-sm)] max-w-[60ch]"
                                    role="alert"
                                >
                                    {switchError}
                                </p>
                            )}
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={handleReview}
                            disabled={!canReview}
                            className={`mt-4 ${controlClass}`}
                        >
                            {isQuoting ? "Pricing…" : "Review"}
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}
