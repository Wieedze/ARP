import {useId, useState} from "react";
import {Link, useSearchParams} from "react-router-dom";
import {useAccount, useSwitchChain} from "wagmi";
import type {Address} from "viem";

import {AgentImport} from "./AgentImport";
import {controlClass, linkClass, primaryControlClass} from "../lib/control-class";
import {useIdentityMint} from "../hooks/use-identity-mint";
import {truncateMiddle} from "../services/trust-format";
import {
    MINT_CHAIN,
    MINT_REGISTRY,
    type MintQuote,
    type MintResult,
} from "../services/identity-mint";

/**
 * `/agent` — one door for "get my agent into ARP", with one question at the top.
 *
 * ## It was two pages that only linked to each other
 *
 * `/agent` minted into ARP's own testnet registry over five steps; `/agent/import` adopted an agent
 * that already existed. Neither was in the nav and neither was linked from anywhere else, so the
 * only way to reach either was to already know the URL — the user had never seen them (2026-10-27)
 * and asked whether they were not in fact the same page.
 *
 * They are not the same page, they are the two branches of one question, and the axis is **not the
 * chain**:
 *
 * > Does your agent already have an ERC-8004 id?
 *
 * **Yes** → prove you own it and link your staking account. **No** → mint one. The branch lives in
 * the URL (`?have=yes`), so the choice is shareable and Back works, and both branches render on
 * this page rather than navigating — the reader never has to learn that two flows exist.
 *
 * ## The "no" branch mints on Base, not on our testnet
 *
 * This is the substantive change. The old flow wrote into **ARP's own copy** of the reference
 * registry on 13579, which `rules/portability.md` rule 4 calls what it is: a rehearsal prop. An
 * identity there is invisible to every other ERC-8004 reader and to Intuition's mirror.
 *
 * The canonical registry is open to anyone — measured, not assumed:
 * `scripts/measure/canonical-registry.ts` found `register()` simulating from a zero-balance address
 * on both Base and BSC. Base is the one offered, because Intuition's mirror covers Base and an
 * identity anywhere else is real and still unreadable by everything this app does next.
 *
 * The five-step testnet rig did not disappear — it moved to `/rig`, named for what it is.
 */

const BRANCH_PARAM = "have";

export function YourAgent() {
    const [searchParams, setSearchParams] = useSearchParams();
    const branch = searchParams.get(BRANCH_PARAM);

    function choose(next: "yes" | "no" | null) {
        setSearchParams(
            (current) => {
                const params = new URLSearchParams(current);
                if (next === null) params.delete(BRANCH_PARAM);
                else params.set(BRANCH_PARAM, next);
                return params;
            },
            // `push`, not `replace`: picking a branch is going somewhere, and Back should return to
            // the question. The tabs on the agent panel use `replace` for the opposite reason —
            // a tab is a way of looking at one page, not a place.
            {replace: false},
        );
    }

    return (
        <section>
            <header className="mt-8 mb-10">
                <h1 className="font-display text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold">
                    Your agent
                </h1>
            </header>

            <fieldset className="border-0 p-0 m-0">
                <legend className="text-[length:var(--text-body)] font-medium">
                    Does your agent already have an ERC-8004 id?
                </legend>
                <div className="mt-4 flex flex-wrap gap-3">
                    <Choice selected={branch === "yes"} onClick={() => choose("yes")}>
                        Yes, it has one
                    </Choice>
                    <Choice selected={branch === "no"} onClick={() => choose("no")}>
                        No, mint one
                    </Choice>
                </div>
            </fieldset>

            {branch === "yes" ? (
                <div className="mt-12 border-t border-[color:var(--color-rule)] pt-2">
                    <AgentImport />
                </div>
            ) : branch === "no" ? (
                <div className="mt-12 border-t border-[color:var(--color-rule)] pt-10">
                    <MintIdentity />
                </div>
            ) : (
                <Unsure />
            )}
        </section>
    );
}

function Choice({
    selected,
    onClick,
    children,
}: {
    selected: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={onClick}
            // Banged: `index.css`'s unlayered `button { border; color }` beats any `@layer
            // utilities` rule, so an unbanged selected state renders identically to an unselected
            // one. The full list of base-layer rules this collides with is in `lib/control-class`.
            className={`px-4 py-2 text-[length:var(--text-body-sm)] ${
                selected
                    ? "border-[color:var(--color-accent)]! text-[color:var(--color-accent)]!"
                    : "border-[color:var(--color-rule-strong)]! text-[color:var(--color-fg)]!"
            }`}
        >
            {children}
        </button>
    );
}

/**
 * For a reader who does not know which branch they are in — which is most of them the first time.
 *
 * Not a pitch and not a tutorial: it says how to find out, which is a free read on a page that
 * already exists.
 */
function Unsure() {
    return (
        <div className="mt-10 max-w-[64ch]">
            <p className="text-[color:var(--color-steel)]">
                An ERC-8004 id is a chain id and a token number —{" "}
                <span className="font-mono">8453:2340</span>. If you have one, you minted it or
                somebody minted it for you.
            </p>
            <Link to="/agents" className={`mt-4 inline-block ${linkClass}`}>
                Look an id up →
            </Link>
        </div>
    );
}

type Phase =
    | {step: "idle"}
    | {step: "quoting"}
    | {step: "confirm"; quote: MintQuote}
    | {step: "signing"; quote: MintQuote}
    | {step: "done"; result: MintResult}
    /**
     * `hash` separates "nothing was sent" from "it went out and we lost sight of it". Only the
     * first may offer to sign again — the second may have minted an identity already, and a second
     * mint is a second permanent NFT.
     */
    | {step: "error"; message: string; hash: string | null};

/**
 * The mint. One transaction on Base, the operator's own ETH, one click.
 *
 * Three explicit steps — price, confirm, sign — and nothing advances on its own. Same discipline as
 * the staking control (ADR `0017` safeguard 5): no effect, no retry that resubmits, and
 * `handleSign` reachable from exactly one click.
 */
function MintIdentity() {
    const {address, isConnected, chainId} = useAccount();
    const {switchChainAsync, isPending: isSwitching} = useSwitchChain();
    const {quote, submit} = useIdentityMint();
    const [phase, setPhase] = useState<Phase>({step: "idle"});
    const headingId = useId();

    const onMintChain = chainId === MINT_CHAIN.id;

    async function handleQuote(owner: Address) {
        setPhase({step: "quoting"});
        try {
            setPhase({step: "confirm", quote: await quote(owner)});
        } catch (error) {
            setPhase({step: "error", message: messageOf(error), hash: null});
        }
    }

    async function handleSign(current: MintQuote) {
        setPhase({step: "signing", quote: current});
        try {
            setPhase({step: "done", result: await submit()});
        } catch (error) {
            setPhase({step: "error", message: messageOf(error), hash: null});
        }
    }

    return (
        <section aria-labelledby={headingId}>
            <h2 id={headingId} className="font-medium">
                Mint an ERC-8004 identity
            </h2>
            <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[length:var(--text-body-sm)]">
                <Field label="Chain">
                    {MINT_CHAIN.name} ({MINT_CHAIN.id})
                </Field>
                <Field label="Registry">{truncateMiddle(MINT_REGISTRY, 12, 8)}</Field>
                <Field label="Owner">
                    {address === undefined ? "—" : truncateMiddle(address, 12, 8)}
                </Field>
            </dl>

            {!isConnected || address === undefined ? (
                <p className="mt-6 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    Connect a wallet to mint.
                </p>
            ) : !onMintChain ? (
                <div className="mt-6">
                    <p className="max-w-[60ch] text-[length:var(--text-body-sm)]">
                        Your wallet is on chain{" "}
                        <span className="font-mono">{chainId ?? "unknown"}</span>. The registry is
                        on {MINT_CHAIN.name} ({MINT_CHAIN.id}).
                    </p>
                    <button
                        type="button"
                        onClick={() => void switchChainAsync({chainId: MINT_CHAIN.id})}
                        disabled={isSwitching}
                        className={`mt-3 ${controlClass}`}
                    >
                        {isSwitching ? "Switching…" : `Switch to ${MINT_CHAIN.name}`}
                    </button>
                </div>
            ) : phase.step === "done" ? (
                <Minted result={phase.result} />
            ) : phase.step === "confirm" || phase.step === "signing" ? (
                <Confirm
                    quote={phase.quote}
                    isSigning={phase.step === "signing"}
                    onSign={() => void handleSign(phase.quote)}
                    onCancel={() => setPhase({step: "idle"})}
                />
            ) : (
                <div className="mt-6">
                    <button
                        type="button"
                        onClick={() => void handleQuote(address)}
                        disabled={phase.step === "quoting"}
                        className={controlClass}
                    >
                        {phase.step === "quoting" ? "Reading the registry…" : "Check what it costs"}
                    </button>
                    {phase.step === "error" ? (
                        <p
                            role="alert"
                            className="mt-4 max-w-[60ch] text-[length:var(--text-body-sm)] break-words"
                        >
                            {phase.message}
                        </p>
                    ) : null}
                </div>
            )}
        </section>
    );
}

/**
 * The confirmation, and the one screen where the cost is stated before a wallet opens.
 *
 * The id is marked as a **prediction**, not printed as the outcome. `register()` returns the next
 * id, and anybody else may mint between this read and the broadcast — the real id comes off the
 * receipt. Printing a prediction as a fact is the `claims.md` failure this page is most exposed to.
 */
function Confirm({
    quote,
    isSigning,
    onSign,
    onCancel,
}: {
    quote: MintQuote;
    isSigning: boolean;
    onSign: () => void;
    onCancel: () => void;
}) {
    const cost =
        quote.maxFeePerGas === null
            ? null
            : `${formatEth(quote.gas * quote.maxFeePerGas)} ETH at current fees`;

    return (
        <div className="mt-6 max-w-[36rem] border border-[color:var(--color-rule-strong)] p-4">
            <p className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                Confirm before your wallet opens
            </p>
            <p className="mt-3 max-w-[52ch] text-[length:var(--text-body-sm)]">
                You are about to mint one ERC-8004 identity on {MINT_CHAIN.name}, owned by{" "}
                <span className="font-mono">{truncateMiddle(quote.owner, 10, 8)}</span>. It is
                permanent and it cannot be un-minted.
            </p>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[length:var(--text-body-sm)]">
                <Field label="Gas">{quote.gas.toLocaleString("en-US")}</Field>
                <Field label="Cost">
                    {cost ?? "fees unavailable — your wallet will show them"}
                </Field>
                <Field label="Likely id">
                    {quote.predictedTokenId}{" "}
                    <span className="text-[color:var(--color-steel)]">
                        · may shift if somebody mints first
                    </span>
                </Field>
            </dl>
            <div className="mt-5 flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={onSign}
                    disabled={isSigning}
                    className={primaryControlClass}
                >
                    {isSigning ? "Waiting for your wallet…" : "Mint"}
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
        </div>
    );
}

/** The identity exists. The next step is the other branch of this page, so it links there. */
function Minted({result}: {result: MintResult}) {
    return (
        <div
            className="mt-6 max-w-[36rem] border border-[color:var(--color-accent)] p-4"
            role="status"
        >
            <p className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-accent)]">
                Minted
            </p>
            <p className="mt-3 text-[length:var(--text-body-sm)]">
                Your agent is{" "}
                <span className="font-mono">
                    {result.chainId}:{result.tokenId}
                </span>
                . Save that — it is how everything else addresses it.
            </p>
            <p className="mt-3 font-mono text-[length:var(--text-body-sm)]">
                <a
                    href={`${MINT_CHAIN.blockExplorers.default.url}/tx/${result.hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className={linkClass}
                >
                    {truncateMiddle(result.hash, 12, 8)} ↗
                </a>
            </p>
            <Link
                to={`/agent?have=yes`}
                className={`mt-4 inline-block text-[length:var(--text-body-sm)] ${linkClass}`}
            >
                Now link your staking account →
            </Link>
        </div>
    );
}

function Field({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <>
            <dt className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                {label}
            </dt>
            <dd className="font-mono tabular-nums break-all">{children}</dd>
        </>
    );
}

/** Wei to ETH, trimmed. Not `formatTrust`: that one is named for a different token. */
function formatEth(wei: bigint): string {
    const whole = wei / 10n ** 18n;
    const fraction = (wei % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
    if (fraction === "") return whole.toString();
    // Six places is enough to read a Base fee and short enough not to look like precision.
    return `${whole}.${fraction.slice(0, 6)}`;
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
