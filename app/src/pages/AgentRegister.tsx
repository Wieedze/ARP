import {useEffect, useState} from "react";
import {Link} from "react-router-dom";
import {type Hex, zeroAddress} from "viem";
import {useAccount, useWalletClient} from "wagmi";
import {getWalletClient} from "@wagmi/core";

import {publicClient} from "../lib/clients";
import {deployments} from "../lib/deployments";
import {wagmiConfig} from "../lib/wagmi";
import {useAgentId, useAgentWallet, useTotalAgents} from "../hooks/use-agent";
import {
    designateAgentRuntimeWallet,
    registerAgent,
} from "../services/agent-identity";
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
 *   4. Compose tools — link to the next page (phase 5).
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
    const [isSaDeployed, setIsSaDeployed] = useState<boolean | null>(null);
    const [step3Status, setStep3Status] = useState<StepStatus>("idle");
    const [step3Error, setStep3Error] = useState<string | null>(null);
    const [deployTx, setDeployTx] = useState<string | null>(null);

    useEffect(() => {
        if (!operatorAddress || !walletClient || !walletClient.account) return;
        let cancelled = false;
        (async () => {
            const sa = await createUserSmartAccount({
                owner: operatorAddress,
                signer: {walletClient},
            });
            if (cancelled) return;
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
            setIsSaDeployed(true);
            setStep3Status("done");
        } catch (err) {
            setStep3Status("error");
            setStep3Error((err as Error).message);
        }
    }

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
    const allDone = step1Done && step2Done && step3Done;

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
                        <DoneLine
                            label="Runtime wallet"
                            value={short(runtimeWalletQuery.data)}
                            tx={generatedRuntime?.tx ?? null}
                        />
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
                    subtitle="Required so the SA can act as delegator when you authorize the runtime to act on your behalf (ADR 0009). Counterfactual until first deploy."
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

                {/* ---------- Step 4 — Compose tools ---------- */}
                <Step
                    n={4}
                    title="Compose tools"
                    subtitle="Declare which tools the agent uses by creating triples + staking tTRUST on their atoms."
                    done={false}
                    pending={false}
                    error={null}
                >
                    {allDone ? (
                        <Link
                            to="/"
                            className="text-[color:var(--color-accent)] text-[length:var(--text-body-sm)]"
                        >
                            Go to modules →
                        </Link>
                    ) : (
                        <p className="text-[color:var(--color-fg-40)] text-[length:var(--text-body-sm)]">
                            Available after steps 1, 2, and 3.
                        </p>
                    )}
                </Step>
            </ol>
        </section>
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
