import {useId, useRef, useState} from "react";
import {Link} from "react-router-dom";
import {useAccount, useSwitchChain} from "wagmi";

import {DEFAULT_IDENTITY_REGISTRY} from "@arp-protocol/core";

import {Hint} from "../components/brand/Hint";
import {
    consentStatus,
    proofStatus,
    provenPhase,
    signedConsent,
    withError,
    writeError,
    writePlan,
    writeResult,
    writeStatus,
    type Phase,
    type ProvenAgent,
    type ProvenPhase,
} from "../components/import/import-phase";
import {
    ConsentPreview,
    LinkPlan,
    Proof,
    Published,
    Refusal,
} from "../components/import/ImportResults";
import {Failure, Field, labelClass, Step} from "../components/import/ImportStep";
import {MissingIdentityAtom} from "../components/import/MissingIdentityAtom";
import {controlClass, linkClass} from "../lib/control-class";
import {useAgentImport} from "../hooks/use-agent-import";
import {useChainChoice} from "../lib/chain-choice";
import {
    buildImportConsent,
    type ImportConsent,
    type ImportedAgent,
} from "../services/agent-import";
import {formatTrust, truncateMiddle} from "../services/trust-format";

/**
 * The "yes" branch of `/agent` — rendered inside `YourAgent`, not routed to.
 *
 * `/agent` mints a new ERC-8004 identity. This page takes one that already exists, so nothing is
 * minted here and the page says so where an operator would reasonably expect otherwise.
 *
 * Three steps, each requiring a click, nothing advancing on its own:
 *
 *   1. **Prove it is yours.** The registry names the owner. We read it and
 *      compare. That is the whole proof — no bridge, no cross-chain message.
 *   2. **Say so.** An EIP-712 statement naming the agent, the account that will
 *      act for it, the ARP context and a nonce. Consent, and the record of it.
 *   3. **Publish the link.** One `same as` edge on the selected Intuition chain, from the
 *      agent's canonical atom to the operating account's CAIP-10. Without it a
 *      tool stake is attributable to an address and to nothing else, and agent
 *      reputation — half of `docs/12` — has nothing to attach to.
 */

const LOOKUP_CHAINS: {id: number; label: string; note: string}[] = [
    {id: 8453, label: "Base (8453)", note: "mirrored into the Intuition graph"},
    {id: 56, label: "BSC (56)", note: "registry only — the graph does not mirror it"},
    {id: 1, label: "Ethereum (1)", note: "registry only — the graph does not mirror it"},
];

const inputClass =
    "mt-2 block w-full bg-transparent border border-[color:var(--color-rule-strong)] px-3 py-1.5 " +
    "font-mono focus:border-[color:var(--color-accent)]";

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function AgentImport() {
    const {address: connected, isConnected, chainId: walletChainId} = useAccount();
    const {switchChainAsync, isPending: isSwitching} = useSwitchChain();
    const actions = useAgentImport();
    const fieldId = useId();

    const [chainId, setChainId] = useState(8453);
    const [tokenId, setTokenId] = useState("");
    const [phase, setPhase] = useState<Phase>({step: "idle"});
    /**
     * Bumped by every check and every edit to the chain or token, so a registry reply that lands
     * after either is dropped instead of proving a token no longer on screen.
     */
    const checkRef = useRef(0);

    function resetCheck() {
        checkRef.current += 1;
        setPhase({step: "idle"});
    }

    const trimmedToken = tokenId.trim();
    const isTokenValid = /^\d+$/.test(trimmedToken);
    const chain = useChainChoice();
    const onTargetChain = walletChainId === chain.chainId;

    const proven: ProvenAgent | null = phase.step === "proven" ? phase.proven : null;
    const consent = phase.step === "proven" ? phase.consent : null;
    const signed = consent === null ? null : signedConsent(consent);
    const link = phase.step === "proven" ? phase.link : null;
    const plan = link === null ? null : writePlan(link);
    const txs = link === null ? null : writeResult(link);
    const linkStatus = link === null ? "idle" : writeStatus(link);
    const linkError = link === null ? null : writeError(link);
    const consentError = consent?.stage === "unsigned" ? consent.error : null;

    /**
     * Applies `update` to the proven phase only while it is still the one `proven` came from. A
     * reply that lands after the operator checked another token is dropped, not grafted onto it.
     */
    function updateProven(from: ProvenAgent, update: (current: ProvenPhase) => ProvenPhase) {
        setPhase((current) =>
            current.step === "proven" && current.proven === from ? update(current) : current,
        );
    }

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

    async function handleCheckOwnership() {
        if (!connected || !isTokenValid) return;
        checkRef.current += 1;
        const check = checkRef.current;
        const settle = (next: Phase) => {
            if (checkRef.current === check) setPhase(next);
        };
        setPhase({step: "checking"});
        try {
            const verdict = await actions.verifyOwnership({
                chainId,
                tokenId: trimmedToken,
                connected,
            });
            if (verdict.status !== "owned") {
                settle({step: "refused", verdict});
                return;
            }
            const [atom, operatingAccount] = await Promise.all([
                actions.resolveAtom({chainId, tokenId: trimmedToken}),
                actions.deriveOperatingAccount(verdict.owner),
            ]);
            settle(
                provenPhase({
                    chainId,
                    tokenId: trimmedToken,
                    caip19: verdict.caip19,
                    owner: verdict.owner,
                    atom,
                    operatingAccount,
                }),
            );
        } catch (error) {
            settle({step: "check-failed", message: errorMessage(error)});
        }
    }

    async function handleSignConsent() {
        if (proven === null) return;
        updateProven(proven, (current) => ({
            ...current,
            consent: {stage: "signing", previous: signedConsent(current.consent)},
        }));
        try {
            const next = buildImportConsent({
                caip19: proven.caip19,
                operator: proven.owner,
                operatingAccount: proven.operatingAccount,
            });
            const {signature, chainId: signedOnChainId} = await actions.signConsent(next);
            updateProven(proven, (current) => ({
                ...current,
                consent: {stage: "signed", signed: {consent: next, signature, signedOnChainId}},
            }));
        } catch (error) {
            updateProven(proven, (current) => ({
                ...current,
                consent: {
                    stage: "unsigned",
                    error: errorMessage(error),
                    previous: signedConsent(current.consent),
                },
            }));
        }
    }

    async function handlePlanLink() {
        if (proven === null || imported === null) return;
        updateProven(proven, (current) => ({...current, link: {stage: "pricing"}}));
        try {
            const priced = await actions.planLink(imported);
            updateProven(proven, (current) => ({
                ...current,
                link: {stage: "priced", plan: priced, error: null},
            }));
        } catch (error) {
            updateProven(proven, (current) => ({
                ...current,
                link: {stage: "unpriced", error: errorMessage(error)},
            }));
        }
    }

    async function handlePublishLink() {
        if (proven === null || imported === null || plan === null) return;
        updateProven(proven, (current) => ({...current, link: {stage: "sending", plan}}));
        try {
            const result = await actions.publishLink({imported, plan});
            updateProven(proven, (current) => ({
                ...current,
                link: {stage: "sent", plan, result},
            }));
        } catch (error) {
            updateProven(proven, (current) => ({
                ...current,
                link: {stage: "priced", plan, error: errorMessage(error)},
            }));
        }
    }

    async function handlePlanIdentity() {
        if (proven === null) return;
        updateProven(proven, (current) => ({...current, identity: {stage: "pricing"}}));
        try {
            const priced = await actions.planIdentity({
                chainId: proven.chainId,
                tokenId: proven.tokenId,
                registry: DEFAULT_IDENTITY_REGISTRY,
            });
            updateProven(proven, (current) => ({
                ...current,
                identity: {stage: "priced", plan: priced, error: null},
            }));
        } catch (error) {
            updateProven(proven, (current) => ({
                ...current,
                identity: {stage: "unpriced", error: errorMessage(error)},
            }));
        }
    }

    async function handlePublishIdentity() {
        if (phase.step !== "proven") return;
        const identityPlan = writePlan(phase.identity);
        if (identityPlan === null) return;
        const from = phase.proven;
        updateProven(from, (current) => ({
            ...current,
            identity: {stage: "sending", plan: identityPlan},
        }));
        try {
            const result = await actions.publishIdentity(identityPlan);
            updateProven(from, (current) => ({
                ...current,
                identity: {stage: "sent", plan: identityPlan, result: result.txs},
            }));
        } catch (error) {
            updateProven(from, (current) => ({
                ...current,
                identity: {stage: "priced", plan: identityPlan, error: errorMessage(error)},
            }));
        }
    }

    async function handleSwitchChain() {
        if (proven !== null) {
            updateProven(proven, (current) => ({...current, link: withError(current.link, null)}));
        }
        try {
            await switchChainAsync({chainId: chain.chainId});
        } catch (error) {
            if (proven === null) return;
            updateProven(proven, (current) => ({
                ...current,
                link: withError(current.link, errorMessage(error)),
            }));
        }
    }

    return (
        <section>
            <header className="mt-8 mb-12">
                <h1 className="type-display">Import an agent you already have</h1>
                <p className="mt-3 max-w-[64ch] text-[color:var(--color-steel)]">
                    Nothing is minted. One link gets published: your agent, tied to the agent wallet
                    that will give support on its behalf.
                </p>
                <p className="mt-3 max-w-[64ch] text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    Minting a new one instead is on{" "}
                    <Link className={linkClass} to="/agent">
                        the agent setup page
                    </Link>
                    , which mints into ARP's registry on Intuition testnet — a different registry
                    from the one read here.
                </p>
            </header>

            <Step
                index={1}
                title="Prove the agent is yours"
                status={proofStatus(phase)}
                result={
                    phase.step === "check-failed" ? (
                        <Failure message={phase.message} />
                    ) : phase.step === "refused" ? (
                        <Refusal verdict={phase.verdict} />
                    ) : proven !== null ? (
                        <Proof proven={proven} />
                    ) : null
                }
            >
                <form
                    className="max-w-[26rem]"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void handleCheckOwnership();
                    }}
                >
                    <div>
                        <label htmlFor={`${fieldId}-chain`} className={labelClass}>
                            Registry chain
                        </label>
                        <select
                            id={`${fieldId}-chain`}
                            value={chainId}
                            onChange={(event) => {
                                setChainId(Number(event.target.value));
                                resetCheck();
                            }}
                            aria-describedby={`${fieldId}-chain-note`}
                            className={`${inputClass} text-[length:var(--text-body-sm)]`}
                        >
                            {LOOKUP_CHAINS.map((chain) => (
                                <option key={chain.id} value={chain.id}>
                                    {chain.label}
                                </option>
                            ))}
                        </select>
                        <p
                            id={`${fieldId}-chain-note`}
                            className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]"
                        >
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
                                resetCheck();
                            }}
                            aria-invalid={trimmedToken !== "" && !isTokenValid}
                            aria-describedby={`${fieldId}-token-help`}
                            className={inputClass}
                        />
                        <p
                            id={`${fieldId}-token-help`}
                            className="mt-2 text-[length:var(--text-body-sm)]"
                        >
                            {trimmedToken !== "" && !isTokenValid
                                ? "Token ids are decimal, for example 2340."
                                : ""}
                        </p>
                    </div>

                    <button
                        type="submit"
                        disabled={!isConnected || !isTokenValid || phase.step === "checking"}
                        className={`mt-3 ${controlClass}`}
                    >
                        {phase.step === "checking" ? "Reading the registry…" : "Check ownership"}
                    </button>
                    {!isConnected ? (
                        <p className="mt-3 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                            Connect the wallet that owns the agent.
                        </p>
                    ) : null}
                </form>
            </Step>

            <Step
                index={2}
                title="Sign the statement"
                status={consent === null ? "idle" : consentStatus(consent)}
                disabled={proven === null}
                result={
                    consentError !== null ? (
                        <Failure message={consentError} />
                    ) : signed !== null ? (
                        <Field label="Signature" value={truncateMiddle(signed.signature, 14, 10)} />
                    ) : null
                }
            >
                {pendingConsent !== null ? <ConsentPreview consent={pendingConsent} /> : null}

                <button
                    type="button"
                    onClick={() => void handleSignConsent()}
                    disabled={proven === null || consent?.stage === "signing"}
                    className={`mt-6 ${controlClass}`}
                >
                    {consent?.stage === "signing"
                        ? "Waiting for your wallet…"
                        : "Sign the statement"}
                </button>
            </Step>

            <Step
                index={3}
                title="Publish the link"
                status={linkStatus}
                disabled={imported === null && !hasNoCanonicalAtom}
                result={
                    linkError !== null ? (
                        <Failure message={linkError} />
                    ) : txs !== null ? (
                        <Published txs={txs} explorerUrl={chain.explorerUrl} />
                    ) : null
                }
            >
                {phase.step === "proven" && phase.proven.atom === null ? (
                    <MissingIdentityAtom
                        write={phase.identity}
                        onTargetChain={onTargetChain}
                        chain={chain}
                        walletChainId={walletChainId}
                        isSwitching={isSwitching}
                        onSwitchChain={() => void handleSwitchChain()}
                        onPlan={() => void handlePlanIdentity()}
                        onPublish={() => void handlePublishIdentity()}
                    />
                ) : (
                    <>
                        <p className="mb-6 max-w-[64ch] text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                            One public link on {chain.chain.name}, paid in {chain.symbol}: your
                            agent and your agent wallet are the same.{" "}
                            <Hint label="What gets written">
                                <span className="font-mono">
                                    (agent atom, same as, CAIP-10 of your Smart Account)
                                </span>
                            </Hint>
                        </p>

                        {plan === null ? (
                            <button
                                type="button"
                                onClick={() => void handlePlanLink()}
                                disabled={imported === null || linkStatus === "pending"}
                                className={controlClass}
                            >
                                {linkStatus === "pending" ? "Pricing…" : "Price the link"}
                            </button>
                        ) : (
                            <LinkPlan plan={plan} />
                        )}

                        {plan !== null && txs === null ? (
                            !onTargetChain ? (
                                <div className="mt-6">
                                    <p className="max-w-[64ch] text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                                        Your wallet is on chain {walletChainId ?? "unknown"}. The
                                        write lands on {chain.chain.name} ({chain.chainId}).
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => void handleSwitchChain()}
                                        disabled={isSwitching}
                                        className={`mt-3 ${controlClass}`}
                                    >
                                        {isSwitching
                                            ? "Switching…"
                                            : `Switch to ${chain.chain.name}`}
                                    </button>
                                </div>
                            ) : plan.totalCost === 0n ? (
                                <p className="mt-6 max-w-[64ch] text-[length:var(--text-body-sm)]">
                                    This link is already public. There is nothing to send.
                                </p>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => void handlePublishLink()}
                                    disabled={linkStatus === "pending" || imported === null}
                                    className={`mt-6 ${controlClass}`}
                                >
                                    {linkStatus === "pending"
                                        ? "Waiting for your wallet…"
                                        : `Publish the link — ${formatTrust(plan.totalCost)} ${plan.chain.symbol}`}
                                </button>
                            )
                        ) : null}
                    </>
                )}
            </Step>

            {/* The rest — Smart Account, delegation, stakes — is not wired for an imported agent:
                `/agent` only recognises ARP's testnet registry and the delegation contracts are
                not on mainnet (ADR `0025`). That is a roadmap, so only the part a reader would
                walk into is on screen. */}
            <section className="mt-16 pl-5 border-l border-l-[color:var(--color-rule-strong)]">
                <p className="max-w-[64ch] text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    Permissions and support are not wired for an imported agent yet.
                </p>
            </section>
        </section>
    );
}
