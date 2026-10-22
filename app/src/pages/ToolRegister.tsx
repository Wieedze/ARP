import {useId, useState} from "react";
import {Link} from "react-router-dom";
import type {Hex} from "viem";
import {useAccount, useSwitchChain} from "wagmi";

import {MainnetNotice} from "../components/agent/MainnetNotice";
import {controlClass, linkClass} from "../lib/control-class";
import {useToolRegister} from "../hooks/use-tool-register";
import {INTUITION_MAINNET_CHAIN_ID, mainnetTxUrl} from "../lib/intuition-mainnet";
import type {ToolRegistration} from "../services/tool-register";
import {formatTrust, truncateMiddle} from "../services/trust-format";

/**
 * Register a tool (`/register`).
 *
 * **One screen, two outcomes, and the operator does not choose between them** — the URL does. Paste
 * one; the atom id is a pure function of it (ADR `0054`), so the screen can say whether that atom
 * exists before anything is signed and with no credential. If it does, there is nothing to create
 * and the market is already there. If it does not, creating it is one transaction.
 *
 * **Registering is creating an atom, not writing a record.** ARP stores nothing (ADR `0051`): the
 * tool lives wherever its URL says, and what this adds is a vault anyone can deposit into. An atom
 * has no subject, which is why this screen does not ask who you are — the two writes in the protocol
 * are different writes:
 *
 * - a person registers the tool's atom and prices the tool;
 * - an agent writes `(agent, uses, tool)` and prices its own claim to have used it, through the MCP
 *   server or the skill.
 *
 * ADR `0039` put an agent's deposit on the edge because the atom's vault "answers a different
 * question — a market on the tool itself, open to anyone for any reason". This screen is that
 * question.
 */
export function ToolRegister() {
    const actions = useToolRegister();
    const {isConnected, chainId} = useAccount();
    const {switchChainAsync, isPending: isSwitching} = useSwitchChain();

    const [url, setUrl] = useState("");
    const [plan, setPlan] = useState<ToolRegistration | null>(null);
    const [status, setStatus] = useState<"idle" | "reading" | "signing" | "done" | "error">("idle");
    const [error, setError] = useState<string | null>(null);
    const [tx, setTx] = useState<Hex | null>(null);
    const [switchError, setSwitchError] = useState<string | null>(null);

    const fieldId = useId();
    const onMainnet = chainId === INTUITION_MAINNET_CHAIN_ID;

    async function handleLookUp() {
        setStatus("reading");
        setError(null);
        setTx(null);
        try {
            setPlan(await actions.plan(url));
            setStatus("idle");
        } catch (caught) {
            setPlan(null);
            setStatus("error");
            setError(caught instanceof Error ? caught.message : String(caught));
        }
    }

    async function handleSwitch() {
        // Both other call sites wrap this. A dismissed MetaMask prompt rejects, and unwrapped it is
        // an unhandled rejection with the button simply stopping and nothing saying why.
        setSwitchError(null);
        try {
            await switchChainAsync({chainId: INTUITION_MAINNET_CHAIN_ID});
        } catch (caught) {
            setSwitchError(caught instanceof Error ? caught.message : String(caught));
        }
    }

    async function handleCreate() {
        if (plan === null) return;
        setStatus("signing");
        setError(null);
        try {
            setTx(await actions.submit(plan));
            setStatus("done");
        } catch (caught) {
            setStatus("error");
            setError(caught instanceof Error ? caught.message : String(caught));
        }
    }

    return (
        <section>
            <MainnetNotice />

            <header className="mt-8 mb-12">
                <h1 className="text-[length:var(--text-display)] leading-[var(--leading-display)] font-semibold tracking-tight">
                    Register a tool
                </h1>
                <p className="mt-3 max-w-[64ch] text-[color:var(--color-steel)]">
                    Paste the URL where the tool lives. ARP does not host it and does not store it —
                    what this creates is a pointer with a vault anyone can deposit into from any
                    Intuition client, so a tool can be backed with TRUST instead of with stars.
                </p>
                <p className="mt-3 max-w-[64ch] text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    The atom&rsquo;s id is derived from the URL alone, so the same URL always lands
                    on the same market — whoever registers it, and however they would have named it.
                    An agent claiming it <strong className="font-medium">used</strong> the tool
                    writes something different, on a different vault, through the MCP server or the
                    skill.
                </p>
            </header>

            <div className="max-w-[48rem]">
                <label
                    htmlFor={fieldId}
                    className="block text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-steel)]"
                >
                    Tool URL
                </label>
                <div className="mt-2 flex flex-wrap gap-3">
                    <input
                        id={fieldId}
                        type="text"
                        value={url}
                        // The plan goes with the input. Editing the field after a look-up left the
                        // panel showing the old atom id, the old cost and an enabled Register
                        // button that would have registered the old URL — the input on screen
                        // contradicting what gets signed, which is what ADR `0017` safeguard 4
                        // exists to prevent.
                        onChange={(event) => {
                            setUrl(event.target.value);
                            setPlan(null);
                            setTx(null);
                            setError(null);
                            setStatus("idle");
                        }}
                        placeholder="github.com/crytic/slither"
                        spellCheck={false}
                        // The path's case is kept by `normaliseToolUrl` on purpose — most servers
                        // are case-sensitive there — so a capital the keyboard inserted would be a
                        // different atom and a permanent second market.
                        autoCapitalize="off"
                        autoCorrect="off"
                        inputMode="url"
                        aria-describedby={`${fieldId}-hint`}
                        className="min-w-0 flex-1 bg-transparent border border-[color:var(--color-rule-strong)] px-3 py-2 font-mono text-[length:var(--text-body-sm)]"
                    />
                    <button
                        type="button"
                        onClick={() => void handleLookUp()}
                        disabled={url.trim().length === 0 || status === "reading"}
                        className={controlClass}
                    >
                        {status === "reading" ? "Reading the chain…" : "Look it up"}
                    </button>
                </div>
                <p
                    id={`${fieldId}-hint`}
                    className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]"
                >
                    A repo, a skill page, an MCP server, a hosted agent. The scheme, a leading{" "}
                    <span className="font-mono">www.</span>, a trailing slash and a fragment are
                    normalised away.{" "}
                    <strong className="font-medium">The path&rsquo;s case is not</strong> — most
                    servers are case-sensitive there, so <span className="font-mono">/Crytic</span>{" "}
                    and <span className="font-mono">/crytic</span> are two different markets.
                </p>

                {error !== null ? (
                    <p
                        role="alert"
                        className="mt-6 border border-[color:var(--color-rule-strong)] px-4 py-3 text-[length:var(--text-body-sm)]"
                    >
                        {error}
                    </p>
                ) : null}

                {/* A status **line**, not a region around the subtree — and this is the second
                    time: `ToolUsagePanel` documents the same mistake, where a wrapper became the
                    live region for everything under it and announced the amount field's help text
                    per keystroke. Here it would have read the whole pinnable JSON aloud the moment
                    the `<details>` opened. A live region announces every descendant mutation that
                    does not establish its own. */}
                <p aria-live="polite" className="sr-only">
                    {status === "reading"
                        ? "Reading the chain"
                        : status === "signing"
                          ? "Waiting for your wallet"
                          : tx !== null
                            ? "Registered"
                            : plan === null
                              ? ""
                              : plan.exists
                                ? "This tool already has its atom"
                                : "Ready to register"}
                </p>
                <div>
                    {plan !== null ? (
                        <Resolved
                            plan={plan}
                            tx={tx}
                            isConnected={isConnected}
                            onMainnet={onMainnet}
                            walletChainId={chainId}
                            isSwitching={isSwitching}
                            isSigning={status === "signing"}
                            switchError={switchError}
                            onSwitchChain={() => void handleSwitch()}
                            onCreate={() => void handleCreate()}
                        />
                    ) : null}
                </div>
            </div>
        </section>
    );
}

function Resolved(props: {
    plan: ToolRegistration;
    tx: Hex | null;
    isConnected: boolean;
    onMainnet: boolean;
    walletChainId: number | undefined;
    isSwitching: boolean;
    isSigning: boolean;
    switchError: string | null;
    onSwitchChain: () => void;
    onCreate: () => void;
}) {
    const {plan, tx} = props;
    // Its own id: `fieldId` belongs to the form above, and a hardcoded one would collide if this
    // page were ever mounted twice.
    const headingId = useId();
    return (
        <div className="mt-10 pl-5 border-l border-[color:var(--color-rule-strong)]">
            <Field label="Normalised URL" value={plan.normalisedUrl} />
            <Field label="Atom data" value={plan.atomUri} />
            <Field label="Atom id" value={plan.atomId} />

            {plan.existingCandidates.length > 0 ? (
                <div className="mt-6 max-w-[64ch]">
                    <h2 id={headingId} className="font-medium">
                        {plan.existingCandidates.length === 1
                            ? "Another atom already carries this URL."
                            : `${plan.existingCandidates.length} other atoms already carry this URL.`}
                    </h2>
                    {/* Reported, never chosen between. Picking one would put a permanent deposit on
                        an arbitrary id, and `https://github.com` has five of them on mainnet. */}
                    <p className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                        Each was named by whoever registered it, which is why one URL can carry
                        several. They are listed, not chosen between — a deposit on the wrong one is
                        permanent, and Intuition has no deletion.
                    </p>
                    <ul aria-labelledby={headingId} className="mt-3">
                        {plan.existingCandidates.map((candidate) => (
                            <li
                                key={candidate.termId}
                                className="border-t border-[color:var(--color-rule)] py-2 text-[length:var(--text-body-sm)]"
                            >
                                <Link to={`/tool/atom/${candidate.termId}`} className={linkClass}>
                                    {candidate.label ?? (
                                        <>
                                            <span className="sr-only">atom </span>
                                            {truncateMiddle(candidate.termId)}
                                        </>
                                    )}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {plan.exists ? (
                <div className="mt-8 max-w-[64ch]">
                    <p className="font-medium">This tool already has its atom.</p>
                    {/* It names the destination rather than promising a market: that page carries
                        the per-edge markets, and with 0 of mainnet's 185 `uses` edges passing the
                        agent filter it will often be empty. "Its market is open" sent a reader to
                        "No declared uses". */}
                    <p className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                        Nothing to create. Its page lists the agents that declared using it, with
                        both sides of each claim — and is empty until one does.
                    </p>
                    <Link
                        to={`/tool/atom/${plan.atomId}`}
                        className={`mt-4 inline-block ${linkClass}`}
                    >
                        See its declarations →
                    </Link>
                </div>
            ) : tx !== null ? (
                <div className="mt-8 max-w-[64ch]">
                    <p className="font-medium">Registered.</p>
                    {/* Said because the atom works unpinned and a reader will wonder why the name is
                        a hash. Pinning the same bytes later yields the same id, so it is
                        retroactive rather than a missed window. */}
                    <p className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                        Readers see the atom&rsquo;s id until its document is pinned. Anyone can pin
                        it, at any time, and the id does not change — the same bytes always hash to
                        the same CID.
                    </p>
                    {/* The bytes, not just the claim that anyone can pin them. Telling a reader
                        they can do something and withholding what they would need is the gap
                        between a true sentence and a usable one. */}
                    <details className="mt-3">
                        <summary className="cursor-pointer text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                            The document to pin
                        </summary>
                        <pre className="mt-2 overflow-x-auto border border-[color:var(--color-rule)] p-3 font-mono text-[length:var(--text-label)]">
                            {plan.document}
                        </pre>
                    </details>
                    <Field
                        label="Transaction"
                        value={truncateMiddle(tx, 14, 10)}
                        href={mainnetTxUrl(tx)}
                    />
                    {/* Not "open its market": this is the branch a *first* registrant reaches, so
                        there are no `uses` edges on the atom by construction and that page renders
                        "No declared uses". The `exists` branch above was corrected and this one was
                        not — `rules/claims.md` failure 5, on the path that mattered more. */}
                    <Link
                        to={`/tool/atom/${plan.atomId}`}
                        className={`mt-2 inline-block ${linkClass}`}
                    >
                        See its declarations →
                    </Link>
                </div>
            ) : (
                <div className="mt-8 max-w-[64ch]">
                    {/* The numbers, not a sentence about them. ADR `0017` safeguard 6: several fee
                        layers apply and implying 1:1 would be a lie. A paragraph here said "the fee
                        is spent, the deposit is yours" — two buckets, where the chain takes three
                        bites: the flat fee, the entry fee, then shares rounded down. */}
                    <dl className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-y-2 gap-x-4 font-mono text-[length:var(--text-body-sm)] tabular-nums">
                        <Term label="You send" value={`${formatTrust(plan.assets)} TRUST`} />
                        <Term
                            label="Creation fee"
                            value={`${formatTrust(plan.creationFee)} TRUST — spent`}
                        />
                        <Term
                            label="Fees in total"
                            value={`${formatTrust(plan.feeAssets)} TRUST`}
                        />
                        <Term
                            label="Reaches the vault"
                            value={`${formatTrust(plan.assetsAfterFees)} TRUST`}
                        />
                        <Term label="Shares minted" value={formatTrust(plan.shares)} />
                    </dl>
                    <p className="mt-4 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                        The shares are a position you hold and can redeem. The fees are not. An atom
                        created with the fee alone would exist on the chain and not exist as a
                        market, which is why the minimum deposit is included rather than optional.
                    </p>

                    {!props.isConnected ? (
                        <p className="mt-6 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                            Connect a wallet to register it.
                        </p>
                    ) : !props.onMainnet ? (
                        <div className="mt-6">
                            <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                                Your wallet is on chain {props.walletChainId ?? "unknown"}. A
                                tool&rsquo;s market is on Intuition mainnet (
                                {INTUITION_MAINNET_CHAIN_ID}).
                            </p>
                            <button
                                type="button"
                                onClick={props.onSwitchChain}
                                disabled={props.isSwitching}
                                className={`mt-3 ${controlClass}`}
                            >
                                {props.isSwitching ? "Switching…" : "Switch to Intuition mainnet"}
                            </button>
                            {props.switchError === null ? null : (
                                <p
                                    role="alert"
                                    className="mt-3 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]"
                                >
                                    {props.switchError}
                                </p>
                            )}
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={props.onCreate}
                            disabled={props.isSigning}
                            className={`mt-6 ${controlClass}`}
                        >
                            {props.isSigning
                                ? "Waiting for your wallet…"
                                : `Register — ${formatTrust(plan.assets)} TRUST`}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function Term({label, value}: {label: string; value: string}) {
    return (
        <>
            <dt className="font-sans text-[color:var(--color-steel)]">{label}</dt>
            <dd>{value}</dd>
        </>
    );
}

function Field({label, value, href}: {label: string; value: string; href?: string}) {
    return (
        <div className="mt-4">
            <p className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-steel)]">
                {label}
            </p>
            {href === undefined ? (
                <p className="mt-1 font-mono text-[length:var(--text-body-sm)] break-all">
                    {value}
                </p>
            ) : (
                <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className={`mt-1 block font-mono text-[length:var(--text-body-sm)] break-all ${linkClass}`}
                >
                    {value}
                </a>
            )}
        </div>
    );
}
