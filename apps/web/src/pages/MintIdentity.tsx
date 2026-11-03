import {useId, useState} from "react";
import {Link} from "react-router-dom";
import {useAccount, useSwitchChain} from "wagmi";
import type {Address} from "viem";

import {controlClass, linkClass, primaryControlClass} from "../lib/control-class";
import {draftToAgentUri, useIdentityMint} from "../hooks/use-identity-mint";
import {truncateMiddle} from "../services/trust-format";
import {mintTargetOf, type MintQuote, type MintResult} from "../services/identity-mint";
import {ConnectPrompt} from "../components/onboarding/ConnectPrompt";

/**
 * Minting an ERC-8004 identity with the operator's own wallet: the wallet way in on
 * `/start/agent` (task 62, ADR `0125`), beside the sponsored `arp init --sponsored`.
 *
 * ## The mint goes where the chain toggle says
 *
 * On mainnet it mints on Base, the canonical registry Intuition's mirror reads. The registry is open
 * to anyone — measured, not assumed: `scripts/measure/canonical-registry.ts` found `register()`
 * simulating from a zero-balance address on both Base and BSC. On testnet it mints into ARP's own
 * copy on 13579, the registry the sponsored path mints into as well (`services/identity-mint.ts`).
 */

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
 *
 * ## The name is required, and that is the point of the form
 *
 * `register()` with no argument mints an identity whose `tokenURI` is empty. Probed on Base
 * 2026-10-27, agents `6649` and `500000` are in exactly that state — and they are the rows this
 * app already shows as `Agent 8453:6649`, the indexer's stand-in. An unnamed identity is a legal
 * NFT that nothing can say anything about, so the form asks for the one field whose absence causes
 * that, and the rest are optional.
 *
 * The document goes **on chain** as a `data:application/json;base64,…` URI, which is what agents
 * `1` and `2340` carry. A hosted URL is cheaper and can stop resolving; ARP's argument is that a
 * claim should be checkable without trusting a server, so the default follows the argument. The
 * byte count is shown before signing, because it is the gas.
 */
export function MintIdentity() {
    const {address, isConnected, chainId} = useAccount();
    const {switchChainAsync, isPending: isSwitching} = useSwitchChain();
    const {target, quote, submit} = useIdentityMint();
    const [phase, setPhase] = useState<Phase>({step: "idle"});
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [endpoint, setEndpoint] = useState("");
    const headingId = useId();
    const fieldId = useId();

    // A quote or a result keeps the chain it was made on. Only a page with neither follows the
    // toggle, so a flip cannot hide a minted id or relabel a pending signature.
    const shown =
        phase.step === "confirm" || phase.step === "signing"
            ? mintTargetOf(phase.quote.chainId)
            : phase.step === "done"
              ? mintTargetOf(phase.result.chainId)
              : target;
    const onMintChain = chainId === shown.chain.id;
    const hasName = name.trim() !== "";

    async function handleQuote(owner: Address) {
        setPhase({step: "quoting"});
        try {
            const agentUri = draftToAgentUri(
                {
                    name,
                    description: description.trim() === "" ? undefined : description,
                    webEndpoint: endpoint.trim() === "" ? undefined : endpoint,
                },
                target,
            );
            setPhase({step: "confirm", quote: await quote(owner, agentUri)});
        } catch (error) {
            setPhase({step: "error", message: messageOf(error), hash: null});
        }
    }

    async function handleSign(current: MintQuote) {
        setPhase({step: "signing", quote: current});
        try {
            // The quote's own bytes, not a re-derivation: editing the form between the quote and
            // the signature must not change what is signed for.
            setPhase({step: "done", result: await submit(current)});
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
                    {shown.chain.name} ({shown.chain.id})
                </Field>
                <Field label="Registry">{truncateMiddle(shown.registry, 12, 8)}</Field>
                <Field label="Owner">
                    {address === undefined ? "—" : truncateMiddle(address, 12, 8)}
                </Field>
            </dl>

            {!isConnected || address === undefined ? (
                <ConnectPrompt label="Connect a wallet to mint" className="mt-6" />
            ) : !onMintChain ? (
                <div className="mt-6">
                    <p className="max-w-[60ch] text-[length:var(--text-body-sm)]">
                        Your wallet is on chain{" "}
                        <span className="font-mono">{chainId ?? "unknown"}</span>. The registry is
                        on {shown.chain.name} ({shown.chain.id}).
                    </p>
                    <button
                        type="button"
                        onClick={() => void switchChainAsync({chainId: shown.chain.id})}
                        disabled={isSwitching}
                        className={`mt-3 ${controlClass}`}
                    >
                        {isSwitching ? "Switching…" : `Switch to ${shown.chain.name}`}
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
                    <div className="max-w-[32rem]">
                        <Input
                            id={`${fieldId}-name`}
                            label="Name"
                            value={name}
                            onChange={setName}
                            placeholder="What the agent is called"
                        />
                        <Input
                            id={`${fieldId}-endpoint`}
                            label="Endpoint"
                            value={endpoint}
                            onChange={setEndpoint}
                            placeholder="https://… (optional)"
                        />
                        <div className="mt-4">
                            <label
                                htmlFor={`${fieldId}-description`}
                                className="block font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]"
                            >
                                Description
                            </label>
                            <textarea
                                id={`${fieldId}-description`}
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                                rows={3}
                                placeholder="What it does (optional)"
                                className="mt-2 w-full border border-[color:var(--color-rule-strong)] bg-transparent px-3 py-2 text-[length:var(--text-body-sm)] focus:border-[color:var(--color-accent)]"
                            />
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => void handleQuote(address)}
                        disabled={phase.step === "quoting" || !hasName}
                        className={`mt-5 ${controlClass}`}
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
    const chain = mintTargetOf(quote.chainId).chain;
    const cost =
        quote.maxFeePerGas === null
            ? null
            : `${formatEth(quote.gas * quote.maxFeePerGas)} ${chain.nativeCurrency.symbol} at current fees`;

    return (
        <div className="mt-6 max-w-[36rem] border border-[color:var(--color-rule-strong)] p-4">
            <p className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                Confirm before your wallet opens
            </p>
            <p className="mt-3 max-w-[52ch] text-[length:var(--text-body-sm)]">
                You are about to mint one ERC-8004 identity on {chain.name}, owned by{" "}
                <span className="font-mono">{truncateMiddle(quote.owner, 10, 8)}</span>. It is
                permanent and it cannot be un-minted.
            </p>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[length:var(--text-body-sm)]">
                <Field label="Stored">{quote.uriBytes.toLocaleString("en-US")} bytes, public</Field>
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

/** The identity exists. The next step is the import branch of `/start/agent`, so it links there. */
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
                    href={`${mintTargetOf(result.chainId).explorerUrl}/tx/${result.hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className={linkClass}
                >
                    {truncateMiddle(result.hash, 12, 8)} ↗
                </a>
            </p>
            <Link
                to="/start/agent?have=yes"
                className={`mt-4 inline-block text-[length:var(--text-body-sm)] ${linkClass}`}
            >
                Now link your agent wallet →
            </Link>
        </div>
    );
}

function Input({
    id,
    label,
    value,
    onChange,
    placeholder,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (next: string) => void;
    placeholder: string;
}) {
    return (
        <div className="mt-4 first:mt-0">
            <label
                htmlFor={id}
                className="block font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]"
            >
                {label}
            </label>
            <input
                id={id}
                type="text"
                autoComplete="off"
                value={value}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
                className="mt-2 w-full border border-[color:var(--color-rule-strong)] bg-transparent px-3 py-2 focus:border-[color:var(--color-accent)]"
            />
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
