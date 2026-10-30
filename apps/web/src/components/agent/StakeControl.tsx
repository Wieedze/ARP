import {useId, useState} from "react";
import {useAccount, useSwitchChain} from "wagmi";
import type {Hex} from "viem";

import {controlClass, linkClass, primaryControlClass} from "../../lib/control-class";

import {useStakeActions} from "../../hooks/use-stake-actions";
import {useChainChoice} from "../../lib/chain-choice";
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
 * The stake control. Real value on mainnet, test value on testnet, authorised by ADR 0017.
 *
 * **The chain is the toggle's, not a constant.** It was pinned to 1155, so on testnet the figures
 * read `tTRUST` while this control deposited mainnet `TRUST`. Everything chain-shaped here — the
 * switch prompt, the explorer link, the token in the amount label and in the confirmation — now
 * comes from `quote.chain` where a quote exists and from `useChainChoice` where one does not. The
 * quote is preferred, because it is what the deposit was priced against.
 *
 * The flow is deliberately three explicit steps — choose, review, sign — and
 * nothing advances on its own. There is no effect in this component, no retry
 * that resubmits, and no code path where arriving at or leaving this route
 * causes a transaction (safeguard 5). `handleConfirm` is reachable from exactly
 * one click.
 *
 * The heading names the claim's subject and the confirmation spells the claim out in full, because a
 * reader can land here straight from a URL with nothing scrolled above, and nobody should have to
 * infer what they are about to put real money behind.
 *
 * **What the confirmation says, corrected.** This comment used to claim the confirmation carried
 * "the ceiling and the fact that this is real TRUST". It did not, by then: `99dafd8` removed that
 * sentence. The ceiling is disclosed in the form's help text instead, which is the better place —
 * visible while the number is being chosen. The network is back in the confirmation, and that is
 * deliberate: this control is reused on a page where the only other mention of mainnet can be
 * thousands of pixels up, and ADR `0017`'s own Consequences section names that as the sharpest
 * failure mode the two-network app has.
 */

type Phase =
    | {step: "form"}
    | {step: "quoting"}
    | {step: "confirm"; quote: StakeQuote}
    | {step: "signing"; quote: StakeQuote}
    | {step: "sent"; quote: StakeQuote; hash: Hex}
    | {step: "done"; quote: StakeQuote; hash: Hex}
    /**
     * `hash` is the difference between "we never sent anything" and "we sent it
     * and then lost sight of it". On a surface that moves real value those are
     * not the same sentence, and only one of them may offer to sign again.
     */
    | {
          step: "error";
          message: string;
          back: "form" | "confirm";
          quote: StakeQuote | null;
          hash: Hex | null;
      };

/** The heading tags a caller may ask for. Not `string`: an arbitrary tag is not a heading. */
export type HeadingTag = "h2" | "h3" | "h4";

/** Both sides exist only for a triple. An atom has no counter vault to oppose from (ADR `0056`). */
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

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

/**
 * The claim a deposit backs or contests, reduced to what this control needs.
 *
 * It used to take a `TrustRow`, which tied it to `has trust provider` and to the agent panel. It
 * never read more than four fields off that row, and the `uses` edge market — the one `docs/12` is
 * actually about — had no control at all because of the coupling. So the prop is the claim now.
 *
 * `subject` and `predicate` are rendered, not parsed: "<subject> <predicate>" has to read as the
 * sentence the money goes behind, because that sentence is the last thing shown before a wallet
 * opens (ADR `0017` safeguard 4).
 */
type ClaimShape =
    /** A triple's claim is restated in the confirmation, so its predicate is not optional. */
    | {target: {kind: "triple"; tripleId: Hex}; predicate: string}
    /** An atom carries no assertion, so there is no claim to restate and no predicate to take. */
    | {target: {kind: "atom"; atomId: Hex}; predicate?: undefined};

export type StakeClaim = ClaimShape & {
    subject: string;
    /** The heading above the form. The caller names it, because the two targets are not one act. */
    heading: string;
    /**
     * One line under the heading, or omitted.
     *
     * On the claim and not hardcoded: it read "the market's confidence in this provider's rating
     * of this agent", which is false on a page with no provider and no rating. Optional since
     * ADR `0058` — the agent backing form carries none, because the heading already says the act.
     */
    blurb?: string;
    /**
     * True when `subject` is an id rather than a name, so the confirmation sets it in mono and the
     * caller has already truncated it. An untruncated 66-character atom id in proportional type
     * wraps across two lines mid-sentence, and `rules/ui.md` puts ids in mono.
     */
    subjectIsId?: boolean;
    /**
     * `positionCount` is nullable because a source can report a vault without reporting its
     * positions, and "not reported" is not "none" — the confirmation says which.
     */
    market: {
        support: {positionCount: number | null};
        /** `null` for an atom target — there is no opposition vault, not an empty one. */
        opposition: {positionCount: number | null} | null;
    } | null;
};

export function StakeControl({
    claim,
    session,
    sessionError,
    onSettled,
    onInFlightChange,
    /**
     * The tag for this control's own heading, because its level depends on its parent and not on
     * itself. `RatingRow` opens at `h3`, so `h4` is right there; `AtomMarket` opens at `h2`,
     * where `h4` would skip a level. Hardcoding `h4` put an `h1 → h3 → h4` chain on the agent page
     * under the very `h2` that exists to stop the outline jumping.
     */
    headingLevel: Heading = "h4",
}: {
    claim: StakeClaim;
    session: StakeSession | undefined;
    sessionError: Error | null;
    onSettled: () => void;
    headingLevel?: HeadingTag;
    /**
     * Called `true` the moment a transaction is signed for and `false` on **every** terminal
     * transition — settled or failed — so a parent that can **unmount** this control knows not to.
     *
     * Every exit releasing it is the part that took a round to get right: releasing only on success
     * left no way back from a failure, and the caller's `disabled={inFlight && !isOpen}` then left
     * the open row's own Close enabled, so one click unmounted the control, set `isOpen` false
     * everywhere, and disabled every button on the page until a reload.
     *
     * It exists because a caller that discloses one of these at a time destroys the receipt
     * otherwise: the hash, the explorer link, and the error branch's "it may still land, do not
     * sign it again without checking". `Phase`'s own comment is the reason that matters — the hash
     * is the difference between "we never sent anything" and "we sent it and lost sight of it".
     *
     * Reported from the transition points rather than from a `useEffect`. There are **no effects in
     * this file**, which is what makes ADR `0017` safeguard 5 — never auto-stake, nothing on mount
     * or navigation — checkable by grep rather than by reading.
     */
    onInFlightChange?: (inFlight: boolean) => void;
}) {
    const {address, isConnected, chainId} = useAccount();
    const {switchChainAsync, isPending: isSwitching} = useSwitchChain();
    const {quote: buildQuote, submit, awaitReceipt} = useStakeActions();

    /**
     * The chosen side, and the effective one.
     *
     * For an atom there is exactly one side, so requiring a choice would be a form field with a
     * single option. Safeguard 2 is untouched: the **amount** is what never gets a default, and it
     * still does not.
     */
    const hasCounterVault = claim.target.kind === "triple";
    const [chosenSide, setChosenSide] = useState<StakeSide | null>(null);
    const side: StakeSide | null = hasCounterVault ? chosenSide : "support";
    // Safeguard 2: empty, and nothing in this file ever seeds it.
    const [amount, setAmount] = useState("");
    const [phase, setPhase] = useState<Phase>({step: "form"});
    const [switchError, setSwitchError] = useState<string | null>(null);

    const fieldId = useId();
    const chain = useChainChoice();
    const onTargetChain = chainId === chain.chainId;

    const target = claim.target;

    const check =
        session === undefined
            ? null
            : parseStakeAmount(amount, {
                  minDeposit: session.minDeposit,
                  maxStake: MAX_STAKE_WEI,
                  symbol: chain.symbol,
              });

    const canReview =
        session !== undefined &&
        isConnected &&
        onTargetChain &&
        side !== null &&
        check?.status === "ok" &&
        phase.step === "form";

    async function handleSwitch() {
        setSwitchError(null);
        try {
            await switchChainAsync({chainId: chain.chainId});
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
                target,
                side,
                assets: check.value,
                receiver: address,
                session,
            });
            setPhase({step: "confirm", quote});
        } catch (error) {
            setPhase({
                step: "error",
                message: errorMessage(error),
                back: "form",
                quote: null,
                hash: null,
            });
        }
    }

    /** Step 3. The only path in this control that signs. */
    async function handleConfirm(quote: StakeQuote) {
        setPhase({step: "signing", quote});
        onInFlightChange?.(true);
        // Held outside the try so the catch can tell a deposit that was never
        // broadcast from one that was and whose receipt we then lost.
        let broadcast: Hex | null = null;
        try {
            broadcast = await submit(quote);
            setPhase({step: "sent", quote, hash: broadcast});
            await awaitReceipt(broadcast);
            setPhase({step: "done", quote, hash: broadcast});
            onInFlightChange?.(false);
            onSettled();
        } catch (error) {
            // Released here too, and unconditionally. The flag means "non-terminal: signed for, not
            // yet settled or failed" — after this catch nothing is in the air. Its *outcome* may be
            // unknown, which is a different condition, and holding the flag for it conflated the
            // two and left the page unrecoverable.
            //
            // Signing the same deposit twice is prevented by `back` below, not by this flag: once
            // something is broadcast the control refuses to return to the confirmation step. A
            // sibling row was never the path to that click anyway.
            onInFlightChange?.(false);
            setPhase({
                step: "error",
                message: errorMessage(error),
                // Never back to the confirmation step once a transaction is out:
                // the obvious next click would sign the same deposit twice.
                back: broadcast === null ? "confirm" : "form",
                quote,
                hash: broadcast,
            });
        }
    }

    return (
        // Named, because an unnamed `section` maps to `generic` rather than to a `region`, and a
        // page can hold one of these per row.
        //
        // **Layout-neutral on purpose.** It had `mt-6 border-t … pt-5`, then `pl-5 border-l …`, and
        // both were wrong for one of the two callers — the first put an ambiguous second hairline
        // in a list row, the second nested an identical left rail inside `RatingRow`'s own and
        // left the agent panel's form flush against the market panel. Spacing and the rail belong
        // to whichever container this sits in, and each caller provides its own.
        <section aria-labelledby={`${fieldId}-heading`}>
            <Heading id={`${fieldId}-heading`} className="font-medium">
                {claim.heading}
            </Heading>
            {claim.blurb === undefined || claim.blurb === "" ? null : (
                <p className="mt-1 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)] max-w-[60ch]">
                    {claim.blurb}
                </p>
            )}

            {!isConnected ? (
                <p className="mt-4 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    Connect a wallet to take a position.
                </p>
            ) : sessionError !== null ? (
                <p className="mt-4 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    The MultiVault's deposit minimum could not be read ({sessionError.message}).
                    Staking stays closed until it can be.
                </p>
            ) : session === undefined ? (
                <p className="mt-4 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    Reading the MultiVault's curve and deposit minimum…
                </p>
            ) : !onTargetChain ? (
                <div className="mt-4">
                    <p className="text-[length:var(--text-body-sm)] max-w-[60ch]">
                        Your wallet is on chain{" "}
                        <span className="font-mono">{chainId ?? "unknown"}</span>. This deposit goes
                        to {chain.chain.name} ({chain.chainId}).
                    </p>
                    <button
                        type="button"
                        onClick={handleSwitch}
                        disabled={isSwitching}
                        className={`mt-3 ${controlClass}`}
                    >
                        Switch to {chain.chain.name}
                    </button>
                    {isSwitching ? (
                        <p className="mt-2 text-[length:var(--text-body-sm)]" role="status">
                            Waiting for your wallet to confirm the network switch.
                        </p>
                    ) : null}
                    {switchError !== null ? (
                        <p className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                            {switchError}
                        </p>
                    ) : null}
                </div>
            ) : phase.step === "confirm" || phase.step === "signing" ? (
                <ConfirmStep
                    quote={phase.quote}
                    claim={claim}
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
                        setChosenSide(null);
                    }}
                />
            ) : phase.step === "error" ? (
                <div className="mt-4" role="alert">
                    <p className="text-[length:var(--text-body-sm)] max-w-[60ch] break-words">
                        {phase.hash === null
                            ? `Nothing was staked. ${phase.message}`
                            : `The deposit was broadcast and then this panel lost track of it — it may still land. Do not sign it again without checking. ${phase.message}`}
                    </p>
                    {phase.hash !== null ? (
                        <p className="mt-2 font-mono text-[length:var(--text-body-sm)]">
                            <a
                                href={`${phase.quote?.chain.explorerUrl ?? chain.explorerUrl}/tx/${phase.hash}`}
                                target="_blank"
                                rel="noreferrer"
                                className={linkClass}
                            >
                                {truncateMiddle(phase.hash, 12, 8)} ↗
                            </a>
                        </p>
                    ) : null}
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
                    {hasCounterVault ? (
                        <fieldset className="border-0 p-0 m-0">
                            <legend className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                                Side
                            </legend>
                            <div className="mt-2 flex flex-col gap-2">
                                {SIDES.map((option) => (
                                    <label
                                        key={option}
                                        className="flex items-start gap-3 border border-[color:var(--color-rule)] px-3 py-2 cursor-pointer has-[:checked]:border-[color:var(--color-accent)]"
                                    >
                                        <input
                                            type="radio"
                                            name={`${fieldId}-side`}
                                            value={option}
                                            checked={side === option}
                                            onChange={() => setChosenSide(option)}
                                            className="mt-1 accent-[color:var(--color-accent)]"
                                        />
                                        <span className="text-[length:var(--text-body-sm)]">
                                            <span className="font-medium">
                                                {SIDE_COPY[option].label}
                                            </span>
                                            <span className="block text-[color:var(--color-steel)]">
                                                {SIDE_COPY[option].sentence}
                                            </span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                    ) : null}

                    <div className={hasCounterVault ? "mt-4" : ""}>
                        <label
                            htmlFor={`${fieldId}-amount`}
                            className="block font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]"
                        >
                            Amount ({chain.symbol})
                        </label>
                        <input
                            id={`${fieldId}-amount`}
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            aria-describedby={`${fieldId}-amount-help`}
                            className="mt-2 block w-48 bg-transparent border border-[color:var(--color-rule-strong)] px-3 py-1.5 font-mono focus:outline-none focus:border-[color:var(--color-accent)]"
                        />
                        <p
                            id={`${fieldId}-amount-help`}
                            className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)] max-w-[52ch]"
                        >
                            {check !== null && check.status !== "ok" && check.status !== "empty"
                                ? check.message
                                : null}
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
    claim,
    isSigning,
    onCancel,
    onConfirm,
}: {
    quote: StakeQuote;
    claim: StakeClaim;
    isSigning: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    const positions =
        quote.side === "support"
            ? (claim.market?.support.positionCount ?? null)
            : (claim.market?.opposition?.positionCount ?? null);

    return (
        <div className="mt-4 border border-[color:var(--color-rule-strong)] p-4 max-w-[36rem]">
            <p className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                Confirm before your wallet opens
            </p>
            <p className="mt-3 text-[length:var(--text-body-sm)] max-w-[52ch]">
                You are about to deposit{" "}
                <span className="font-mono">
                    {formatTrust(quote.assets)} {quote.chain.symbol}
                </span>{" "}
                {claim.target.kind === "triple" ? (
                    <>
                        to{" "}
                        <span className="font-medium">
                            {SIDE_COPY[quote.side].label.toLowerCase()}
                        </span>{" "}
                        the claim that{" "}
                        <span className={claim.subjectIsId ? "font-mono" : "font-medium"}>
                            {claim.subject}
                        </span>{" "}
                        {claim.predicate}.
                    </>
                ) : (
                    <>
                        onto{" "}
                        <span className={claim.subjectIsId ? "font-mono" : "font-medium"}>
                            {claim.subject}
                        </span>
                        . Nothing here can contradict it, and the deposit stays yours — it is a
                        position you can redeem, not a payment.
                    </>
                )}
            </p>
            {/* The only other place the network is named can be thousands of pixels up, when this
                control is one of several on a list page. ADR `0017`'s Consequences section calls
                the two-network ambiguity the sharpest failure mode this app has, and the
                confirmation is the step where it would bite. */}
            <p className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)] max-w-[52ch]">
                {/* Two sentences, not one with the token swapped in: "Real tTRUST" would be a
                    false claim, and the whole point of this line is that it is the one place the
                    network is named at the moment money moves. */}
                {quote.chain.isMainnet
                    ? `Real ${quote.chain.symbol}, ${quote.chain.chain.name}, not recoverable by this panel.`
                    : `Test ${quote.chain.symbol} on ${quote.chain.chain.name}. Not recoverable by this panel.`}
            </p>

            <dl className="mt-4 grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-y-2 gap-x-4 text-[length:var(--text-body-sm)]">
                <Term label="Vault" value={truncateMiddle(quote.termId, 12, 8)} />
                <Term
                    label="Positions there"
                    value={
                        positions === null
                            ? "not reported"
                            : positions === 0
                              ? "none — you would be the first"
                              : positions.toLocaleString("en-US")
                    }
                />
                <Term label="Shares minted" value={formatTrust(quote.expectedShares)} />
                <Term
                    label="After fees"
                    value={`${formatTrust(quote.assetsAfterFees)} ${quote.chain.symbol} of ${formatTrust(quote.assets)}`}
                />
                <Term
                    label="Fees"
                    value={`${formatTrust(quote.feeAssets)} ${quote.chain.symbol}`}
                />
                <Term
                    label="Minimum shares"
                    value={`${formatTrust(quote.minShares)} (${Number(MIN_SHARES_TOLERANCE_BPS) / 100}% slippage floor)`}
                />
                <Term label="Receiver" value={truncateMiddle(quote.receiver, 8, 6)} />
            </dl>

            <div className="mt-4 flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={onConfirm}
                    disabled={isSigning}
                    className={primaryControlClass}
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
                {formatTrust(quote.assets)} {quote.chain.symbol} deposited{" "}
                {quote.target.kind === "atom"
                    ? "onto this agent"
                    : `to ${quote.side === "support" ? "support" : "oppose"} this claim`}
                .
                {settled
                    ? null
                    : " Nothing above has been updated yet — it will refresh once the receipt lands."}
            </p>
            <p className="mt-3 font-mono text-[length:var(--text-body-sm)]">
                <a
                    href={`${quote.chain.explorerUrl}/tx/${hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className={linkClass}
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
            <dt className="text-[color:var(--color-steel)]">{label}</dt>
            <dd className="font-mono break-all">{value}</dd>
        </>
    );
}
