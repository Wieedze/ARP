import {useEffect, useState} from "react";
import {Link} from "react-router-dom";
import {useAccount, useWalletClient} from "wagmi";

import {publicClient} from "../lib/clients";
import {deployments} from "../lib/deployments";
import {useAgentId, useTotalAgents} from "../hooks/use-agent";
import {registerAgent} from "../services/agent-identity";
import {
    createUserSmartAccount,
    deploySmartAccountIfNeeded,
} from "../services/smart-account";

type StepStatus = "idle" | "pending" | "done" | "error";

/**
 * Agent setup page (`/agent`). Three steps:
 *
 *   1. Mint an ERC-8004 agent NFT — the user's identity in the ARP graph.
 *   2. Deploy the user's MetaMask Smart Account on-chain — required for
 *      it to act as `delegator` in subsequent delegations (ADR 0009).
 *   3. Confirmation + a link to the tool composition surface (Task 04b
 *      phase 5, lands next).
 *
 * No UI for delegation signing here — that belongs in the composition
 * step where the user actually chooses which tools to authorize the
 * agent to stake on.
 */
export function AgentRegister() {
    const {address: ownerAddress, isConnected} = useAccount();
    const {data: walletClient} = useWalletClient();
    const agentQuery = useAgentId();
    const totalAgentsQuery = useTotalAgents();

    // Step 1 state
    const [step1Status, setStep1Status] = useState<StepStatus>("idle");
    const [step1Error, setStep1Error] = useState<string | null>(null);
    const [registerTx, setRegisterTx] = useState<string | null>(null);

    // Step 2 state
    const [smartAccountAddress, setSmartAccountAddress] = useState<string | null>(null);
    const [isSaDeployed, setIsSaDeployed] = useState<boolean | null>(null);
    const [step2Status, setStep2Status] = useState<StepStatus>("idle");
    const [step2Error, setStep2Error] = useState<string | null>(null);
    const [deployTx, setDeployTx] = useState<string | null>(null);

    const agentId = agentQuery.data ?? null;

    // Compute the user's counterfactual Smart Account address and detect
    // whether it's already deployed.
    useEffect(() => {
        if (!ownerAddress || !walletClient || !walletClient.account) return;
        let cancelled = false;
        (async () => {
            const sa = await createUserSmartAccount({
                owner: ownerAddress,
                signer: {walletClient},
            });
            if (cancelled) return;
            setSmartAccountAddress(sa.address);
            const code = await publicClient.getCode({address: sa.address});
            if (cancelled) return;
            setIsSaDeployed(Boolean(code && code !== "0x"));
        })().catch((err) => {
            if (!cancelled) setStep2Error((err as Error).message);
        });
        return () => {
            cancelled = true;
        };
    }, [ownerAddress, walletClient]);

    async function handleRegister() {
        if (!walletClient || !walletClient.account) return;
        setStep1Status("pending");
        setStep1Error(null);
        try {
            const {tx} = await registerAgent({walletClient, publicClient});
            setRegisterTx(tx);
            await agentQuery.refetch();
            await totalAgentsQuery.refetch();
            setStep1Status("done");
        } catch (err) {
            setStep1Status("error");
            setStep1Error((err as Error).message);
        }
    }

    async function handleDeploySA() {
        if (!ownerAddress || !walletClient || !walletClient.account) return;
        setStep2Status("pending");
        setStep2Error(null);
        try {
            const sa = await createUserSmartAccount({
                owner: ownerAddress,
                signer: {walletClient},
            });
            const tx = await deploySmartAccountIfNeeded({
                smartAccount: sa,
                funderWalletClient: walletClient,
            });
            if (tx) setDeployTx(tx);
            setIsSaDeployed(true);
            setStep2Status("done");
        } catch (err) {
            setStep2Status("error");
            setStep2Error((err as Error).message);
        }
    }

    if (!isConnected) {
        return (
            <section>
                <PageHeader />
                <p className="text-[color:var(--color-fg-60)]">
                    Connect your wallet to set up an agent.
                </p>
            </section>
        );
    }

    const step1Done = agentId !== null && agentId > 0n;
    const step2Done = isSaDeployed === true;
    const allDone = step1Done && step2Done;

    return (
        <section>
            <PageHeader />

            <ol className="border-t border-[color:var(--color-border)]">
                {/* ---------- Step 1 — ERC-8004 identity ---------- */}
                <Step
                    n={1}
                    title="Mint your agent identity"
                    subtitle="Creates an ERC-8004 agent NFT owned by your wallet. This is your identity in the ARP graph."
                    done={step1Done}
                    pending={step1Status === "pending"}
                    error={step1Error}
                >
                    {step1Done ? (
                        <DoneLine label="Agent #" value={agentId!.toString()} tx={registerTx} />
                    ) : (
                        <button
                            type="button"
                            onClick={handleRegister}
                            disabled={step1Status === "pending"}
                            className="px-3 py-1.5 text-[length:var(--text-body-sm)]"
                        >
                            {step1Status === "pending" ? "Registering…" : "Register as agent"}
                        </button>
                    )}
                </Step>

                {/* ---------- Step 2 — Smart Account ---------- */}
                <Step
                    n={2}
                    title="Deploy your Smart Account"
                    subtitle="Required so the SA can act as delegator for the agent. Counterfactual until first deploy."
                    done={step2Done}
                    pending={step2Status === "pending"}
                    error={step2Error}
                >
                    {smartAccountAddress ? (
                        <p className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] mb-3">
                            {smartAccountAddress}
                        </p>
                    ) : null}
                    {step2Done ? (
                        <DoneLine label="Deployed" value="✓" tx={deployTx} />
                    ) : (
                        <button
                            type="button"
                            onClick={handleDeploySA}
                            disabled={step2Status === "pending" || smartAccountAddress === null}
                            className="px-3 py-1.5 text-[length:var(--text-body-sm)]"
                        >
                            {step2Status === "pending" ? "Deploying…" : "Deploy Smart Account"}
                        </button>
                    )}
                </Step>

                {/* ---------- Step 3 — Next ---------- */}
                <Step
                    n={3}
                    title="Compose tools"
                    subtitle="Declare which tools your agent uses by creating triples + staking tTRUST on their atoms."
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
                            Available after steps 1 and 2.
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
                Agent setup
            </h1>
            <p className="mt-2 text-[color:var(--color-fg-60)]">
                Two on-chain registrations and your agent is ready to compose tools.
                Registry:{" "}
                <a
                    className="font-mono"
                    target="_blank"
                    rel="noreferrer"
                    href={`${deployments.chain.explorerUrl}/address/${deployments.arp.identityRegistry}`}
                >
                    {deployments.arp.identityRegistry.slice(0, 6)}…
                    {deployments.arp.identityRegistry.slice(-4)}
                </a>
            </p>
        </header>
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
