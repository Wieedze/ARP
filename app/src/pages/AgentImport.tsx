import {useId, useState} from "react";
import {Link} from "react-router-dom";
import type {Address, Hex} from "viem";
import {useAccount, useSwitchChain} from "wagmi";

import {DEFAULT_IDENTITY_REGISTRY} from "@arp-protocol/erc8004";

import {useAgentImport} from "../hooks/use-agent-import";
import {
    INTUITION_MAINNET_CHAIN_ID,
    mainnetAddressUrl,
    mainnetTxUrl,
} from "../lib/intuition-mainnet";
import {
    ARP_IMPORT_CONTEXT,
    buildImportConsent,
    type CanonicalAgentAtom,
    type ImportConsent,
    type ImportedAgent,
    type ImportLinkPlan,
    type OwnershipVerdict,
} from "../services/agent-import";
import {formatTrust, truncateMiddle} from "../services/trust-format";

/**
 * `/agent/import` — the second door.
 *
 * `/agent` mints a new ERC-8004 identity. This page takes one that already
 * exists. 28,648 do, and none of them needs another, so nothing is minted here
 * and the page says so where an operator would reasonably expect otherwise.
 *
 * Three steps, each requiring a click, nothing advancing on its own:
 *
 *   1. **Prove it is yours.** The registry names the owner. We read it and
 *      compare. That is the whole proof — no bridge, no cross-chain message.
 *   2. **Say so.** An EIP-712 statement naming the agent, the account that will
 *      act for it, the ARP context and a nonce. Consent, and the record of it.
 *   3. **Publish the link.** One `same as` edge on Intuition mainnet, from the
 *      agent's canonical atom to the operating account's CAIP-10. Without it a
 *      tool stake is attributable to an address and to nothing else, and agent
 *      reputation — half of `docs/12` — has nothing to attach to.
 */

const LOOKUP_CHAINS: {id: number; label: string; note: string}[] = [
    {id: 8453, label: "Base (8453)", note: "mirrored into the Intuition graph"},
    {id: 56, label: "BSC (56)", note: "registry only — the graph does not mirror it"},
    {id: 1, label: "Ethereum (1)", note: "registry only — the graph does not mirror it"},
];

const controlClass =
    "px-3 py-1.5 text-[length:var(--text-body-sm)] border border-[color:var(--color-border-strong)] " +
    "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 " +
    "focus-visible:outline-[color:var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed";

const inputClass =
    "mt-2 block w-full bg-transparent border border-[color:var(--color-border-strong)] px-3 py-1.5 " +
    "font-mono focus:border-[color:var(--color-accent)]";

const labelClass =
    "block font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]";

type StepStatus = "idle" | "pending" | "done" | "error";

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** What the operator signed in step 2, kept apart from what step 1 proved. */
type SignedConsent = {consent: ImportConsent; signature: Hex; signedOnChainId: number};

/** What step 1 established, once it succeeded. */
type ProvenAgent = {
    chainId: number;
    tokenId: string;
    caip19: string;
    owner: Address;
    atom: CanonicalAgentAtom | null;
    operatingAccount: Address;
};

export function AgentImport() {
    const {address: connected, isConnected, chainId: walletChainId} = useAccount();
    const {switchChainAsync, isPending: isSwitching} = useSwitchChain();
    const actions = useAgentImport();
    const fieldId = useId();

    const [chainId, setChainId] = useState(8453);
    const [tokenId, setTokenId] = useState("");

    const [proofStatus, setProofStatus] = useState<StepStatus>("idle");
    const [proofError, setProofError] = useState<string | null>(null);
    const [refusal, setRefusal] = useState<OwnershipVerdict | null>(null);
    const [proven, setProven] = useState<ProvenAgent | null>(null);

    const [consentStatus, setConsentStatus] = useState<StepStatus>("idle");
    const [consentError, setConsentError] = useState<string | null>(null);
    const [signed, setSigned] = useState<SignedConsent | null>(null);

    const [linkStatus, setLinkStatus] = useState<StepStatus>("idle");
    const [linkError, setLinkError] = useState<string | null>(null);
    const [plan, setPlan] = useState<ImportLinkPlan | null>(null);
    const [txs, setTxs] = useState<{atomTx?: Hex; tripleTx?: Hex} | null>(null);

    const trimmedToken = tokenId.trim();
    const isTokenValid = /^\d+$/.test(trimmedToken);
    const onMainnet = walletChainId === INTUITION_MAINNET_CHAIN_ID;

    /**
     * The import, complete enough to write from.
     *
     * Composed rather than stored, so the type itself refuses the one
     * combination that must not reach the chain: a link with no canonical atom
     * to hang it on. An agent the graph does not mirror can still be proven and
     * consented to; it simply never produces one of these.
     */
    const imported: ImportedAgent | null =
        proven === null || proven.atom === null || signed === null
            ? null
            : {
                  ref: {
                      chainId: proven.chainId,
                      tokenId: proven.tokenId,
                      registry: DEFAULT_IDENTITY_REGISTRY,
                  },
                  caip19: proven.caip19,
                  owner: proven.owner,
                  agentAtomId: proven.atom.atomId,
                  agentLabel: proven.atom.label,
                  operatingAccount: proven.operatingAccount,
                  ...signed,
              };

    /** The graph does not mirror this agent, so step 3 explains instead of acting. */
    const hasNoCanonicalAtom = proven !== null && proven.atom === null;

    const pendingConsent: ImportConsent | null =
        proven === null
            ? null
            : buildImportConsent({
                  caip19: proven.caip19,
                  operator: proven.owner,
                  operatingAccount: proven.operatingAccount,
                  // Fixed within a render so the preview below shows the values
                  // that will actually be signed; a fresh nonce is drawn when
                  // the operator clicks.
                  nonce: 0n,
                  issuedAt: 0n,
              });

    function resetFromStep1() {
        setRefusal(null);
        setProven(null);
        setSigned(null);
        setPlan(null);
        setTxs(null);
        setConsentStatus("idle");
        setConsentError(null);
        setLinkStatus("idle");
        setLinkError(null);
    }

    async function handleCheckOwnership() {
        if (!connected || !isTokenValid) return;
        setProofStatus("pending");
        setProofError(null);
        resetFromStep1();
        try {
            const verdict = await actions.verifyOwnership({
                chainId,
                tokenId: trimmedToken,
                connected,
            });
            if (verdict.status !== "owned") {
                setRefusal(verdict);
                setProofStatus("done");
                return;
            }
            const [atom, operatingAccount] = await Promise.all([
                actions.resolveAtom({chainId, tokenId: trimmedToken}),
                actions.deriveOperatingAccount(verdict.owner),
            ]);
            setProven({
                chainId,
                tokenId: trimmedToken,
                caip19: verdict.caip19,
                owner: verdict.owner,
                atom,
                operatingAccount,
            });
            setProofStatus("done");
        } catch (error) {
            setProofStatus("error");
            setProofError(errorMessage(error));
        }
    }

    async function handleSignConsent() {
        if (proven === null) return;
        setConsentStatus("pending");
        setConsentError(null);
        try {
            const consent = buildImportConsent({
                caip19: proven.caip19,
                operator: proven.owner,
                operatingAccount: proven.operatingAccount,
            });
            const {signature, chainId: signedOnChainId} = await actions.signConsent(consent);
            setSigned({consent, signature, signedOnChainId});
            setConsentStatus("done");
        } catch (error) {
            setConsentStatus("error");
            setConsentError(errorMessage(error));
        }
    }

    async function handlePlanLink() {
        if (imported === null) return;
        setLinkStatus("pending");
        setLinkError(null);
        try {
            setPlan(await actions.planLink(imported));
            setLinkStatus("idle");
        } catch (error) {
            setLinkStatus("error");
            setLinkError(errorMessage(error));
        }
    }

    async function handlePublishLink() {
        if (imported === null || plan === null) return;
        setLinkStatus("pending");
        setLinkError(null);
        try {
            setTxs(await actions.publishLink({imported, plan}));
            setLinkStatus("done");
        } catch (error) {
            setLinkStatus("error");
            setLinkError(errorMessage(error));
        }
    }

    async function handleSwitchChain() {
        setLinkError(null);
        try {
            await switchChainAsync({chainId: INTUITION_MAINNET_CHAIN_ID});
        } catch (error) {
            setLinkError(errorMessage(error));
        }
    }

    return (
        <section>
            <header className="mb-12">
                <h1 className="text-[length:var(--text-display)] leading-[var(--leading-display)] font-semibold tracking-tight">
                    Import an agent you already have
                </h1>
                <p className="mt-3 max-w-[64ch] text-[color:var(--color-fg-60)]">
                    The ERC-8004 registry already names you as the owner, so nothing here mints a
                    second identity — not on the registry's chain, not on Intuition, not in ARP.
                    What gets published is one edge: your agent's canonical atom, linked to the
                    account that will stake for it.
                </p>
                <p className="mt-3 max-w-[64ch] text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                    Minting a new one instead is on{" "}
                    <Link className="underline" to="/agent">
                        the agent setup page
                    </Link>
                    . Both doors end in the same place.
                </p>
            </header>

            <Step index={1} title="Prove the agent is yours" status={proofStatus}>
                <p className="mb-6 max-w-[64ch] text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                    The registry is an ERC-721 and names an owner for every token. We read it and
                    compare it to your connected wallet. That comparison is the proof; the signature
                    in step 2 is consent, not evidence of ownership.
                </p>

                <div className="max-w-[26rem]">
                    <div>
                        <label htmlFor={`${fieldId}-chain`} className={labelClass}>
                            Registry chain
                        </label>
                        <select
                            id={`${fieldId}-chain`}
                            value={chainId}
                            onChange={(event) => {
                                setChainId(Number(event.target.value));
                                resetFromStep1();
                                setProofStatus("idle");
                            }}
                            className={`${inputClass} text-[length:var(--text-body-sm)]`}
                        >
                            {LOOKUP_CHAINS.map((chain) => (
                                <option key={chain.id} value={chain.id}>
                                    {chain.label}
                                </option>
                            ))}
                        </select>
                        <p className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                            {LOOKUP_CHAINS.find((chain) => chain.id === chainId)?.note}
                        </p>
                    </div>

                    <div className="mt-5">
                        <label htmlFor={`${fieldId}-token`} className={labelClass}>
                            Token id
                        </label>
                        <input
                            id={`${fieldId}-token`}
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            value={tokenId}
                            onChange={(event) => {
                                setTokenId(event.target.value);
                                resetFromStep1();
                                setProofStatus("idle");
                            }}
                            className={inputClass}
                        />
                        {trimmedToken !== "" && !isTokenValid ? (
                            <p className="mt-2 text-[length:var(--text-body-sm)]">
                                Token ids are decimal, for example 2340.
                            </p>
                        ) : null}
                    </div>

                    <button
                        type="button"
                        onClick={() => void handleCheckOwnership()}
                        disabled={!isConnected || !isTokenValid || proofStatus === "pending"}
                        className={`mt-5 ${controlClass}`}
                    >
                        {proofStatus === "pending" ? "Reading the registry…" : "Check ownership"}
                    </button>
                    {!isConnected ? (
                        <p className="mt-3 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                            Connect the wallet that owns the agent.
                        </p>
                    ) : null}
                </div>

                {proofError !== null ? <Failure message={proofError} /> : null}
                {refusal !== null ? <Refusal verdict={refusal} /> : null}
                {proven !== null ? <Proof proven={proven} /> : null}
            </Step>

            <Step
                index={2}
                title="Sign the statement"
                status={consentStatus}
                disabled={proven === null}
            >
                <p className="mb-6 max-w-[64ch] text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                    An EIP-712 message naming the agent, the account that will act for it, the ARP
                    context and a nonce. Nothing on chain verifies it — it is the recorded consent
                    behind the edge published in step 3, and it is checked again before that write.
                </p>

                {pendingConsent !== null ? <ConsentPreview consent={pendingConsent} /> : null}

                <button
                    type="button"
                    onClick={() => void handleSignConsent()}
                    disabled={proven === null || consentStatus === "pending"}
                    className={`mt-6 ${controlClass}`}
                >
                    {consentStatus === "pending"
                        ? "Waiting for your wallet…"
                        : "Sign the statement"}
                </button>

                {consentError !== null ? <Failure message={consentError} /> : null}
                {signed !== null ? (
                    <Field label="Signature" value={truncateMiddle(signed.signature, 14, 10)} />
                ) : null}
            </Step>

            <Step
                index={3}
                title="Publish the link"
                status={linkStatus}
                disabled={imported === null && !hasNoCanonicalAtom}
            >
                {hasNoCanonicalAtom && proven !== null ? (
                    <NoCanonicalAtom chainId={proven.chainId} />
                ) : (
                    <>
                        <p className="mb-6 max-w-[64ch] text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                            One triple on Intuition mainnet:{" "}
                            <span className="font-mono">
                                (agent atom, same as, CAIP-10 of your Smart Account)
                            </span>
                            . The predicate is Intuition's canonical <code>same as</code>, and the
                            subject is your agent's existing atom — neither is minted here. Real
                            TRUST pays for the write.
                        </p>

                        {plan === null ? (
                            <button
                                type="button"
                                onClick={() => void handlePlanLink()}
                                disabled={imported === null || linkStatus === "pending"}
                                className={controlClass}
                            >
                                {linkStatus === "pending" ? "Reading the vault…" : "Price the link"}
                            </button>
                        ) : (
                            <LinkPlan plan={plan} />
                        )}

                        {plan !== null && txs === null ? (
                            !onMainnet ? (
                                <div className="mt-6">
                                    <p className="max-w-[64ch] text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                                        Your wallet is on chain {walletChainId ?? "unknown"}. The
                                        write lands on Intuition mainnet (
                                        {INTUITION_MAINNET_CHAIN_ID}).
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => void handleSwitchChain()}
                                        disabled={isSwitching}
                                        className={`mt-3 ${controlClass}`}
                                    >
                                        {isSwitching ? "Switching…" : "Switch to Intuition mainnet"}
                                    </button>
                                </div>
                            ) : plan.totalCost === 0n ? (
                                <p className="mt-6 max-w-[64ch] text-[length:var(--text-body-sm)]">
                                    This link is already on the graph. There is nothing to send.
                                </p>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => void handlePublishLink()}
                                    disabled={linkStatus === "pending"}
                                    className={`mt-6 ${controlClass}`}
                                >
                                    {linkStatus === "pending"
                                        ? "Waiting for your wallet…"
                                        : `Publish the link — ${formatTrust(plan.totalCost)} TRUST`}
                                </button>
                            )
                        ) : null}

                        {linkError !== null ? <Failure message={linkError} /> : null}
                        {txs !== null ? <Published txs={txs} /> : null}
                    </>
                )}
            </Step>

            <section className="mt-16 pl-5 border-l border-l-[color:var(--color-border-strong)]">
                <h2 className="font-medium">What follows</h2>
                <p className="mt-3 max-w-[64ch] text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                    From here the agent takes the same path as one minted through ARP: a Smart
                    Account, a delegation whose caveats bound what the runtime may stake, and then
                    the stakes themselves. That flow lives on{" "}
                    <Link className="underline" to="/agent">
                        the agent setup page
                    </Link>
                    , and it runs against ARP's testnet contracts — the delegation and module
                    surfaces are not deployed on mainnet (ADR 0025).
                </p>
            </section>
        </section>
    );
}

function Step({
    index,
    title,
    status,
    disabled = false,
    children,
}: {
    index: number;
    title: string;
    status: StepStatus;
    disabled?: boolean;
    children: React.ReactNode;
}) {
    return (
        <section
            aria-labelledby={`import-step-${index}`}
            className={`mb-14 pl-5 border-l ${
                disabled
                    ? "border-l-[color:var(--color-border)] opacity-50"
                    : "border-l-[color:var(--color-border-strong)]"
            }`}
        >
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-40)]">
                    Step {index}
                </span>
                <h2 id={`import-step-${index}`} className="font-medium">
                    {title}
                </h2>
                {status === "done" ? (
                    <span className="font-mono text-[length:var(--text-label)] text-[color:var(--color-fg-60)]">
                        done
                    </span>
                ) : null}
            </div>
            <div className="mt-5" aria-disabled={disabled}>
                {children}
            </div>
        </section>
    );
}

function Field({label, value, href}: {label: string; value: string; href?: string}) {
    return (
        <div className="mt-4">
            <span className={labelClass}>{label}</span>
            {href === undefined ? (
                <p className="mt-1 font-mono text-[length:var(--text-body-sm)] break-all">
                    {value}
                </p>
            ) : (
                <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block font-mono text-[length:var(--text-body-sm)] break-all text-[color:var(--color-accent)] hover:underline"
                >
                    {value}
                </a>
            )}
        </div>
    );
}

function Failure({message}: {message: string}) {
    return (
        <p
            aria-live="polite"
            className="mt-5 max-w-[64ch] text-[length:var(--text-body-sm)] border-l border-l-[color:var(--color-alarm)] pl-4"
        >
            {message}
        </p>
    );
}

/** The registry's answer when it is not yours, or not there. Named, not softened. */
function Refusal({verdict}: {verdict: OwnershipVerdict}) {
    if (verdict.status === "not-found") {
        return (
            <div aria-live="polite" className="mt-6 max-w-[64ch]">
                <p className="font-medium">No such agent in that registry.</p>
                <p className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                    Token {verdict.ref.tokenId} on chain {verdict.ref.chainId} has never been
                    minted. Check the chain as well as the id — the same number is a different agent
                    on each one.
                </p>
            </div>
        );
    }
    if (verdict.status === "owner-mismatch") {
        return (
            <div aria-live="polite" className="mt-6 max-w-[64ch]">
                <p className="font-medium">That agent belongs to another address.</p>
                <p className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                    The registry names the owner below. Connect that wallet to import it.
                </p>
                <Field label="Owner" value={verdict.owner} />
                <Field label="Connected" value={verdict.connected} />
            </div>
        );
    }
    return null;
}

function Proof({proven}: {proven: ProvenAgent}) {
    return (
        <div aria-live="polite" className="mt-8 max-w-[64ch]">
            <p className="font-medium">
                {proven.atom?.label ?? `Agent ${proven.chainId}:${proven.tokenId}`} is yours.
            </p>
            <Field label="Identity" value={proven.caip19} />
            <Field label="Owner, per the registry" value={proven.owner} />
            {proven.atom === null ? (
                <Field label="Canonical Intuition atom" value="not mirrored — see step 3" />
            ) : (
                <Field
                    label="Canonical Intuition atom"
                    value={proven.atom.atomId}
                    href={mainnetAddressUrl(proven.atom.atomId)}
                />
            )}
            <Field label="Your Smart Account, which will stake" value={proven.operatingAccount} />
        </div>
    );
}

function ConsentPreview({consent}: {consent: ImportConsent}) {
    return (
        <dl className="max-w-[64ch] border-t border-[color:var(--color-border)] pt-4">
            {[
                ["agent", consent.agent],
                ["operator", consent.operator],
                ["operatingAccount", consent.operatingAccount],
                ["context", ARP_IMPORT_CONTEXT],
            ].map(([term, value]) => (
                <div key={term} className="flex flex-wrap gap-x-4 py-1">
                    <dt className="w-40 shrink-0 font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                        {term}
                    </dt>
                    <dd className="font-mono text-[length:var(--text-body-sm)] break-all">
                        {value}
                    </dd>
                </div>
            ))}
            <div className="flex flex-wrap gap-x-4 py-1">
                <dt className="w-40 shrink-0 font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                    nonce
                </dt>
                <dd className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                    drawn when you sign
                </dd>
            </div>
        </dl>
    );
}

function NoCanonicalAtom({chainId}: {chainId: number}) {
    return (
        <div className="max-w-[64ch]">
            <p className="font-medium">
                The Intuition graph does not mirror this agent, so there is no atom to link.
            </p>
            <p className="mt-3 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                The mirror covers Base (8453); this agent is on chain {chainId}. Deriving an atom
                here instead would produce a differently-pinned duplicate — a separate node that
                splits the agent's staking surface from the one the ecosystem reads. So nothing is
                written. Your ownership is proven and your statement stands; the link waits for the
                mirror.
            </p>
        </div>
    );
}

function LinkPlan({plan}: {plan: ImportLinkPlan}) {
    return (
        <div className="max-w-[64ch]">
            <Field label="Subject — the agent's canonical atom" value={plan.agentAtomId} />
            <Field label="Predicate — Intuition's `same as`" value={plan.predicateId} />
            <Field
                label={`Object — your account${plan.accountAtomExists ? ", already on the graph" : ", to be created"}`}
                value={plan.accountAtomUri}
            />
            <div className="mt-6 border-t border-[color:var(--color-border)] pt-4">
                <p className="font-mono text-[length:var(--text-body-sm)] tabular-nums">
                    {plan.accountAtomExists
                        ? "account atom — already published, 0 TRUST"
                        : `account atom — ${formatTrust(plan.atomCost)} TRUST`}
                </p>
                <p className="mt-1 font-mono text-[length:var(--text-body-sm)] tabular-nums">
                    {plan.tripleExists
                        ? "same-as edge — already published, 0 TRUST"
                        : `same-as edge — ${formatTrust(plan.tripleCost)} TRUST`}
                </p>
                <p className="mt-2 font-mono text-[length:var(--text-body-sm)] tabular-nums">
                    total — {formatTrust(plan.totalCost)} TRUST
                </p>
            </div>
        </div>
    );
}

function Published({txs}: {txs: {atomTx?: Hex; tripleTx?: Hex}}) {
    return (
        <div aria-live="polite" className="mt-6 max-w-[64ch]">
            <p className="font-medium">The link is on the graph.</p>
            <p className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                Stakes sent from that account are now attributable to this agent, which is what
                agent reputation is read from.
            </p>
            {txs.atomTx !== undefined ? (
                <Field
                    label="Account atom"
                    value={truncateMiddle(txs.atomTx, 14, 10)}
                    href={mainnetTxUrl(txs.atomTx)}
                />
            ) : null}
            {txs.tripleTx !== undefined ? (
                <Field
                    label="Same-as edge"
                    value={truncateMiddle(txs.tripleTx, 14, 10)}
                    href={mainnetTxUrl(txs.tripleTx)}
                />
            ) : null}
        </div>
    );
}
