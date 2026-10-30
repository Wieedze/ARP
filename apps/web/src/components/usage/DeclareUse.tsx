import {Fragment, useId, useState} from "react";
import {Link} from "react-router-dom";
import type {Hex} from "viem";
import {useAccount, useSwitchChain} from "wagmi";

import {Hint} from "../brand/Hint";
import {useDeclareUse} from "../../hooks/use-declare-use";
import {useChainChoice, type ChainChoice} from "../../lib/chain-choice";
import {controlClass, linkClass, primaryControlClass} from "../../lib/control-class";
import {actionHeadingClass, cardClass, primaryActionCardClass} from "../../lib/surface-class";
import {
    DeclareUseGuardError,
    parseAgentRef,
    type AgentTokenRef,
    type DeclaredUse,
} from "../../services/declare-use";
import {formatTrust, truncateMiddle} from "../../services/trust-format";

/**
 * The declare control on `/atom/:atomId` — `(your agent, uses, this atom)`.
 *
 * Beside `DeclaredUses`, which is the read side of the same edge. The write side had no page at all
 * until now: `docs/12` point 3 lived in `scripts/agent-declare-used.ts` and in the MCP server, so
 * the centre of the mechanism was reachable by an agent and not by the human holding its key.
 *
 * ## Why it lives on the atom's page and not on a page of its own
 *
 * The object of the claim is the thing the reader is already looking at, so the only question left
 * is the subject. A screen of its own would have to ask for both, and asking for the object as a URL
 * is how a second atom gets minted beside the one on screen — the fragmentation ADR `0054` exists to
 * prevent. Here the object is an id the chain already holds, by construction.
 *
 * ## One write, not two
 *
 * There is no second control to add TRUST to the edge afterwards, and that is a decision rather than
 * an omission: ADR `0056` §1, on the user's measured objection that nobody takes the other side of
 * `X used Y`. The position comes with the write (ADR `0053`) and is the whole of the stake.
 *
 * ## What is said on screen and what is not
 *
 * The figures, and one `Hint` for the single caveat a figure cannot carry — that the fee does not
 * come back. `rules/ui.md` forbids an explanatory sentence inside a panel; the reason this surface
 * gets the `Hint` rather than silence is that the fee is non-recoverable, so a reader who misses it
 * loses money. Nothing else on this page has that property.
 */
export function DeclareUse({
    object,
    objectLabel,
    onDeclared,
}: {
    object: Hex;
    objectLabel: string;
    /**
     * Called once the write has a receipt, so the page can refetch.
     *
     * Without it the operator pays a non-recoverable fee and the edge they just created is absent
     * from the list beside it — and on the first-declaration branch the page still read "Nothing
     * points at it" under the word "Declared." `AtomMarket` passes `onSettled` into its write
     * control for the same reason; this is that pattern, named for the event rather than the hook.
     */
    onDeclared?: () => void;
}) {
    const actions = useDeclareUse();
    const {address, isConnected, chainId} = useAccount();
    const {switchChainAsync, isPending: isSwitching} = useSwitchChain();
    const chain = useChainChoice();

    const [input, setInput] = useState("");
    const [plan, setPlan] = useState<DeclaredUse | null>(null);
    const [status, setStatus] = useState<"idle" | "reading" | "signing" | "done" | "error">("idle");
    const [error, setError] = useState<unknown>(null);
    const [tx, setTx] = useState<Hex | null>(null);
    const [switchError, setSwitchError] = useState<string | null>(null);

    const fieldId = useId();
    const onTargetChain = chainId === chain.chainId;

    async function handleLookUp() {
        if (address === undefined) return;
        setStatus("reading");
        setError(null);
        setTx(null);
        let agent: AgentTokenRef;
        try {
            agent = parseAgentRef(input);
        } catch (caught) {
            setPlan(null);
            setStatus("error");
            setError(caught);
            return;
        }
        try {
            setPlan(await actions.plan({agent, connected: address, object}));
            setStatus("idle");
        } catch (caught) {
            setPlan(null);
            setStatus("error");
            setError(caught);
        }
    }

    async function handleSwitch() {
        // Wrapped because a dismissed wallet prompt rejects, and unwrapped it is an unhandled
        // rejection with the button simply stopping and nothing saying why.
        setSwitchError(null);
        try {
            await switchChainAsync({chainId: chain.chainId});
        } catch (caught) {
            setSwitchError(caught instanceof Error ? caught.message : String(caught));
        }
    }

    async function handleDeclare() {
        if (plan === null) return;
        setStatus("signing");
        setError(null);
        try {
            setTx(await actions.submit(plan));
            setStatus("done");
            onDeclared?.();
        } catch (caught) {
            setStatus("error");
            setError(caught);
        }
    }

    if (chain.isMainnet) {
        // **A status line, not a headline, and that is the second version of this branch.** The
        // first gave the refusal an `h2` at `type-face text-[20px]` at the top of the column — so
        // on the default chain the loudest thing on every atom page was a feature announcing that
        // it does not work, 218px above the evidence the page exists to show. Measured, and
        // screenshotted, by the reviewer.
        //
        // Said before the form rather than after a click, because a reader who fills a field and
        // connects a wallet to learn it was pointless has been wasted. But one quiet sentence is
        // the whole of what that is worth.
        return (
            <p className="mb-10 border-b border-[color:var(--color-rule)] pb-6 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                Declaring a use is not open on {chain.label} yet. Switch the chain to the testnet to
                write it there.
            </p>
        );
    }

    return (
        // **Open, with its heading, and no disclosure.** It was a `<details>` collapsed by
        // default, which solved a real measurement — expanded at the head of the column it pushed
        // the first evidence row from y~230 to y~501 — and solved it the wrong way: the user wants
        // the two things he can do on an atom legible the moment the page loads, not behind a
        // click. The vertical cost is paid by the **layout** instead, in `AtomPanel`: the two
        // writes sit side by side, so together they are one block tall rather than two.
        <section>
            {/* **Display type, not body weight.** The reference sets an action card's heading at
                22px/800/125%, and this page's two actions had been at the same weight as every
                section label on it — the user's verdict on that grammar: « tout est pareil ». */}
            <h2 className={actionHeadingClass}>Declare that your agent used this</h2>

            {/* **The primary action**, bordered in the accent. `rules/ui.md` spends Saffron on
                "the primary action" and the design reference does the same to its `.act.primary`:
                a border colour and nothing else. The market beside it is an ordinary action card.

                It is the *accent*, not the *order*: the user put the market first on this page
                (2026-10-28), and that is about what a reader reaches for. Which of the two is ARP's
                own mechanism is a different question, and this is the answer to it. */}
            <div className={`mt-6 ${primaryActionCardClass}`}>
                <label
                    htmlFor={fieldId}
                    className="block text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-steel)]"
                >
                    Your agent
                </label>
                <div className="mt-2 flex flex-wrap gap-3">
                    <input
                        id={fieldId}
                        type="text"
                        value={input}
                        // The plan goes with the input, for the reason `ToolRegister` records: a
                        // stale panel beside an edited field is the screen contradicting what gets
                        // signed (ADR `0017` safeguard 4).
                        onChange={(event) => {
                            setInput(event.target.value);
                            setPlan(null);
                            setTx(null);
                            setError(null);
                            setStatus("idle");
                        }}
                        placeholder="8453/1380"
                        spellCheck={false}
                        autoCapitalize="off"
                        autoCorrect="off"
                        aria-describedby={`${fieldId}-hint`}
                        className="min-w-0 flex-1 bg-transparent border border-[color:var(--color-rule-strong)] px-3 py-2 font-mono text-[length:var(--text-body-sm)]"
                    />
                    <button
                        type="button"
                        onClick={() => void handleLookUp()}
                        disabled={input.trim().length === 0 || status === "reading" || !isConnected}
                        // A disabled button is out of the tab order, so without this the only
                        // announcement of why is whatever a reader happens to pass over.
                        aria-describedby={isConnected ? undefined : `${fieldId}-connect`}
                        className={controlClass}
                    >
                        {status === "reading" ? "Reading the chain…" : "Check it"}
                    </button>
                </div>
                <p
                    id={`${fieldId}-hint`}
                    className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]"
                >
                    Its ERC-8004 chain and token, as <span className="font-mono">chain/token</span>.
                    The connected wallet must be the owner the registry names.
                </p>

                {!isConnected ? (
                    <p
                        id={`${fieldId}-connect`}
                        className="mt-6 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]"
                    >
                        Connect the wallet that owns the agent.
                    </p>
                ) : null}

                {error === null ? null : <Refusal error={error} />}

                {/* A status line, not a region around the subtree. Twice-learned here: a wrapper
                    becomes the live region for every descendant and announces a field's help text
                    per keystroke. */}
                <p aria-live="polite" className="sr-only">
                    {status === "reading"
                        ? "Reading the chain"
                        : status === "signing"
                          ? "Waiting for your wallet"
                          : tx !== null
                            ? "Declared"
                            : plan === null
                              ? ""
                              : plan.exists
                                ? "This agent has already declared using this atom"
                                : "Ready to declare"}
                </p>

                {plan === null ? null : (
                    <Resolved
                        plan={plan}
                        objectLabel={objectLabel}
                        tx={tx}
                        chain={chain}
                        onTargetChain={onTargetChain}
                        walletChainId={chainId}
                        isSwitching={isSwitching}
                        isSigning={status === "signing"}
                        switchError={switchError}
                        onSwitchChain={() => void handleSwitch()}
                        onDeclare={() => void handleDeclare()}
                    />
                )}
            </div>
        </section>
    );
}

/**
 * A refused plan, laid out rather than printed.
 *
 * `not-the-owner`'s message names two 42-character addresses; as prose in a bordered box it wrapped
 * to three lines of mono and was the least legible thing on the page (the user, with a screenshot).
 * The guard carries `detail` rows for exactly this, and the headline comes from `code` — a
 * discriminator exists so a caller can branch without parsing prose, which includes this one.
 *
 * Anything that is not a `DeclareUseGuardError` still prints its message: an RPC that times out has
 * no code and no rows, and swallowing it would be worse than an ugly line.
 */
function Refusal({error}: {error: unknown}) {
    const guard = error instanceof DeclareUseGuardError ? error : null;
    const headline =
        guard === null
            ? "The check failed"
            : {
                  "bad-agent-ref": "That is not an agent reference",
                  "agent-not-found": "No such agent in the registry",
                  "not-the-owner": "Not your agent",
                  "no-identity-atom": "This agent has no identity atom here",
                  "object-not-on-chain": "This chain does not hold this atom yet",
                  "already-declared": "Already declared",
                  "cost-above-ceiling": "Over this app's per-transaction ceiling",
                  "mainnet-not-authorised": "Not open on this chain",
                  "no-position": "This claim would carry no position",
                  "planner-returned-nothing": "Nothing to plan",
                  "wrong-chain": "Your wallet is on another chain",
              }[guard.code];

    return (
        <div role="alert" className={`mt-6 ${cardClass}`}>
            <p className="font-medium">{headline}</p>
            {guard === null || guard.detail.length === 0 ? (
                <p className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    {error instanceof Error ? error.message : String(error)}
                </p>
            ) : (
                <dl className="mt-4 grid grid-cols-[6rem_1fr] gap-x-4 gap-y-2 text-[length:var(--text-body-sm)]">
                    {guard.detail.map((row) => (
                        <Fragment key={row.label}>
                            <dt className="text-[color:var(--color-steel)]">{row.label}</dt>
                            <dd className="font-mono break-all">{row.value}</dd>
                        </Fragment>
                    ))}
                </dl>
            )}
        </div>
    );
}

function Resolved(props: {
    plan: DeclaredUse;
    objectLabel: string;
    tx: Hex | null;
    chain: ChainChoice;
    onTargetChain: boolean;
    walletChainId: number | undefined;
    isSwitching: boolean;
    isSigning: boolean;
    switchError: string | null;
    onSwitchChain: () => void;
    onDeclare: () => void;
}) {
    const {plan, tx, chain} = props;

    return (
        <div className="mt-6 rounded-[var(--radius-card)] border border-[color:var(--color-rule)] p-[18px]">
            {/* The claim as a sentence, because a triple is a statement and reads as one — the
                lesson `AtomPanel`'s rows already carry. The subject is the part the operator chose,
                so it leads. */}
            <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-[length:var(--text-body-sm)]">
                    {plan.agent.chainId}/{plan.agent.tokenId}
                </span>
                <span className="text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    uses
                </span>
                <span className="min-w-0 truncate text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    {props.objectLabel}
                </span>
            </p>
            {/* `docs/05` §4 asks for hashes to be clickable, and these first shipped pointing at
                `${explorerUrl}/address/${termId}` — **dead links**. A term id is 32 bytes and the
                explorer wants 20: `GET /api/v2/addresses/0x99b0…3710a` answers
                `Invalid format. Expected ~r/^0x([A-Fa-f0-9]{40})$/`, while the HTML route returns
                200 because it is an SPA shell. A link that looks reachable and is not is worse than
                the text it replaced.

                So the subject goes to the app's **own** route, which resolves and is where every
                other atom on this page already points — `AtomPanel`'s "the graph is walkable in
                both directions". The edge stays plain text: nothing resolves a triple id on that
                explorer. */}
            <Field label="Subject atom" value={plan.subject} to={`/atom/${plan.subject}`} />
            <Field label="Edge" value={plan.tripleId} />

            {plan.exists ? (
                <p className="mt-8 font-medium">This agent has already declared using this atom.</p>
            ) : tx !== null ? (
                <div className="mt-8">
                    <p className="font-medium">Declared.</p>
                    <Field
                        label="Transaction"
                        value={truncateMiddle(tx, 14, 10)}
                        href={`${chain.explorerUrl}/tx/${tx}`}
                    />
                </div>
            ) : (
                <div className="mt-8">
                    <dl className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-y-2 gap-x-4 font-mono text-[length:var(--text-body-sm)] tabular-nums">
                        {/* Five rows, because the chain takes three bites and not one: the flat
                            creation fee, the entry fee, then shares rounded down. This read
                            `You send / Fee / Your position / Shares minted`, where "Your position"
                            was `totalValue - creationFee` — 0.001 tTRUST printed directly above
                            "Shares minted 0.00099". `assetsAfterFees` is read from
                            `previewTripleCreate`, never derived (ADR `0017` safeguard 6). */}
                        <Term
                            label="You send"
                            value={`${formatTrust(plan.totalValue)} ${chain.symbol}`}
                        />
                        <Term
                            label="Creation fee"
                            value={`${formatTrust(plan.creationFee)} ${chain.symbol}`}
                            hint={{
                                label: "What happens to the creation fee",
                                sentence: "The protocol keeps it; it does not come back.",
                            }}
                        />
                        <Term
                            label="Fees in total"
                            value={`${formatTrust(plan.feeAssets)} ${chain.symbol}`}
                        />
                        <Term
                            label="Reaches the vault"
                            value={`${formatTrust(plan.assetsAfterFees)} ${chain.symbol}`}
                        />
                        <Term label="Shares minted" value={formatTrust(plan.shares)} />
                    </dl>

                    {!props.onTargetChain ? (
                        <div className="mt-6">
                            <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                                Your wallet is on chain {props.walletChainId ?? "unknown"}. This
                                claim goes to {chain.chain.name} ({chain.chainId}).
                            </p>
                            <button
                                type="button"
                                onClick={props.onSwitchChain}
                                disabled={props.isSwitching}
                                className={`mt-3 ${controlClass}`}
                            >
                                {props.isSwitching ? "Switching…" : `Switch to ${chain.chain.name}`}
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
                            onClick={props.onDeclare}
                            disabled={props.isSigning}
                            className={`mt-6 ${primaryControlClass}`}
                        >
                            {props.isSigning
                                ? "Waiting for your wallet…"
                                : `Declare — ${formatTrust(plan.totalValue)} ${chain.symbol}`}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function Term({
    label,
    value,
    hint,
}: {
    label: string;
    value: string;
    hint?: {label: string; sentence: string};
}) {
    return (
        <>
            <dt className="font-sans text-[color:var(--color-steel)]">
                {label}
                {hint === undefined ? null : <Hint label={hint.label}>{hint.sentence}</Hint>}
            </dt>
            <dd>{value}</dd>
        </>
    );
}

function Field({
    label,
    value,
    href,
    to,
}: {
    label: string;
    value: string;
    /** An external target — a transaction on the block explorer. */
    href?: string;
    /** An in-app route. Separate from {@link href} so a `Link` is a `Link` and not an `<a href>`. */
    to?: string;
}) {
    return (
        <div className="mt-4">
            <p className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-steel)]">
                {label}
            </p>
            {to !== undefined ? (
                <Link
                    to={to}
                    className={`mt-1 block font-mono text-[length:var(--text-body-sm)] break-all ${linkClass}`}
                >
                    {value}
                </Link>
            ) : href === undefined ? (
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
