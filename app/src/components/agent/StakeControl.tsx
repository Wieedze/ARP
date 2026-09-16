import {useId, useState} from "react";
import {useAccount, useSwitchChain} from "wagmi";
import type {Hex} from "viem";

import {useStakeActions} from "../../hooks/use-stake-actions";
import {INTUITION_MAINNET_CHAIN_ID, mainnetTxUrl} from "../../lib/intuition-mainnet";
import type {TrustRow} from "../../services/agent-trust";
import {formatTrust, truncateMiddle} from "../../services/trust-format";
import {
    MAX_STAKE_WEI,
    MIN_SHARES_TOLERANCE_BPS,
    parseStakeAmount,
    type StakeQuote,
    type StakeSession,
    type StakeSide,
} from "../../services/trust-stake";

/**
 * The stake control. Real TRUST, Intuition mainnet, authorised by ADR 0017.
 *
 * The flow is deliberately three explicit steps — choose, review, sign — and
 * nothing advances on its own. There is no effect in this component, no retry
 * that resubmits, and no code path where arriving at or leaving this route
 * causes a transaction (safeguard 5). `handleConfirm` is reachable from exactly
 * one click.
 */

type Phase =
    | {step: "form"}
    | {step: "quoting"}
    | {step: "confirm"; quote: StakeQuote}
    | {step: "signing"; quote: StakeQuote}
    | {step: "sent"; quote: StakeQuote; hash: Hex}
    | {step: "done"; quote: StakeQuote; hash: Hex}
    | {step: "error"; message: string; back: "form" | "confirm"; quote: StakeQuote | null};

const SIDES: StakeSide[] = ["support", "oppose"];

const SIDE_COPY: Record<StakeSide, {label: string; sentence: string}> = {
    support: {
        label: "Support",
        sentence: "the claim is worth trusting — deposit into the triple's own vault",
    },
    oppose: {
        label: "Oppose",
        sentence: "the claim is not worth trusting — deposit into its counter-triple",
    },
};

const controlClass =
    "px-3 py-1.5 text-[length:var(--text-body-sm)] border border-[color:var(--color-border-strong)] " +
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 " +
    "focus-visible:outline-[color:var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed";

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

export function StakeControl({
    row,
    session,
    sessionError,
    onSettled,
}: {
    row: TrustRow;
    session: StakeSession | undefined;
    sessionError: Error | null;
    onSettled: () => void;
}) {
    const {address, isConnected, chainId} = useAccount();
    const {switchChainAsync, isPending: isSwitching} = useSwitchChain();
    const {quote: buildQuote, submit, awaitReceipt} = useStakeActions();

    const [side, setSide] = useState<StakeSide | null>(null);
    // Safeguard 2: empty, and nothing in this file ever seeds it.
    const [amount, setAmount] = useState("");
    const [phase, setPhase] = useState<Phase>({step: "form"});
    const [switchError, setSwitchError] = useState<string | null>(null);

    const fieldId = useId();
    const onMainnet = chainId === INTUITION_MAINNET_CHAIN_ID;

    if (row.tripleId === null) return null;
    const tripleId = row.tripleId;

    const check =
        session === undefined
            ? null
            : parseStakeAmount(amount, {minDeposit: session.minDeposit, maxStake: MAX_STAKE_WEI});

    const canReview =
        session !== undefined &&
        isConnected &&
        onMainnet &&
        side !== null &&
        check?.status === "ok" &&
        phase.step === "form";

    async function handleSwitch() {
        setSwitchError(null);
        try {
            await switchChainAsync({chainId: INTUITION_MAINNET_CHAIN_ID});
        } catch (error) {
            setSwitchError(errorMessage(error));
        }
    }

    /** Step 2. Reads the chain; signs nothing. */
    async function handleReview() {
        if (session === undefined || side === null || address === undefined) return;
        if (check?.status !== "ok") return;
        setPhase({step: "quoting"});
        try {
            const quote = await buildQuote({
                tripleId,
                side,
                assets: check.value,
                receiver: address,
                session,
            });
            setPhase({step: "confirm", quote});
        } catch (error) {
            setPhase({step: "error", message: errorMessage(error), back: "form", quote: null});
        }
    }

    /** Step 3. The only path in the app that signs a mainnet transaction. */
    async function handleConfirm(quote: StakeQuote) {
        setPhase({step: "signing", quote});
        try {
            const hash = await submit(quote);
            setPhase({step: "sent", quote, hash});
            await awaitReceipt(hash);
            setPhase({step: "done", quote, hash});
            onSettled();
        } catch (error) {
            setPhase({
                step: "error",
                message: errorMessage(error),
                back: "confirm",
                quote,
            });
        }
    }

    return (
        <section className="mt-6 border-t border-[color:var(--color-border)] pt-5">
            <h4 className="font-medium">Take a position</h4>
            <p className="mt-1 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] max-w-[60ch]">
                A deposit into this claim's vault on Intuition mainnet. Real TRUST, not recoverable
                by this panel. Up to{" "}
                <span className="font-mono">{formatTrust(MAX_STAKE_WEI)} TRUST</span> per
                transaction.
            </p>

            {!isConnected ? (
                <p className="mt-4 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                    Connect a wallet to take a position.
                </p>
            ) : sessionError !== null ? (
                <p className="mt-4 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                    The MultiVault's deposit minimum could not be read ({sessionError.message}).
                    Staking stays closed until it can be.
                </p>
            ) : session === undefined ? (
                <p className="mt-4 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                    Reading the MultiVault's curve and deposit minimum…
                </p>
            ) : !onMainnet ? (
                <div className="mt-4">
                    <p className="text-[length:var(--text-body-sm)] max-w-[60ch]">
                        Your wallet is on chain{" "}
                        <span className="font-mono">{chainId ?? "unknown"}</span>. This deposit goes
                        to Intuition mainnet ({INTUITION_MAINNET_CHAIN_ID}) and the panel will not
                        build a transaction until your wallet is there.
                    </p>
                    <button
                        type="button"
                        onClick={handleSwitch}
                        disabled={isSwitching}
                        className={`mt-3 ${controlClass}`}
                    >
                        Switch to Intuition mainnet
                    </button>
                    {isSwitching ? (
                        <p className="mt-2 text-[length:var(--text-body-sm)]" role="status">
                            Waiting for your wallet to confirm the network switch.
                        </p>
                    ) : null}
                    {switchError !== null ? (
                        <p className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                            {switchError}
                        </p>
                    ) : null}
                </div>
            ) : phase.step === "confirm" || phase.step === "signing" ? (
                <ConfirmStep
                    quote={phase.quote}
                    row={row}
                    isSigning={phase.step === "signing"}
                    onCancel={() => setPhase({step: "form"})}
                    onConfirm={() => handleConfirm(phase.quote)}
                />
            ) : phase.step === "sent" || phase.step === "done" ? (
                <Receipt
                    hash={phase.hash}
                    quote={phase.quote}
                    settled={phase.step === "done"}
                    onReset={() => {
                        setPhase({step: "form"});
                        setAmount("");
                        setSide(null);
                    }}
                />
            ) : phase.step === "error" ? (
                <div className="mt-4" role="alert">
                    <p className="text-[length:var(--text-body-sm)] max-w-[60ch] break-words">
                        Nothing was staked. {phase.message}
                    </p>
                    <button
                        type="button"
                        onClick={() =>
                            setPhase(
                                phase.back === "confirm" && phase.quote !== null
                                    ? {step: "confirm", quote: phase.quote}
                                    : {step: "form"},
                            )
                        }
                        className={`mt-3 ${controlClass}`}
                    >
                        Back
                    </button>
                </div>
            ) : (
                <div className="mt-4 max-w-[34rem]">
                    <fieldset className="border-0 p-0 m-0">
                        <legend className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]">
                            Side
                        </legend>
                        <div className="mt-2 flex flex-col gap-2">
                            {SIDES.map((option) => (
                                <label
                                    key={option}
                                    className="flex items-start gap-3 border border-[color:var(--color-border)] px-3 py-2 cursor-pointer has-[:checked]:border-[color:var(--color-accent)]"
                                >
                                    <input
                                        type="radio"
                                        name={`${fieldId}-side`}
                                        value={option}
                                        checked={side === option}
                                        onChange={() => setSide(option)}
                                        className="mt-1 accent-[color:var(--color-accent)]"
                                    />
                                    <span className="text-[length:var(--text-body-sm)]">
                                        <span className="font-medium">
                                            {SIDE_COPY[option].label}
                                        </span>
                                        <span className="block text-[color:var(--color-fg-60)]">
                                            {SIDE_COPY[option].sentence}
                                        </span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    <div className="mt-4">
                        <label
                            htmlFor={`${fieldId}-amount`}
                            className="block font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]"
                        >
                            Amount (TRUST)
                        </label>
                        <input
                            id={`${fieldId}-amount`}
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            aria-describedby={`${fieldId}-amount-help`}
                            className="mt-2 block w-48 bg-transparent border border-[color:var(--color-border-strong)] px-3 py-1.5 font-mono focus:outline-none focus:border-[color:var(--color-accent)]"
                        />
                        <p
                            id={`${fieldId}-amount-help`}
                            className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] max-w-[52ch]"
                        >
                            {check !== null && check.status !== "ok" && check.status !== "empty" ? (
                                check.message
                            ) : (
                                <>
                                    Minimum{" "}
                                    <span className="font-mono">
                                        {formatTrust(session.minDeposit)}
                                    </span>{" "}
                                    (the MultiVault's own{" "}
                                    <span className="font-mono">minDeposit</span>
                                    ), ceiling{" "}
                                    <span className="font-mono">
                                        {formatTrust(MAX_STAKE_WEI)}
                                    </span>{" "}
                                    per transaction.
                                </>
                            )}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={handleReview}
                        disabled={!canReview}
                        className={`mt-4 ${controlClass}`}
                    >
                        {phase.step === "quoting" ? "Reading the vault…" : "Review this stake"}
                    </button>
                </div>
            )}
        </section>
    );
}

/**
 * Safeguard 4. Everything the wallet is about to be asked to do, restated in
 * words before it opens: which claim, which side, how much, what comes back
 * after fees, and how many positions are already in that vault — so nobody
 * discovers afterwards that they were the only participant.
 */
function ConfirmStep({
    quote,
    row,
    isSigning,
    onCancel,
    onConfirm,
}: {
    quote: StakeQuote;
    row: TrustRow;
    isSigning: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    const positions =
        quote.side === "support"
            ? (row.market?.support.positionCount ?? null)
            : (row.market?.opposition.positionCount ?? null);

    return (
        <div className="mt-4 border border-[color:var(--color-border-strong)] p-4 max-w-[36rem]">
            <p className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]">
                Confirm before your wallet opens
            </p>
            <p className="mt-3 text-[length:var(--text-body-sm)] max-w-[52ch]">
                You are about to deposit{" "}
                <span className="font-mono">{formatTrust(quote.assets)} TRUST</span> to{" "}
                <span className="font-medium">{SIDE_COPY[quote.side].label.toLowerCase()}</span> the
                claim that <span className="font-medium">{row.providerName}</span> is a trust
                provider for this agent. Real value, on Intuition mainnet.
            </p>

            <dl className="mt-4 grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-y-2 gap-x-4 text-[length:var(--text-body-sm)]">
                <Term label="Vault" value={truncateMiddle(quote.termId, 12, 8)} />
                <Term label="Curve" value={quote.curveId.toString()} />
                <Term
                    label="Positions there"
                    value={
                        positions === null
                            ? "not reported"
                            : positions === 0
                              ? "none — you would be the first"
                              : positions === 1
                                ? "1 position · 1 distinct staker"
                                : `${positions} positions · ${positions} distinct stakers`
                    }
                />
                <Term label="Shares minted" value={formatTrust(quote.expectedShares)} />
                <Term
                    label="After fees"
                    value={`${formatTrust(quote.assetsAfterFees)} TRUST of ${formatTrust(quote.assets)}`}
                />
                <Term label="Fees" value={`${formatTrust(quote.feeAssets)} TRUST`} />
                <Term
                    label="Minimum shares"
                    value={`${formatTrust(quote.minShares)} (${Number(MIN_SHARES_TOLERANCE_BPS) / 100}% slippage floor)`}
                />
                <Term label="Receiver" value={truncateMiddle(quote.receiver, 8, 6)} />
            </dl>

            <p className="mt-3 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] max-w-[52ch]">
                Shares are not linear in the deposit: protocol fee, entry fee and the triple's atom
                deposit fraction all apply before the bonding curve prices what is left. These are
                the numbers <span className="font-mono">previewDeposit</span> returned just now.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={onConfirm}
                    disabled={isSigning}
                    className={`${controlClass} border-[color:var(--color-accent)] text-[color:var(--color-accent)]`}
                >
                    Sign in wallet
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={isSigning}
                    className={controlClass}
                >
                    Cancel
                </button>
            </div>
            {/* Outside the buttons on purpose: a disabled control is dimmed to
                40%, and the one line telling the user what is happening should
                not be the least readable thing on screen. */}
            {isSigning ? (
                <p className="mt-3 text-[length:var(--text-body-sm)]" role="status">
                    Waiting for your wallet. Nothing has been sent until you sign.
                </p>
            ) : null}
        </div>
    );
}

function Receipt({
    hash,
    quote,
    settled,
    onReset,
}: {
    hash: Hex;
    quote: StakeQuote;
    settled: boolean;
    onReset: () => void;
}) {
    return (
        <div
            className="mt-4 border border-[color:var(--color-accent)] p-4 max-w-[36rem]"
            role="status"
        >
            <p className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-accent)]">
                {settled ? "Position taken" : "Submitted — waiting for the receipt"}
            </p>
            <p className="mt-3 text-[length:var(--text-body-sm)] max-w-[52ch]">
                {formatTrust(quote.assets)} TRUST deposited to{" "}
                {quote.side === "support" ? "support" : "oppose"} this claim.{" "}
                {settled
                    ? "The market figures above refresh from the chain, not from an assumption about what this transaction did."
                    : "Nothing above has been updated yet — it will refresh once the receipt lands."}
            </p>
            <p className="mt-3 font-mono text-[length:var(--text-body-sm)]">
                <a
                    href={mainnetTxUrl(hash)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[color:var(--color-accent)]"
                >
                    {truncateMiddle(hash, 12, 8)} ↗
                </a>
            </p>
            {settled ? (
                <button type="button" onClick={onReset} className={`mt-4 ${controlClass}`}>
                    Take another position
                </button>
            ) : null}
        </div>
    );
}

function Term({label, value}: {label: string; value: string}) {
    return (
        <>
            <dt className="text-[color:var(--color-fg-60)]">{label}</dt>
            <dd className="font-mono break-all">{value}</dd>
        </>
    );
}
