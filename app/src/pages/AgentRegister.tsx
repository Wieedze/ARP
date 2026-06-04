import {useEffect, useMemo, useState} from "react";
import {Link} from "react-router-dom";
import {parseEther, type Hex, zeroAddress} from "viem";
import {useAccount, useWalletClient} from "wagmi";
import {getWalletClient} from "@wagmi/core";
import {
    Implementation,
    type MetaMaskSmartAccount,
} from "@metamask/smart-accounts-kit";

import {
    composeAndStakeCaveats,
    publishModuleCaveats,
} from "../lib/caveat-builder";
import {publicClient} from "../lib/clients";
import {deployments} from "../lib/deployments";
import {wagmiConfig} from "../lib/wagmi";
import {useAgentId, useAgentWallet, useTotalAgents} from "../hooks/use-agent";
import {useAllModules, useDomains} from "../hooks/use-modules";
import {useStoredDelegations} from "../hooks/use-stored-delegations";
import {
    designateAgentRuntimeWallet,
    registerAgent,
} from "../services/agent-identity";
import {
    buildDelegation,
    randomSalt,
    serializeDelegation,
    signDelegationAs,
} from "../services/delegation";
import {
    createUserSmartAccount,
    deploySmartAccountIfNeeded,
} from "../services/smart-account";

type StepStatus = "idle" | "pending" | "done" | "error";

/**
 * Agent setup page (`/agent`). Four steps that materialize the conceptual
 * split between OPERATOR (the human team running the agent) and the
 * AGENT itself (autonomous software with its own keys):
 *
 *   1. Mint the agent NFT — owned by the operator wallet (you).
 *   2. Designate the agent's runtime wallet — a fresh keypair generated
 *      here, registered on-chain via `setAgentWallet` with the EIP-712
 *      consent signature from the new wallet. The operator submits the
 *      tx; the runtime key is yours to save.
 *   3. Deploy your operator Smart Account — required because Task 03b's
 *      delegation flow needs a contract delegator (ADR 0009). Your
 *      future delegation to the agent runtime is signed by the SA.
 *   4. Sign delegations — Publish + Compose, scoped by ARP caveats.
 *   5. Hand off to the runtime — operator setup ends; the runtime
 *      acts under the signed delegations via `@arp/sdk`.
 */
export function AgentRegister() {
    const {address: operatorAddress, isConnected} = useAccount();
    const {data: walletClient} = useWalletClient();
    const agentQuery = useAgentId();
    const totalAgentsQuery = useTotalAgents();
    const agentId = agentQuery.data ?? null;
    const runtimeWalletQuery = useAgentWallet(agentId);

    // Step 1 state
    const [step1Status, setStep1Status] = useState<StepStatus>("idle");
    const [step1Error, setStep1Error] = useState<string | null>(null);
    const [registerTx, setRegisterTx] = useState<string | null>(null);

    // Step 2 state — designate runtime wallet
    const [step2Status, setStep2Status] = useState<StepStatus>("idle");
    const [step2Error, setStep2Error] = useState<string | null>(null);
    const [generatedRuntime, setGeneratedRuntime] = useState<{
        address: string;
        privateKey: Hex;
        tx: string;
    } | null>(null);

    // Step 3 state — operator Smart Account
    const [smartAccountAddress, setSmartAccountAddress] = useState<string | null>(null);
    const [smartAccount, setSmartAccount] = useState<MetaMaskSmartAccount<
        Implementation.Hybrid
    > | null>(null);
    const [isSaDeployed, setIsSaDeployed] = useState<boolean | null>(null);
    const [step3Status, setStep3Status] = useState<StepStatus>("idle");
    const [step3Error, setStep3Error] = useState<string | null>(null);
    const [deployTx, setDeployTx] = useState<string | null>(null);

    // Step 4 state — sign delegations (publish A + compose B)
    const {modules} = useAllModules();
    const knownDomains = useDomains(modules);
    const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
    const [capInput, setCapInput] = useState("1");
    const [periodSeconds, setPeriodSeconds] = useState<bigint>(86_400n);
    const [step4Status, setStep4Status] = useState<StepStatus>("idle");
    const [step4Error, setStep4Error] = useState<string | null>(null);
    const storedDelegations = useStoredDelegations(
        (smartAccountAddress as `0x${string}` | null) ?? undefined,
    );

    // Step 5 state — fund runtime + approve MultiVault (one-click bring-up)
    const [step5Status, setStep5Status] = useState<StepStatus>("idle");
    const [step5Error, setStep5Error] = useState<string | null>(null);
    const [bringUpTxs, setBringUpTxs] = useState<{
        fundTx: string;
        approveTx: string;
    } | null>(null);
    const [pastedRuntimeKey, setPastedRuntimeKey] = useState("");

    // Resolve the runtime private key from whichever source is available
    // — fresh in-memory keypair from step 2, or a paste from a returning
    // session. Validated `0x` + 64 hex chars before exposing.
    const trimmedPaste = pastedRuntimeKey.trim();
    const isValidPaste = /^0x[0-9a-fA-F]{64}$/.test(trimmedPaste);
    const activeRuntimeKey: Hex | null = generatedRuntime
        ? generatedRuntime.privateKey
        : isValidPaste
          ? (trimmedPaste as Hex)
          : null;

    useEffect(() => {
        if (!operatorAddress || !walletClient || !walletClient.account) return;
        let cancelled = false;
        (async () => {
            const sa = await createUserSmartAccount({
                owner: operatorAddress,
                signer: {walletClient},
            });
            if (cancelled) return;
            setSmartAccount(sa);
            setSmartAccountAddress(sa.address);
            const code = await publicClient.getCode({address: sa.address});
            if (cancelled) return;
            setIsSaDeployed(Boolean(code && code !== "0x"));
        })().catch((err) => {
            if (!cancelled) setStep3Error((err as Error).message);
        });
        return () => {
            cancelled = true;
        };
    }, [operatorAddress, walletClient]);

    /**
     * Resolve a connected WalletClient on-demand. The `useWalletClient` hook
     * is async and may be `undefined` at the moment of click (timing); we
     * fall back to `getWalletClient(wagmiConfig)` which fetches the connector's
     * client directly. Either path returns the same shape.
     */
    async function getActiveWalletClient() {
        if (walletClient && walletClient.account) return walletClient;
        const fetched = await getWalletClient(wagmiConfig);
        if (!fetched || !fetched.account) {
            throw new Error(
                "No wallet client available — make sure your wallet is connected.",
            );
        }
        return fetched;
    }

    async function handleMintNft() {
        setStep1Status("pending");
        setStep1Error(null);
        try {
            const wc = await getActiveWalletClient();
            const {tx} = await registerAgent({walletClient: wc, publicClient});
            setRegisterTx(tx);
            await agentQuery.refetch();
            await totalAgentsQuery.refetch();
            setStep1Status("done");
        } catch (err) {
            setStep1Status("error");
            setStep1Error((err as Error).message);
        }
    }

    async function handleDesignateRuntime() {
        if (!agentId) return;
        setStep2Status("pending");
        setStep2Error(null);
        try {
            const wc = await getActiveWalletClient();
            const result = await designateAgentRuntimeWallet({
                agentId,
                operatorWalletClient: wc,
                publicClient,
            });
            setGeneratedRuntime({
                address: result.agentWalletAddress,
                privateKey: result.agentWalletPrivateKey,
                tx: result.tx,
            });
            await runtimeWalletQuery.refetch();
            setStep2Status("done");
        } catch (err) {
            setStep2Status("error");
            setStep2Error((err as Error).message);
        }
    }

    async function handleDeploySA() {
        if (!operatorAddress) return;
        setStep3Status("pending");
        setStep3Error(null);
        try {
            const wc = await getActiveWalletClient();
            const sa = await createUserSmartAccount({
                owner: operatorAddress,
                signer: {walletClient: wc},
            });
            const tx = await deploySmartAccountIfNeeded({
                smartAccount: sa,
                funderWalletClient: wc,
            });
            if (tx) setDeployTx(tx);
            setSmartAccount(sa);
            setIsSaDeployed(true);
            setStep3Status("done");
        } catch (err) {
            setStep3Status("error");
            setStep3Error((err as Error).message);
        }
    }

    /**
     * Sign both ARP delegations in sequence:
     *   - publish: agent can `registerModule` in `selectedDomains`, capped
     *   - compose: agent can `deposit`/`createAtoms`/`createTriples` on
     *     MultiVault, same cap/period
     *
     * The delegate is the runtime wallet bound in step 2. The delegator is
     * the operator's Smart Account (must be deployed). The signatures are
     * produced by the SA's owner (the connected EOA) routed through the
     * SA's EIP-712 path.
     */
    async function handleSignDelegations() {
        if (!smartAccount) {
            setStep4Error("Smart Account not ready");
            setStep4Status("error");
            return;
        }
        const runtimeAddress = runtimeWalletQuery.data;
        if (!runtimeAddress || runtimeAddress === zeroAddress) {
            setStep4Error("Runtime wallet not designated (step 2)");
            setStep4Status("error");
            return;
        }
        if (selectedDomains.length === 0) {
            setStep4Error("Select at least one allowed domain");
            setStep4Status("error");
            return;
        }
        let cap: bigint;
        try {
            cap = parseEther(capInput.trim());
        } catch {
            setStep4Error("Cap must be a valid tTRUST amount");
            setStep4Status("error");
            return;
        }
        if (cap === 0n) {
            setStep4Error("Cap must be > 0");
            setStep4Status("error");
            return;
        }

        setStep4Status("pending");
        setStep4Error(null);
        try {
            const publishUnsigned = buildDelegation({
                delegator: smartAccount.address,
                delegate: runtimeAddress as Hex,
                caveats: publishModuleCaveats({
                    allowedDomains: selectedDomains,
                    cap,
                    periodSeconds,
                }),
                salt: randomSalt(),
            });
            const composeUnsigned = buildDelegation({
                delegator: smartAccount.address,
                delegate: runtimeAddress as Hex,
                caveats: composeAndStakeCaveats({cap, periodSeconds}),
                salt: randomSalt(),
            });
            const publishSigned = await signDelegationAs({
                delegation: publishUnsigned,
                smartAccount,
            });
            const composeSigned = await signDelegationAs({
                delegation: composeUnsigned,
                smartAccount,
            });
            storedDelegations.set(publishSigned, composeSigned);
            setStep4Status("done");
        } catch (err) {
            setStep4Status("error");
            setStep4Error((err as Error).message);
        }
    }

    /**
     * Step 5 — fund the runtime EOA from the operator's wallet and let
     * the runtime grant the MultiVault DEPOSIT approval to the Smart
     * Account. Replaces `scripts/agent-approve-sa.ts`. Only works in the
     * same session as step 2 (the runtime private key lives in component
     * state). FUND_AMOUNT covers many approve + stake txns.
     */
    async function handleBringUpRuntime() {
        if (!activeRuntimeKey || !smartAccountAddress) return;
        setStep5Status("pending");
        setStep5Error(null);
        try {
            const wc = await getActiveWalletClient();
            const {fundAndApproveRuntime} = await import(
                "../services/delegation-redeem"
            );
            const result = await fundAndApproveRuntime({
                operatorWalletClient: wc,
                runtimePrivateKey: activeRuntimeKey,
                smartAccountAddress: smartAccountAddress as `0x${string}`,
                publicClient,
                fundAmount: parseEther("0.01"),
            });
            setBringUpTxs({fundTx: result.fundTx, approveTx: result.approveTx});
            setStep5Status("done");
        } catch (err) {
            setStep5Status("error");
            setStep5Error((err as Error).message);
        }
    }

    const envBlob = useMemo(() => {
        if (!storedDelegations.stored) return null;
        const pkLine = activeRuntimeKey
            ? `AGENT_PRIVATE_KEY=${activeRuntimeKey}`
            : `# AGENT_PRIVATE_KEY=0x... (paste the runtime key you saved at step 2)`;
        return [
            `# Paste into scripts/.env for agent-loop.ts (autonomous walk)`,
            `# or agent-server.ts (on-demand hire flow). Each runtime reads`,
            `# whichever vars apply to its role.`,
            ``,
            pkLine,
            `DELEGATION_PUBLISH_JSON='${serializeDelegation(storedDelegations.stored.publish)}'`,
            `DELEGATION_COMPOSE_JSON='${serializeDelegation(storedDelegations.stored.compose)}'`,
            ``,
            `# --- agent-server.ts options (all optional) ---`,
            `# AGENT_SERVER_PORT=3001                         # HTTP listen port`,
            `# AGENT_MIN_BUDGET_TTRUST=0.005                  # reject hire requests below this`,
            `# SPECIALIST_ENDPOINT=http://localhost:3002      # enable A2A sub-contracting`,
            `# AGENT2_RUNTIME_ADDRESS=0x...                   # specialist runtime to pay`,
            `# SUBCONTRACT_FEE_TTRUST=0.002                   # fee paid to the specialist`,
            ``,
        ].join("\n");
    }, [storedDelegations.stored, activeRuntimeKey]);

    if (!isConnected) {
        return (
            <section>
                <PageHeader />
                <p className="text-[color:var(--color-fg-60)]">
                    Connect your wallet (the operator) to set up an agent.
                </p>
            </section>
        );
    }

    const step1Done = agentId !== null && agentId > 0n;
    const runtimeBound =
        runtimeWalletQuery.data !== undefined &&
        runtimeWalletQuery.data !== null &&
        runtimeWalletQuery.data !== zeroAddress;
    const step2Done = step1Done && runtimeBound;
    const step3Done = isSaDeployed === true;
    const step4Done = step3Done && storedDelegations.stored !== null;
    const allDone = step1Done && step2Done && step3Done && step4Done;

    return (
        <section>
            <PageHeader />

            <RoleBanner operatorAddress={operatorAddress ?? null} />

            <ol className="border-t border-[color:var(--color-border)]">
                {/* ---------- Step 1 — Mint NFT ---------- */}
                <Step
                    n={1}
                    title="Mint the agent NFT"
                    subtitle="An ERC-8004 agent NFT owned by your operator wallet. The agent itself is the NFT — your wallet is the team running it."
                    done={step1Done}
                    pending={step1Status === "pending"}
                    error={step1Error}
                >
                    {step1Done ? (
                        <DoneLine label="Agent #" value={agentId!.toString()} tx={registerTx} />
                    ) : (
                        <button
                            type="button"
                            onClick={handleMintNft}
                            disabled={step1Status === "pending"}
                            className="px-3 py-1.5 text-[length:var(--text-body-sm)]"
                        >
                            {step1Status === "pending" ? "Minting…" : "Mint agent NFT"}
                        </button>
                    )}
                </Step>

                {/* ---------- Step 2 — Designate runtime wallet ---------- */}
                <Step
                    n={2}
                    title="Designate the agent's runtime wallet"
                    subtitle="A fresh keypair the autonomous program will hold. The operator submits, the runtime wallet signs its own consent via EIP-712. Generated in your browser — save the private key."
                    done={step2Done}
                    pending={step2Status === "pending"}
                    error={step2Error}
                >
                    {runtimeBound && runtimeWalletQuery.data ? (
                        <>
                            <DoneLine
                                label="Runtime wallet"
                                value={short(runtimeWalletQuery.data)}
                                tx={generatedRuntime?.tx ?? null}
                            />
                            <button
                                type="button"
                                onClick={handleDesignateRuntime}
                                disabled={step2Status === "pending"}
                                className="mt-3 px-3 py-1.5 text-[length:var(--text-body-sm)] border border-[color:var(--color-border)]"
                                title="Rotates the runtime key. Existing delegations become unusable — re-sign at step 4 after rotation."
                            >
                                {step2Status === "pending"
                                    ? "Rotating…"
                                    : "Re-generate runtime keypair"}
                            </button>
                        </>
                    ) : step1Done ? (
                        <button
                            type="button"
                            onClick={handleDesignateRuntime}
                            disabled={step2Status === "pending"}
                            className="px-3 py-1.5 text-[length:var(--text-body-sm)]"
                        >
                            {step2Status === "pending"
                                ? "Generating + signing + submitting…"
                                : "Generate runtime keypair"}
                        </button>
                    ) : (
                        <p className="text-[color:var(--color-fg-40)] text-[length:var(--text-body-sm)]">
                            Available after step 1.
                        </p>
                    )}

                    {generatedRuntime ? (
                        <RuntimeKeyDisplay
                            address={generatedRuntime.address}
                            privateKey={generatedRuntime.privateKey}
                        />
                    ) : null}
                </Step>

                {/* ---------- Step 3 — Operator Smart Account ---------- */}
                <Step
                    n={3}
                    title="Deploy your operator Smart Account"
                    subtitle="Required so the SA can act as delegator when you authorize the runtime to act on your behalf"
                    done={step3Done}
                    pending={step3Status === "pending"}
                    error={step3Error}
                >
                    {smartAccountAddress ? (
                        <p className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] mb-3">
                            {smartAccountAddress}
                        </p>
                    ) : null}
                    {step3Done ? (
                        <DoneLine label="Deployed" value="✓" tx={deployTx} />
                    ) : (
                        <button
                            type="button"
                            onClick={handleDeploySA}
                            disabled={step3Status === "pending" || smartAccountAddress === null}
                            className="px-3 py-1.5 text-[length:var(--text-body-sm)]"
                        >
                            {step3Status === "pending" ? "Deploying…" : "Deploy Smart Account"}
                        </button>
                    )}
                </Step>

                {/* ---------- Step 4 — Sign delegations ---------- */}
                <Step
                    n={4}
                    title="Sign delegations to your agent"
                    subtitle="Two scoped permissions: publish new modules in chosen domains, and compose/stake on MultiVault. Bounded by cap + period. Signed once by your Smart Account."
                    done={step4Done}
                    pending={step4Status === "pending"}
                    error={step4Error}
                >
                    {step4Done && storedDelegations.stored ? (
                        <DelegationsActive
                            signedAt={storedDelegations.stored.signedAt}
                            envBlob={envBlob}
                            onClear={() => storedDelegations.clear()}
                        />
                    ) : step3Done ? (
                        <DelegationForm
                            knownDomains={knownDomains}
                            selectedDomains={selectedDomains}
                            onToggleDomain={(d) =>
                                setSelectedDomains((prev) =>
                                    prev.includes(d)
                                        ? prev.filter((x) => x !== d)
                                        : [...prev, d],
                                )
                            }
                            capInput={capInput}
                            onCapChange={setCapInput}
                            periodSeconds={periodSeconds}
                            onPeriodChange={setPeriodSeconds}
                            onSign={handleSignDelegations}
                            pending={step4Status === "pending"}
                        />
                    ) : (
                        <p className="text-[color:var(--color-fg-40)] text-[length:var(--text-body-sm)]">
                            Available after steps 1, 2, and 3.
                        </p>
                    )}
                </Step>

                {/* ---------- Step 5 — Hand off to the runtime ---------- */}
                <Step
                    n={5}
                    title="Hand off to the runtime"
                    subtitle="Operator setup ends here. From now on the agent's runtime acts under the delegations you just signed — it discovers tools via @arp/sdk, declares (agent → uses → tool) triples, and stakes tTRUST on each tool it composes with."
                    done={false}
                    pending={false}
                    error={null}
                >
                    {allDone ? (
                        <div className="text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] space-y-4 max-w-[680px]">
                            <div className="border border-[color:var(--color-border)] p-3">
                                <p className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-fg-40)] mb-1">
                                    Bring-up
                                </p>
                                <p className="mb-3">
                                    Fund the runtime and grant the MultiVault DEPOSIT
                                    approval to your Smart Account.
                                </p>
                                {step5Status === "done" && bringUpTxs ? (
                                    <div className="font-mono text-[length:var(--text-body-sm)]">
                                        <p className="text-[color:var(--color-accent)] mb-2">
                                            Runtime ready
                                        </p>
                                        <p>
                                            <span className="text-[color:var(--color-fg-40)]">
                                                fund tx
                                            </span>{" "}
                                            <a
                                                href={`${deployments.chain.explorerUrl}/tx/${bringUpTxs.fundTx}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-[color:var(--color-accent)]"
                                            >
                                                {bringUpTxs.fundTx.slice(0, 10)}…
                                            </a>
                                        </p>
                                        <p>
                                            <span className="text-[color:var(--color-fg-40)]">
                                                approve tx
                                            </span>{" "}
                                            <a
                                                href={`${deployments.chain.explorerUrl}/tx/${bringUpTxs.approveTx}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-[color:var(--color-accent)]"
                                            >
                                                {bringUpTxs.approveTx.slice(0, 10)}…
                                            </a>
                                        </p>
                                    </div>
                                ) : (
                                    <>
                                        {!generatedRuntime ? (
                                            <div className="mb-3">
                                                <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-fg-40)] mb-2">
                                                    Runtime private key isn't in this
                                                    session's memory (it lives only in
                                                    the browser tab where you ran step
                                                    2). Paste the key you saved to
                                                    re-enable the button, or run{" "}
                                                    <span className="font-mono">
                                                        bun scripts/agent-approve-sa.ts
                                                    </span>{" "}
                                                    instead.
                                                </p>
                                                <input
                                                    type="password"
                                                    value={pastedRuntimeKey}
                                                    onChange={(e) =>
                                                        setPastedRuntimeKey(
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder="0x…"
                                                    disabled={step5Status === "pending"}
                                                    className="block w-full max-w-[680px] bg-transparent border border-[color:var(--color-border)] px-3 py-1.5 font-mono text-[length:var(--text-body-sm)] focus:outline-none focus:border-[color:var(--color-accent)]"
                                                />
                                                {pastedRuntimeKey.length > 0 &&
                                                !isValidPaste ? (
                                                    <p className="mt-1 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-40)]">
                                                        Expected{" "}
                                                        <span className="font-mono">
                                                            0x
                                                        </span>{" "}
                                                        + 64 hex chars.
                                                    </p>
                                                ) : null}
                                            </div>
                                        ) : null}
                                        <button
                                            type="button"
                                            onClick={handleBringUpRuntime}
                                            disabled={
                                                step5Status === "pending" ||
                                                !activeRuntimeKey
                                            }
                                            className="px-3 py-1.5 text-[length:var(--text-body-sm)]"
                                        >
                                            {step5Status === "pending"
                                                ? "Funding and approving…"
                                                : "Fund + approve runtime"}
                                        </button>
                                        {step5Error ? (
                                            <p className="mt-2 text-[length:var(--text-body-sm)] font-mono break-all">
                                                Error: {step5Error}
                                            </p>
                                        ) : null}
                                    </>
                                )}
                            </div>
                            <ul className="font-mono text-[length:var(--text-body-sm)] ml-4 space-y-1">
                            </ul>
                            <p className="pt-2">
                                <Link
                                    to="/"
                                    className="text-[color:var(--color-accent)]"
                                >
                                    Watch the modules page →
                                </Link>{" "}
                            </p>
                        </div>
                    ) : (
                        <p className="text-[color:var(--color-fg-40)] text-[length:var(--text-body-sm)]">
                            Available after steps 1 – 4.
                        </p>
                    )}
                </Step>
            </ol>
        </section>
    );
}

/** Form for configuring + signing the two delegations. */
function DelegationForm({
    knownDomains,
    selectedDomains,
    onToggleDomain,
    capInput,
    onCapChange,
    periodSeconds,
    onPeriodChange,
    onSign,
    pending,
}: {
    knownDomains: string[];
    selectedDomains: string[];
    onToggleDomain: (d: string) => void;
    capInput: string;
    onCapChange: (s: string) => void;
    periodSeconds: bigint;
    onPeriodChange: (s: bigint) => void;
    onSign: () => void;
    pending: boolean;
}) {
    return (
        <div className="space-y-4">
            <div>
                <p className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-fg-40)] mb-2">
                    Allowed domains (publish)
                </p>
                {knownDomains.length === 0 ? (
                    <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                        No domains yet. The agent will be able to publish in
                        whichever domains exist when it acts.
                    </p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {knownDomains.map((d) => {
                            const active = selectedDomains.includes(d);
                            return (
                                <button
                                    key={d}
                                    type="button"
                                    onClick={() => onToggleDomain(d)}
                                    disabled={pending}
                                    className={[
                                        "font-mono uppercase tracking-wider text-[length:var(--text-label)] px-3 py-1 border",
                                        active
                                            ? "border-[color:var(--color-accent)] text-[color:var(--color-accent)]"
                                            : "border-[color:var(--color-border)] text-[color:var(--color-fg-60)]",
                                    ].join(" ")}
                                >
                                    {d}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block text-[length:var(--text-body-sm)]">
                    <span className="text-[color:var(--color-fg-60)] block mb-1">
                        Cap per period
                    </span>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={capInput}
                            onChange={(e) => onCapChange(e.target.value)}
                            disabled={pending}
                            className="w-32 bg-transparent border border-[color:var(--color-border)] px-3 py-1.5 font-mono focus:outline-none focus:border-[color:var(--color-accent)]"
                        />
                        <span className="font-mono text-[color:var(--color-fg-40)]">
                            tTRUST
                        </span>
                    </div>
                </label>
                <fieldset>
                    <legend className="text-[color:var(--color-fg-60)] block mb-1 text-[length:var(--text-body-sm)]">
                        Window
                    </legend>
                    <div className="flex gap-3 text-[length:var(--text-body-sm)] font-mono">
                        {[
                            {label: "1h", secs: 3_600n},
                            {label: "1d", secs: 86_400n},
                            {label: "7d", secs: 604_800n},
                        ].map(({label, secs}) => {
                            const active = periodSeconds === secs;
                            return (
                                <label
                                    key={label}
                                    className={[
                                        "cursor-pointer px-3 py-1 border",
                                        active
                                            ? "border-[color:var(--color-accent)] text-[color:var(--color-accent)]"
                                            : "border-[color:var(--color-border)] text-[color:var(--color-fg-60)]",
                                    ].join(" ")}
                                >
                                    <input
                                        type="radio"
                                        name="period"
                                        className="sr-only"
                                        checked={active}
                                        onChange={() => onPeriodChange(secs)}
                                        disabled={pending}
                                    />
                                    {label}
                                </label>
                            );
                        })}
                    </div>
                </fieldset>
            </div>

            <button
                type="button"
                onClick={onSign}
                disabled={pending}
                className="px-3 py-1.5 text-[length:var(--text-body-sm)]"
            >
                {pending ? "Signing…" : "Sign 2 delegations"}
            </button>
        </div>
    );
}

/**
 * Confirmation panel once both delegations are signed + stored. Surfaces
 * the env blob so the operator can paste it into `.env` for the headless
 * runtime in `scripts/agent-loop.ts`.
 */
function DelegationsActive({
    signedAt,
    envBlob,
    onClear,
}: {
    signedAt: number;
    envBlob: string | null;
    onClear: () => void;
}) {
    const [copied, setCopied] = useState(false);
    const date = new Date(signedAt * 1000).toISOString();
    return (
        <div className="border border-[color:var(--color-accent)] p-4">
            <p className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-accent)] mb-2">
                Delegations active
            </p>
            <p className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] mb-3">
                Signed {date}
            </p>
            {envBlob ? (
                <textarea
                    readOnly
                    value={envBlob}
                    className="w-full h-32 bg-transparent border border-[color:var(--color-border)] p-3 font-mono text-[length:var(--text-body-sm)] resize-none"
                />
            ) : null}
            <div className="flex gap-3 mt-3">
                <button
                    type="button"
                    onClick={() => {
                        if (!envBlob) return;
                        navigator.clipboard.writeText(envBlob);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2_000);
                    }}
                    className="px-3 py-1.5 text-[length:var(--text-body-sm)]"
                >
                    {copied ? "Copied" : "Copy as .env"}
                </button>
                <button
                    type="button"
                    onClick={onClear}
                    className="px-3 py-1.5 text-[length:var(--text-body-sm)] border border-[color:var(--color-border)]"
                >
                    Clear + re-sign
                </button>
            </div>
        </div>
    );
}

function PageHeader() {
    return (
        <header className="mb-10">
            <h1 className="font-sans text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold">
                Configure an agent
            </h1>
            <p className="mt-2 text-[color:var(--color-fg-60)] max-w-[640px]">
                You — the operator — set up an agent's on-chain identity. The agent itself is a
                separate entity with its own keys; it runs autonomously once configured. Registry:{" "}
                <a
                    className="font-mono"
                    target="_blank"
                    rel="noreferrer"
                    href={`${deployments.chain.explorerUrl}/address/${deployments.arp.identityRegistry}`}
                >
                    {short(deployments.arp.identityRegistry)}
                </a>
            </p>
        </header>
    );
}

function RoleBanner({operatorAddress}: {operatorAddress: string | null}) {
    return (
        <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 gap-3 border border-[color:var(--color-border)] p-4">
            <div>
                <p className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-fg-40)] mb-1">
                    Operator
                </p>
                <p className="font-mono text-[length:var(--text-body-sm)]">
                    {operatorAddress ? short(operatorAddress) : "—"}
                </p>
                <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] mt-1">
                    Connected wallet. Owns the agent NFT, signs admin actions.
                </p>
            </div>
            <div>
                <p className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-fg-40)] mb-1">
                    Agent runtime
                </p>
                <p className="font-mono text-[length:var(--text-body-sm)]">
                    designated in step 2
                </p>
                <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] mt-1">
                    Separate wallet. The autonomous program holds this key.
                </p>
            </div>
        </div>
    );
}

function RuntimeKeyDisplay({address, privateKey}: {address: string; privateKey: Hex}) {
    const [copiedKey, setCopiedKey] = useState(false);
    return (
        <div className="mt-4 border border-[color:var(--color-accent)] p-4">
            <p className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-accent)] mb-2">
                Save these now — the private key is shown ONCE
            </p>
            <dl className="text-[length:var(--text-body-sm)] font-mono">
                <div className="grid grid-cols-[8rem_1fr] gap-2 mb-1">
                    <dt className="text-[color:var(--color-fg-60)]">Address:</dt>
                    <dd className="break-all">{address}</dd>
                </div>
                <div className="grid grid-cols-[8rem_1fr] gap-2">
                    <dt className="text-[color:var(--color-fg-60)]">Private key:</dt>
                    <dd className="break-all">{privateKey}</dd>
                </div>
            </dl>
            <button
                type="button"
                onClick={() => {
                    navigator.clipboard.writeText(
                        `AGENT_ADDRESS=${address}\nAGENT_PRIVATE_KEY=${privateKey}\n`,
                    );
                    setCopiedKey(true);
                    setTimeout(() => setCopiedKey(false), 2_000);
                }}
                className="mt-3 px-3 py-1.5 text-[length:var(--text-body-sm)]"
            >
                {copiedKey ? "Copied" : "Copy as .env"}
            </button>
        </div>
    );
}

function Step({
    n,
    title,
    subtitle,
    done,
    pending,
    error,
    children,
}: {
    n: number;
    title: string;
    subtitle: string;
    done: boolean;
    pending: boolean;
    error: string | null;
    children: React.ReactNode;
}) {
    const status = done ? "DONE" : pending ? "RUNNING…" : "PENDING";
    const statusColor = done
        ? "text-[color:var(--color-accent)]"
        : pending
          ? "text-[color:var(--color-fg)]"
          : "text-[color:var(--color-fg-40)]";

    return (
        <li className="grid grid-cols-[2.5rem_1fr] gap-x-4 border-b border-[color:var(--color-border)] py-6">
            <span className="font-mono text-[color:var(--color-fg-40)]">{n}.</span>
            <div>
                <div className="flex items-baseline justify-between gap-3 mb-1">
                    <h2 className="font-medium">{title}</h2>
                    <span
                        className={`font-mono uppercase tracking-wider text-[length:var(--text-label)] ${statusColor}`}
                    >
                        {status}
                    </span>
                </div>
                <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] mb-3">
                    {subtitle}
                </p>
                {error ? (
                    <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-fg)] mb-3 font-mono break-all">
                        Error: {error}
                    </p>
                ) : null}
                {children}
            </div>
        </li>
    );
}

function DoneLine({label, value, tx}: {label: string; value: string; tx: string | null}) {
    return (
        <p className="font-mono text-[length:var(--text-body-sm)]">
            <span className="text-[color:var(--color-fg-60)]">{label}</span>{" "}
            <span className="text-[color:var(--color-accent)]">{value}</span>
            {tx ? (
                <>
                    {"  "}
                    <a
                        href={`${deployments.chain.explorerUrl}/tx/${tx}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[color:var(--color-fg-40)] hover:text-[color:var(--color-accent)]"
                    >
                        {tx.slice(0, 8)}…{tx.slice(-6)} ↗
                    </a>
                </>
            ) : null}
        </p>
    );
}

function short(addr: string): string {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
