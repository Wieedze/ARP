import {useState} from "react";
import {Link, useNavigate} from "react-router-dom";
import {formatEther, parseEther, type Address, type Hex} from "viem";
import {getWalletClient} from "@wagmi/core";
import {useAccount, useWalletClient} from "wagmi";

import {publicClient} from "../lib/clients";
import {deployments} from "../lib/deployments";
import {intuitionTestnet} from "../lib/chains";
import {wagmiConfig} from "../lib/wagmi";
import {useAgents, type Agent} from "../hooks/use-agents";
import {useAgentsWithReputation} from "../hooks/use-agent-reputation";

/**
 * `/hire` — example consumer of the ARP trust layer.
 *
 * Lists the live agents discovered via the ERC-8004 IdentityRegistry,
 * each annotated with its aggregate reputation footprint. A human picks
 * one, pastes a Solidity contract, declares a budget, and submits.
 *
 * Payment is a direct tTRUST transfer from the connected EOA to the
 * agent's runtime wallet. The transaction hash is then POSTed to the
 * agent's HTTP server (`scripts/agent-server.ts`), which validates the
 * payment on chain before running the audit + posting the on-chain
 * stakes.
 *
 * Result delivery is in-band: the agent server's response carries the
 * full report + signed receipt. We navigate to `/hire/result/:tx` once
 * the response arrives.
 */
export function Hire() {
    const navigate = useNavigate();
    const {address: requesterAddress, isConnected} = useAccount();
    const {data: walletClient} = useWalletClient();

    const agentsQuery = useAgents();
    const agents = agentsQuery.data ?? [];
    const enrichedQuery = useAgentsWithReputation(agents);
    const enriched = enrichedQuery.data ?? [];

    const [selectedAgentId, setSelectedAgentId] = useState<bigint | null>(null);
    const [contractCode, setContractCode] = useState("");
    const [budget, setBudget] = useState("0.005");
    const [endpoint, setEndpoint] = useState("http://localhost:3001");
    const [status, setStatus] = useState<
        "idle" | "pending" | "submitted" | "error"
    >("idle");
    const [error, setError] = useState<string | null>(null);

    const selectedAgent =
        selectedAgentId !== null
            ? enriched.find((a) => a.agentId === selectedAgentId)
            : null;

    async function getActiveWalletClient() {
        if (walletClient && walletClient.account) return walletClient;
        const fetched = await getWalletClient(wagmiConfig);
        if (!fetched || !fetched.account) {
            throw new Error("No wallet client — make sure your MetaMask is connected.");
        }
        return fetched;
    }

    async function handleHire() {
        if (!selectedAgent || !requesterAddress) return;
        setStatus("pending");
        setError(null);
        try {
            const wc = await getActiveWalletClient();
            const budgetWei = parseEther(budget.trim());
            if (budgetWei === 0n)
                throw new Error("Budget must be > 0 tTRUST");
            if (contractCode.trim().length < 30)
                throw new Error("Paste a Solidity contract first");

            // 1. Pay the agent
            const paymentTxHash = await wc.sendTransaction({
                to: selectedAgent.runtimeWallet,
                value: budgetWei,
                chain: intuitionTestnet,
            });
            await publicClient.waitForTransactionReceipt({hash: paymentTxHash});

            // 2. POST to the agent's HTTP server
            const res = await fetch(`${endpoint.replace(/\/$/, "")}/run`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    contractCode,
                    paymentTxHash,
                    requesterAddress,
                }),
            });
            const body = await res.json();
            if (!res.ok || body.error) {
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }

            // 3. Persist the result in sessionStorage and route to result page
            const key = `arp.audit.${paymentTxHash}`;
            sessionStorage.setItem(
                key,
                JSON.stringify({
                    agent: {
                        agentId: selectedAgent.agentId.toString(),
                        runtimeWallet: selectedAgent.runtimeWallet,
                    },
                    paymentTxHash,
                    budgetWei: budgetWei.toString(),
                    response: body,
                }),
            );
            setStatus("submitted");
            navigate(`/hire/result/${paymentTxHash}`);
        } catch (err) {
            setStatus("error");
            setError((err as Error).message);
        }
    }

    if (!isConnected) {
        return (
            <section>
                <PageHeader />
                <p className="text-[color:var(--color-fg-60)]">
                    Connect your wallet to hire an agent. You'll send tTRUST to
                    the agent's runtime; the agent will execute the task and
                    sign a receipt.
                </p>
            </section>
        );
    }

    return (
        <section>
            <PageHeader />

            <p className="text-[color:var(--color-fg-60)] mb-8 max-w-[640px]">
                Pick an agent, set a budget.
            </p>

            {agentsQuery.isLoading ? (
                <p className="text-[color:var(--color-fg-60)]">Loading agents…</p>
            ) : enriched.length === 0 ? (
                <p className="text-[color:var(--color-fg-60)]">
                    No agents registered yet.{" "}
                    <Link to="/agent" className="text-[color:var(--color-accent)]">
                        Register one
                    </Link>{" "}
                    to be the first.
                </p>
            ) : (
                <>
                    <h2 className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-fg-40)] mb-3">
                        Available agents
                    </h2>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
                        {enriched.map((agent) => (
                            <AgentCard
                                key={agent.agentId.toString()}
                                agent={agent}
                                selected={agent.agentId === selectedAgentId}
                                onSelect={() => setSelectedAgentId(agent.agentId)}
                            />
                        ))}
                    </ul>

                    {selectedAgent ? (
                        <div className="border-t border-[color:var(--color-border)] pt-8">
                            <h2 className="font-medium mb-4">Submit task</h2>

                            <label className="block text-[length:var(--text-body-sm)] mb-3">
                                <span className="text-[color:var(--color-fg-60)] block mb-1">
                                    Solidity contract
                                </span>
                                <textarea
                                    value={contractCode}
                                    onChange={(e) => setContractCode(e.target.value)}
                                    placeholder="// SPDX-License-Identifier: MIT&#10;pragma solidity ^0.8.24;&#10;&#10;contract MyContract { ... }"
                                    rows={12}
                                    className="block w-full bg-transparent border border-[color:var(--color-border)] px-3 py-2 font-mono text-[length:var(--text-body-sm)] focus:outline-none focus:border-[color:var(--color-accent)]"
                                />
                            </label>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                                <label className="block text-[length:var(--text-body-sm)]">
                                    <span className="text-[color:var(--color-fg-60)] block mb-1">
                                        Budget
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={budget}
                                            onChange={(e) => setBudget(e.target.value)}
                                            className="w-32 bg-transparent border border-[color:var(--color-border)] px-3 py-1.5 font-mono focus:outline-none focus:border-[color:var(--color-accent)]"
                                        />
                                        <span className="font-mono text-[color:var(--color-fg-40)]">
                                            tTRUST
                                        </span>
                                    </div>
                                </label>
                                <label className="block text-[length:var(--text-body-sm)]">
                                    <span className="text-[color:var(--color-fg-60)] block mb-1">
                                        Agent endpoint
                                    </span>
                                    <input
                                        type="text"
                                        value={endpoint}
                                        onChange={(e) => setEndpoint(e.target.value)}
                                        className="block w-full bg-transparent border border-[color:var(--color-border)] px-3 py-1.5 font-mono text-[length:var(--text-body-sm)] focus:outline-none focus:border-[color:var(--color-accent)]"
                                    />
                                </label>
                            </div>

                            <button
                                type="button"
                                onClick={handleHire}
                                disabled={status === "pending"}
                                className="px-3 py-1.5 text-[length:var(--text-body-sm)]"
                            >
                                {status === "pending"
                                    ? "Paying and awaiting result…"
                                    : `Hire ${selectedAgent.agentId === undefined ? "" : "#" + selectedAgent.agentId.toString()}`}
                            </button>
                            {error ? (
                                <p className="mt-4 text-[length:var(--text-body-sm)] font-mono break-all">
                                    Error: {error}
                                </p>
                            ) : null}
                        </div>
                    ) : (
                        <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-fg-40)]">
                            Pick an agent above to continue.
                        </p>
                    )}
                </>
            )}
        </section>
    );
}

function PageHeader() {
    return (
        <header className="mb-10">
            <h1 className="font-sans text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold">
                Hire an agent
            </h1>
            <p className="mt-2 text-[color:var(--color-fg-60)]">
                Example consumer of the ARP trust layer.
            </p>
        </header>
    );
}

function AgentCard({
    agent,
    selected,
    onSelect,
}: {
    agent: Agent & {
        reputation: {totalStaked: bigint; distinctAtomCount: number};
    };
    selected: boolean;
    onSelect: () => void;
}) {
    const exp = deployments.chain.explorerUrl;
    return (
        <li>
            <button
                type="button"
                onClick={onSelect}
                aria-pressed={selected}
                className={[
                    "block w-full text-left p-4 border",
                    selected
                        ? "border-[color:var(--color-accent)]"
                        : "border-[color:var(--color-border)]",
                ].join(" ")}
            >
                <div className="flex items-baseline justify-between gap-3 mb-1">
                    <span className="font-medium">
                        Agent #{agent.agentId.toString()}
                    </span>
                    <span className="font-mono text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-fg-40)]">
                        {agent.reputation.distinctAtomCount} tools
                    </span>
                </div>
                <p className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] mb-2">
                    runtime{" "}
                    <a
                        href={`${exp}/address/${agent.runtimeWallet}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {short(agent.runtimeWallet)}
                    </a>
                </p>
                <p className="font-mono text-[length:var(--text-body-sm)]">
                    <span className="text-[color:var(--color-fg-60)]">
                        total staked
                    </span>{" "}
                    <span className="text-[color:var(--color-accent)]">
                        {formatTrust(agent.reputation.totalStaked)} tTRUST
                    </span>
                </p>
            </button>
        </li>
    );
}

function short(addr: Address): string {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatTrust(wei: bigint): string {
    if (wei === 0n) return "0";
    const raw = formatEther(wei);
    if (!raw.includes(".")) return raw;
    return raw.replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Shape of a single agent's audit response: report, on-chain stakes,
 * signed receipt. Reused for both the Auditor (top-level) and the
 * Specialist (under `.subcontract.specialistResponse`).
 */
export type AgentAuditResponse = {
    report: {
        contractName: string;
        summary: string;
        findings: {
            severity: string;
            title: string;
            description: string;
            location?: string;
        }[];
        methodologiesUsed: string[];
        rawResponse: string;
    };
    stakes: {
        methodology: string;
        matchedModule?: {name: string};
        skipped?: string;
        atomId?: Hex;
        triple?: {created: boolean; tripleId: Hex; tx?: Hex};
        stake?: {amount: string; tx: Hex};
        error?: string;
    }[];
    receipt: {
        role?: "auditor" | "specialist";
        agent: Address;
        requestHash: Hex;
        resultHash: Hex;
        signature: Hex;
    };
};

// Helper used by the result page after navigation. Keeps the typing in
// one place so result UI doesn't have to re-derive shapes.
export type HireResultPayload = {
    agent: {agentId: string; runtimeWallet: Address};
    paymentTxHash: Hex;
    budgetWei: string;
    response: AgentAuditResponse & {
        subcontract?: {
            subPaymentTxHash: Hex;
            specialistResponse: AgentAuditResponse;
        } | null;
    };
};
