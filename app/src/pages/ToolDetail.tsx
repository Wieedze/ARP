import {useEffect, useState} from "react";
import {Link, useParams} from "react-router-dom";
import {formatEther, parseEther, stringToHex, type Hex} from "viem";
import {getWalletClient} from "@wagmi/core";
import {useAccount, useWalletClient} from "wagmi";

import {multiVaultAbi} from "../lib/abi/multi-vault";
import {publicClient} from "../lib/clients";
import {deployments} from "../lib/deployments";
import {wagmiConfig} from "../lib/wagmi";
import {useAgentId} from "../hooks/use-agent";
import {useAtomStake} from "../hooks/use-atom-stake";
import {useModule} from "../hooks/use-modules";
import {depositOnAtom} from "../services/atom-stake";
import {
    declareUsesTriple,
    ensureAtomForThing,
    ensureAtomForURI,
} from "../services/intuition-graph";

type StepStatus = "idle" | "pending" | "done" | "error";

/**
 * Tool detail + composition page (`/tool/:id`).
 *
 * Shows the module's metadata + reputation metrics surfaced from the
 * Intuition vault for the tool's atom, plus an inline compose wizard
 * that materializes both ARP layers in three transactions:
 *
 *   A. Ensure the agent atom exists on Intuition (pin Thing → createAtoms
 *      if needed). Idempotent.
 *   B. Create the triple `(agent atom, "uses" atom, tool atom)`.
 *   C. Stake the user-selected amount of tTRUST on the tool atom.
 *
 * The operator's wallet signs everything for the MVP. In production the
 * agent runtime would do these calls programmatically.
 */
export function ToolDetail() {
    const {id: idParam} = useParams();
    const moduleId = idParam ? BigInt(idParam) : null;
    const moduleQuery = useModule(moduleId);

    const {address: operatorAddress, isConnected} = useAccount();
    const {data: walletClient} = useWalletClient();
    const {data: agentId} = useAgentId();

    const m = moduleQuery.data;

    // Tool atom IDs are content-derived from schemaURI via the MultiVault's
    // calculateAtomId(bytes32) view — fetch async on module load (ADR 0008).
    const [computedToolAtomId, setComputedToolAtomId] = useState<Hex | null>(null);
    useEffect(() => {
        if (!m) return;
        let cancelled = false;
        (async () => {
            const atomId = await publicClient.readContract({
                address: deployments.intuition.multiVault,
                abi: multiVaultAbi,
                functionName: "calculateAtomId",
                args: [stringToHex(m.schemaURI)],
            });
            if (!cancelled) setComputedToolAtomId(atomId);
        })().catch(() => {
            /* surface in UI later if needed */
        });
        return () => {
            cancelled = true;
        };
    }, [m]);

    const stakeQuery = useAtomStake(computedToolAtomId ?? undefined);

    // Compose wizard state
    const [amountInput, setAmountInput] = useState("0.05");
    const [composeStatus, setComposeStatus] = useState<StepStatus>("idle");
    const [composeError, setComposeError] = useState<string | null>(null);
    const [composeSteps, setComposeSteps] = useState<{
        agentAtomTx?: string;
        agentAtomCreated?: boolean;
        agentAtomId?: Hex;
        toolAtomTx?: string;
        toolAtomCreated?: boolean;
        tripleTx?: string;
        depositTx?: string;
    }>({});

    async function getActiveWalletClient() {
        if (walletClient && walletClient.account) return walletClient;
        const fetched = await getWalletClient(wagmiConfig);
        if (!fetched || !fetched.account) {
            throw new Error("No wallet client available — make sure your wallet is connected.");
        }
        return fetched;
    }

    async function handleCompose() {
        if (!m || !agentId || !computedToolAtomId) return;
        setComposeStatus("pending");
        setComposeError(null);
        try {
            const amount = parseEther(amountInput.trim());
            const wc = await getActiveWalletClient();

            // A. Agent atom (idempotent — pinned Thing for the agent identity)
            const agentAtomRes = await ensureAtomForThing({
                thing: {
                    name: `ARP Agent #${agentId.toString()}`,
                    description: `Agent registered on the ARP IdentityRegistry. Operator: ${operatorAddress ?? ""}.`,
                },
                walletClient: wc,
                publicClient,
            });
            setComposeSteps((s) => ({
                ...s,
                agentAtomTx: agentAtomRes.tx,
                agentAtomCreated: agentAtomRes.created,
                agentAtomId: agentAtomRes.atomId,
            }));

            // B. Tool atom — created directly from the module's `schemaURI`
            // (the canonical tool URI per ADR 0008). Skipping this would
            // make the triple below reference an atom that does not exist
            // on chain — MultiVault_TermDoesNotExist.
            const toolAtomRes = await ensureAtomForURI({
                uri: m.schemaURI,
                walletClient: wc,
                publicClient,
            });
            setComposeSteps((s) => ({
                ...s,
                toolAtomTx: toolAtomRes.tx,
                toolAtomCreated: toolAtomRes.created,
            }));

            // C. Triple agent → uses → tool
            const tripleRes = await declareUsesTriple({
                agentAtomId: agentAtomRes.atomId,
                toolAtomId: toolAtomRes.atomId,
                walletClient: wc,
                publicClient,
            });
            setComposeSteps((s) => ({...s, tripleTx: tripleRes.tx}));

            // D. Stake on the tool atom
            const depositTx = await depositOnAtom({
                atomId: toolAtomRes.atomId,
                amount,
                walletClient: wc,
                publicClient,
            });
            await publicClient.waitForTransactionReceipt({hash: depositTx});
            setComposeSteps((s) => ({...s, depositTx}));
            await stakeQuery.refetch();
            setComposeStatus("done");
        } catch (err) {
            setComposeStatus("error");
            setComposeError((err as Error).message);
        }
    }

    if (!moduleId) {
        return (
            <p className="text-[color:var(--color-fg-60)]">Invalid module ID.</p>
        );
    }

    if (moduleQuery.isLoading) {
        return <p className="text-[color:var(--color-fg-60)]">Loading module…</p>;
    }

    if (moduleQuery.error || !m) {
        return (
            <p className="text-[color:var(--color-fg-60)]">
                Module not found.{" "}
                <Link className="text-[color:var(--color-accent)]" to="/">
                    Back to modules
                </Link>
            </p>
        );
    }

    const ready = isConnected && agentId !== null && agentId !== undefined && agentId > 0n;

    return (
        <article>
            <Link
                to="/"
                className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-40)]"
            >
                ← modules
            </Link>

            <header className="mt-4 mb-10 grid sm:grid-cols-[1fr_auto] gap-x-8 gap-y-2 items-baseline">
                <h1 className="font-sans text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold">
                    {m.name}
                </h1>
                <span className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-accent)]">
                    {m.domain}
                </span>
            </header>

            {/* ---------- Metadata table ---------- */}
            <dl className="grid grid-cols-[8rem_1fr] gap-y-3 gap-x-4 text-[length:var(--text-body-sm)] border-y border-[color:var(--color-border)] py-6">
                <dt className="text-[color:var(--color-fg-40)] uppercase tracking-wider text-[length:var(--text-label)]">
                    Module ID
                </dt>
                <dd className="font-mono">#{m.id.toString()}</dd>

                <dt className="text-[color:var(--color-fg-40)] uppercase tracking-wider text-[length:var(--text-label)]">
                    Creator
                </dt>
                <dd className="font-mono">
                    <a
                        href={`${deployments.chain.explorerUrl}/address/${m.creator}`}
                        target="_blank"
                        rel="noreferrer"
                    >
                        {m.creator}
                    </a>
                </dd>

                <dt className="text-[color:var(--color-fg-40)] uppercase tracking-wider text-[length:var(--text-label)]">
                    Schema URI
                </dt>
                <dd className="font-mono break-all">{m.schemaURI}</dd>

                <dt className="text-[color:var(--color-fg-40)] uppercase tracking-wider text-[length:var(--text-label)]">
                    Registered
                </dt>
                <dd className="font-mono">
                    {new Date(Number(m.createdAt) * 1000).toISOString()}
                </dd>
            </dl>

            {m.description ? (
                <p className="mt-6 text-[color:var(--color-fg-60)]">{m.description}</p>
            ) : null}

            {/* ---------- Reputation metrics ---------- */}
            <section className="mt-12">
                <h2 className="font-medium mb-4">Reputation</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Metric
                        label="Total staked"
                        value={
                            stakeQuery.data
                                ? `${formatEther(stakeQuery.data.totalAssets)} tTRUST`
                                : "—"
                        }
                    />
                    <Metric
                        label="Shares minted"
                        value={
                            stakeQuery.data
                                ? stakeQuery.data.totalShares.toString()
                                : "—"
                        }
                    />
                    <Metric
                        label="Tool atom"
                        value={
                            computedToolAtomId
                                ? `${computedToolAtomId.slice(0, 10)}…`
                                : "—"
                        }
                    />
                </div>
            </section>

            {/* ---------- Compose ---------- */}
            <section className="mt-12">
                <h2 className="font-medium mb-2">Use this tool</h2>
                <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] mb-6 max-w-[640px]">
                    Declare that your agent uses this tool by creating the triple{" "}
                    <span className="font-mono">agent → uses → tool</span> on Intuition and
                    staking tTRUST on the tool's atom. The stake is the agent's economic
                    conviction that the tool is part of its composition.
                </p>

                {!ready ? (
                    <p className="text-[color:var(--color-fg-60)] text-[length:var(--text-body-sm)]">
                        Connect your wallet and{" "}
                        <Link to="/agent" className="text-[color:var(--color-accent)]">
                            register an agent
                        </Link>{" "}
                        first.
                    </p>
                ) : composeStatus === "done" ? (
                    <ComposeResult steps={composeSteps} />
                ) : (
                    <div>
                        <label className="block text-[length:var(--text-body-sm)] mb-2">
                            <span className="text-[color:var(--color-fg-60)]">
                                Stake amount
                            </span>
                            <input
                                type="text"
                                value={amountInput}
                                onChange={(e) => setAmountInput(e.target.value)}
                                disabled={composeStatus === "pending"}
                                className="mt-1 block w-48 bg-transparent border border-[color:var(--color-border)] px-3 py-1.5 font-mono focus:outline-none focus:border-[color:var(--color-accent)]"
                            />
                            <span className="ml-2 font-mono text-[color:var(--color-fg-40)]">
                                tTRUST
                            </span>
                        </label>
                        <button
                            type="button"
                            onClick={handleCompose}
                            disabled={composeStatus === "pending"}
                            className="px-3 py-1.5 text-[length:var(--text-body-sm)]"
                        >
                            {composeStatus === "pending"
                                ? "Composing…"
                                : "Compose with this tool"}
                        </button>
                        {composeError ? (
                            <p className="mt-4 text-[length:var(--text-body-sm)] font-mono break-all">
                                Error: {composeError}
                            </p>
                        ) : null}
                        {composeSteps.tripleTx ||
                        composeSteps.agentAtomTx ||
                        composeSteps.toolAtomTx ||
                        composeSteps.depositTx ? (
                            <div className="mt-4">
                                <p className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-fg-40)] mb-1">
                                    Progress
                                </p>
                                <PartialSteps steps={composeSteps} />
                            </div>
                        ) : null}
                    </div>
                )}
            </section>
        </article>
    );
}

function Metric({label, value}: {label: string; value: string}) {
    return (
        <div className="border border-[color:var(--color-border)] p-3">
            <p className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-fg-40)] mb-1">
                {label}
            </p>
            <p className="font-mono text-[length:var(--text-body)]">{value}</p>
        </div>
    );
}

function ComposeResult({
    steps,
}: {
    steps: {
        agentAtomTx?: string;
        agentAtomCreated?: boolean;
        toolAtomTx?: string;
        toolAtomCreated?: boolean;
        tripleTx?: string;
        depositTx?: string;
    };
}) {
    return (
        <div className="border border-[color:var(--color-accent)] p-4">
            <p className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-accent)] mb-3">
                Composition recorded
            </p>
            <ResultLine
                label="Agent atom"
                tx={steps.agentAtomTx}
                note={steps.agentAtomCreated ? "created" : "reused"}
            />
            <ResultLine
                label="Tool atom"
                tx={steps.toolAtomTx}
                note={steps.toolAtomCreated ? "created" : "reused"}
            />
            <ResultLine label="Triple agent → uses → tool" tx={steps.tripleTx} />
            <ResultLine label="Stake on tool atom" tx={steps.depositTx} />
        </div>
    );
}

function PartialSteps({
    steps,
}: {
    steps: {
        agentAtomTx?: string;
        toolAtomTx?: string;
        tripleTx?: string;
        depositTx?: string;
    };
}) {
    return (
        <ul className="text-[length:var(--text-body-sm)] font-mono">
            {steps.agentAtomTx ? <li>✓ agent atom — {short(steps.agentAtomTx)}</li> : null}
            {steps.toolAtomTx ? <li>✓ tool atom — {short(steps.toolAtomTx)}</li> : null}
            {steps.tripleTx ? <li>✓ triple — {short(steps.tripleTx)}</li> : null}
            {steps.depositTx ? <li>✓ stake — {short(steps.depositTx)}</li> : null}
        </ul>
    );
}

function ResultLine({
    label,
    tx,
    note,
}: {
    label: string;
    tx?: string;
    note?: string;
}) {
    return (
        <p className="font-mono text-[length:var(--text-body-sm)] mb-1">
            <span className="text-[color:var(--color-fg-60)]">{label}</span>
            {note ? (
                <span className="ml-2 text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-fg-40)]">
                    {note}
                </span>
            ) : null}
            {tx ? (
                <>
                    {"  "}
                    <a
                        href={`${deployments.chain.explorerUrl}/tx/${tx}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[color:var(--color-accent)]"
                    >
                        {short(tx)} ↗
                    </a>
                </>
            ) : null}
        </p>
    );
}

function short(s: string): string {
    return `${s.slice(0, 8)}…${s.slice(-6)}`;
}
